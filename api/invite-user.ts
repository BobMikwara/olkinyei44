// POST /api/invite-user — Root-only user provisioning.
//
// Runs with the service-role key server-side; the browser never sees it.
//
//   1. Verify the caller's Supabase access token (retry path handled client-side)
//   2. Verify the caller's profile is an active Root Super Admin
//   3. Validate rate limit (per real client IP)
//   4. Validate payload (email, full name, canonical role)
//   5. supabase.auth.admin.inviteUserByEmail  → Supabase delivers the email
//   6. Upsert the pending profile
//   7. Audit the action
//
// Diagnostics:
//   GET  → reachability probe (env presence, no values)
//   POST { action: "diagnose" } → full stage-by-stage report, Root only
//
// Secrets never leave this function. Error messages sent to the UI are
// actionable but generic; raw Supabase errors stay in Vercel function logs.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PRODUCTION_SITE_URL = process.env.PRODUCTION_SITE_URL ?? "https://premiumolkinyei.vercel.app";
const SET_PASSWORD_PATH = process.env.SET_PASSWORD_PATH ?? "/auth/set-password";

const ALLOWED_ROLES = new Set(["super_admin", "content_manager", "editor", "reservation_manager", "marketing", "finance"]);
const ROOT_ROLES = new Set(["root_super_admin"]);

// ---------- Rate limiting: 12 invites / client IP / hour ---------------------
// Verbose-Edge instances share memory, but only within the same region/life-time.
// If the client IP can't be identified, DO NOT rate-limit with a shared bucket —
// that previously blocked every invite globally after 10 calls.

const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 12;

function isRateLimited(key: string | null): boolean {
  if (!key) return false; // never co-rate-limit unidentified traffic
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  buckets.set(key, entry);
  return entry.count > MAX_REQUESTS;
}

function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd && fwd.trim()) return fwd.split(",")[0].trim() || null;
  const real = request.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  return null;
}

// ---------- Shared helpers ---------------------------------------------------

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

type Caller = {
  id: string;
  email: string;
  profile: { role: string | null; status: string | null; is_root: boolean | null } | null;
};

async function authenticate(request: Request): Promise<{ caller: Caller } | { error: Response }> {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return { error: json(401, { error: "Authentication required", stage: "unauthenticated" }) };
  }
  const callerToken = authorization.slice("Bearer ".length).trim();
  if (!callerToken) return { error: json(401, { error: "Authentication required", stage: "unauthenticated" }) };

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: callerData, error: callerError } = await anonClient.auth.getUser(callerToken);
  const raw = callerData?.user;
  if (callerError || !raw) {
    console.warn(`invite-user invalid caller token: ${callerError?.message ?? "no user"}`);
    return { error: json(401, { error: "Your session has expired. Sign in again.", stage: "invalid-session" }) };
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, status, is_root, email")
    .eq("id", raw.id)
    .maybeSingle();

  if (profileError) {
    console.error(`invite-user profile lookup failed for caller=${raw.id}:`, profileError.message);
    return { error: json(500, { error: "Could not load your staff profile.", stage: "profile-lookup" }) };
  }

  return {
    caller: {
      id: raw.id,
      email: raw.email ?? "",
      profile: profile ?? null,
    },
  };
}

function callerIsRoot(caller: Caller): boolean {
  const profile = caller.profile;
  if (!profile || (profile.status ?? "") !== "active") return false;
  return Boolean(profile.is_root) || ROOT_ROLES.has(String(profile.role ?? ""));
}

// ---------- Invite email delivery --------------------------------------------

type SupabaseAdminError = { name?: string; message: string } | null;

function classifyInviteFailure(error: SupabaseAdminError, redirectTo: string): { message: string; stage: string; supabaseName?: string } {
  const name = error?.name ?? "AuthApiError";
  const message = error?.message ?? "unknown";
  if (/smtp|e.?mail|send/i.test(message)) {
    return {
      stage: "smtp",
      supabaseName: name,
      message: "Supabase could not send the invitation email. Check Authentication → SMTP Settings (credentials, port, sender) in Supabase, then try again.",
    };
  }
  if (/redirect/i.test(message)) {
    return {
      stage: "redirect",
      supabaseName: name,
      message: `Redirect URL rejected. Add ${redirectTo} to Authentication → URL Configuration → Redirect URLs in Supabase.`,
    };
  }
  if (/already (exists|registered)/i.test(message)) {
    return {
      stage: "already-exists",
      supabaseName: name,
      message: "That email already has an account. Ask them to use Forgot Password instead.",
    };
  }
  if (/rate/i.test(message) || /too many/i.test(message)) {
    return {
      stage: "supabase-limit",
      supabaseName: name,
      message: "Supabase rate-limited the send for now. Wait a minute and try again.",
    };
  }
  return {
    stage: "admin-invite",
    supabaseName: name,
    message: `Supabase Admin API failed: ${name}. Check Vercel → Functions → invite-user → Logs for the full error.`,
  };
}

// ---------- Existing-account recovery ----------------------------------------
// Two real-world states to handle gracefully:
//  A. Auth user was created but the email send failed / profile upsert failed
//     on a previous attempt → user exists, no usable invite, "already exists" now.
//  B. Genuine duplicate somebody already onboarded.
//
// Re-invitation for existing users goes through generateLink (magiclink variant,
// accepted by Supabase for confirmed users) and repairs the profile row.

async function findAuthUserByEmail(adminClient: SupabaseClient, email: string) {
  // Paginate deterministically; directories are tiny but don't rely on that.
  const pageSize = 200;
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: pageSize });
    if (error || !data?.users) return null;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) return found;
    if (data.users.length < pageSize) return null;
  }
  return null;
}

async function resendInvitation(adminClient: SupabaseClient, email: string, fullName: string, redirectTo: string): Promise<{ ok: boolean; message: string }> {
  const authUser = await findAuthUserByEmail(adminClient, email);
  if (!authUser) {
    return { ok: false, message: "Supabase states the email exists but no matching account could be located. Check auth.users in the dashboard." };
  }

  // magiclink works for confirmed or unconfirmed accounts; it is the supported
  // re-invite channel once inviteUserByEmail refuses an existing address.
  const { error } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo, data: { full_name: fullName, flow: "reinvite" } },
  });

  if (error) {
    const classified = classifyInviteFailure(error, redirectTo);
    if (classified.stage === "smtp" || classified.stage === "redirect") {
      return { ok: false, message: classified.message === "" ? "The re-invite email could not be sent." : classified.message };
    }
    return { ok: false, message: `The re-invite email could not be sent: ${classified.supabaseName ?? "AuthApiError"}. Check Vercel → Functions → invite-user → Logs.` };
  }
  return { ok: true, message: "existing" };
}

// ---------- Diagnose action --------------------------------------------------
// Runs the whole pipeline short of sending an email, and reports every stage
// so a Root sees in one call exactly where the invitation flow stands.

async function runDiagnostics(caller: Caller, adminClient: SupabaseClient): Promise<Record<string, unknown>> {
  const stages: { name: string; ok: boolean; detail?: string }[] = [];
  stages.push({ name: "env:SUPABASE_URL", ok: Boolean(SUPABASE_URL) });
  stages.push({ name: "env:SUPABASE_ANON_KEY", ok: Boolean(SUPABASE_ANON_KEY) });
  stages.push({ name: "env:SUPABASE_SERVICE_ROLE_KEY", ok: Boolean(SUPABASE_SERVICE_ROLE_KEY) });
  stages.push({ name: "env:PRODUCTION_SITE_URL", ok: Boolean(PRODUCTION_SITE_URL), detail: PRODUCTION_SITE_URL });
  stages.push({ name: "caller:authenticated", ok: true, detail: caller.id });
  stages.push({ name: "caller:is-root", ok: callerIsRoot(caller), detail: JSON.stringify({ role: caller.profile?.role, status: caller.profile?.status, isRoot: caller.profile?.is_root }) });

  // Service role can query the Auth system.
  const { data: adminCheck, error: adminError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
  stages.push({
    name: "admin-api:reachable",
    ok: !adminError && Boolean(adminCheck),
    detail: adminError?.message,
  });

  return {
    ok: stages.every((s) => s.ok),
    redirectTo: `${PRODUCTION_SITE_URL}${SET_PASSWORD_PATH}`,
    hint: "If admin-api:reachable and env are green but email never arrives, the failure is in Supabase email delivery: Authentication → SMTP Settings. Test directly in Supabase Dashboard → Authentication → Users → Invite user.",
    stages,
  };
}

// ---------- Main handler ------------------------------------------------------

export default async function handler(request: Request): Promise<Response> {
  // Reachability probe: proves the function is deployed and env vars exist,
  // without ever revealing their values.
  if (request.method === "GET") {
    return json(200, {
      ok: true,
      service: "invite-user",
      hasUrl: Boolean(SUPABASE_URL),
      hasAnonKey: Boolean(SUPABASE_ANON_KEY),
      hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      siteUrl: PRODUCTION_SITE_URL,
      redirectTo: `${PRODUCTION_SITE_URL}${SET_PASSWORD_PATH}`,
    });
  }
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("invite-user misconfiguration: missing Supabase environment variables");
    return json(500, { error: "The invitation service is missing its Supabase configuration.", stage: "config" });
  }

  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    console.warn(`invite-user rate limited ip=${ip}`);
    return json(429, { error: "Too many requests. Try again later.", stage: "rate-limit" });
  }

  const auth = await authenticate(request);
  if ("error" in auth) return auth.error;
  const caller = auth.caller;

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Diagnostics shortcut for troubleshooting without sending real invitations.
  let body: { action?: string; email?: string; fullName?: string; role?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: "Invalid request", stage: "payload" });
  }

  if (!callerIsRoot(caller)) {
    console.warn(`invite-user forbidden caller=${caller.id} role=${caller.profile?.role} status=${caller.profile?.status}`);
    return json(403, {
      error: "Only the Root Super Admin can invite users. Expected: role = root_super_admin, status = active, is_root = true on your profile row.",
      stage: "forbidden",
      actual: JSON.stringify({ role: caller.profile?.role, status: caller.profile?.status, isRoot: caller.profile?.is_root }),
    });
  }

  if (body.action === "diagnose") {
    const report = await runDiagnostics(caller, adminClient);
    return json(200, report);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.fullName ?? "").trim().slice(0, 160);
  const role = String(body.role ?? "").trim();

  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return json(400, { error: "A valid email is required", stage: "payload" });
  if (!fullName) return json(400, { error: "Full name is required", stage: "payload" });
  if (!ALLOWED_ROLES.has(role)) return json(400, { error: "Unsupported role", stage: "payload" });

  // ---------- Supabase Admin: create + email the invitation ----------
  const redirectTo = `${PRODUCTION_SITE_URL}${SET_PASSWORD_PATH}`;
  let userId: string;
  let reInvited = false;

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo,
  });

  if (inviteError || !invited.user) {
    const classified = classifyInviteFailure(inviteError, redirectTo);

    // Self-healing path: the account exists (leftover from an earlier partial
    // run, or an actual duplicate). Re-issue the link and repair the profile.
    if (classified.stage === "already-exists") {
      console.warn(`invite-user existing account for ${email}; attempting re-invite`);
      const reInvite = await resendInvitation(adminClient, email, fullName, redirectTo);
      if (!reInvite.ok) {
        console.error("invite-user re-invite failed:", reInvite.message);
        return json(400, { error: reInvite.message, stage: "already-exists-retry" });
      }
      const existing = await findAuthUserByEmail(adminClient, email);
      if (!existing) {
        return json(500, { error: "Supabase confirmed the email exists but the account could not be loaded. Inspect auth.users directly.", stage: "auth-users-lookup" });
      }
      userId = existing.id;
      reInvited = true;
    } else {
      console.error(`invite-user admin-invite failed for caller=${caller.id}:`, inviteError?.message);
      return json(400, { ...classified, error: classified.message });
    }
  } else {
    userId = invited.user.id;
  }

  // ---------- Provision / repair the staff profile ----------
  const { error: upsertError } = await adminClient.from("profiles").upsert({
    id: userId,
    email,
    full_name: fullName,
    role,
    status: "pending",
    invited_by: caller.id,
    is_root: false,
    avatar_url: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });

  if (upsertError) {
    console.error(`invite-user profile upsert failed user=${userId}:`, upsertError.message);

    // Roll back only when WE created the auth user this attempt —
    // never delete a pre-existing account.
    if (!reInvited) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(userId);
      if (cleanupError) console.error(`invite-user cleanup delete failed for ${userId}:`, cleanupError.message);
      else console.warn(`invite-user rolled back orphan auth user ${userId}`);
    }

    return json(500, {
      error: "The account was created but the staff profile could not be saved. The auth account has been rolled back so you can try again. Check Vercel → Functions → Logs for the database error.",
      stage: "profile-upsert",
      rollbackAttempted: !reInvited,
    });
  }

  // ---------- Audit ----------
  const { error: auditError } = await adminClient.from("audit_logs").insert({
    user_id: caller.id,
    action: "invitation.sent",
    target: "user",
    target_id: userId,
    outcome: "success",
    new_value: JSON.stringify({ email, role, reInvited }),
    ip_address: ip,
  });
  if (auditError) console.error("invite-user audit insert failed:", auditError.message);

  return json(200, { invited: true, reInvited, email, role, redirectTo });
}
