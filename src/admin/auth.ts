// Production authentication adapter.
//
// The Vite frontend NEVER talks to Supabase Admin APIs or stores the service
// role key. Privileged operations go through Vercel serverless functions
// (/api/invite-user, /api/manage-user) which verify the caller's Supabase
// session server-side before touching auth.admin.
//
// Supabase Auth owns ALL invitation tokens, password tokens, email delivery,
// and session refresh. Nothing invitation-related lives in this app.

import { cloudUnavailableReason, supabase, hasCloudBackend } from "../lib/supabase";
import { API_ROUTES, ROLES, TABLES, type ProfileStatus } from "./constants";
import type { AdminUser, AuditEntry, Role } from "./types";

export { hasCloudBackend };

// ============ Structured auth instrumentation (development only) ============
// Every step of the lifecycle logs exactly where it is. Production bundles
// emit nothing; dev shows stage, code, and metadata.

export type AuthFailureCode =
  | "MOD_UNCONFIGURED"      // Supabase client could not build
  | "INVALID_CREDENTIALS"   // signInWithPassword rejected
  | "NO_AUTH_USER"          // session exists but auth.getUser found no user
  | "PROFILE_MISSING"       // profile row does not exist for auth user
  | "PROFILE_BLOCKED"       // profiles query errored (RLS / database)
  | "PROFILE_INACTIVE"      // status = pending / deleted
  | "PROFILE_SUSPENDED"     // status = suspended
  | "SESSION_EXPIRED"       // no session present / refresh failed
  | "NETWORK_ERROR"         // request could not reach Supabase
  | "SERVER_ERROR";         // anything else unexpected

type AuthStage =
  | "AUTH START" | "SIGN IN"
  | "SESSION FOUND" | "SESSION LOST" | "SESSION REFRESHED"
  | "PROFILE QUERY" | "PROFILE FOUND" | "PROFILE ERROR"
  | "ROLE VERIFIED" | "STATUS VERIFIED"
  | "LOGIN COMPLETE" | "LOGOUT COMPLETE"
  | "STAFF DIRECTORY" | "AUTH LISTENER";

function authTrace(stage: AuthStage, meta: Record<string, unknown> = {}): void {
  if (!import.meta.env.DEV) return;
  console.info(`[AUTH] ${stage}`, JSON.stringify(meta));
}

function authWarn(stage: AuthStage, code: AuthFailureCode, detail: unknown = undefined): void {
  if (!import.meta.env.DEV) return;
  console.warn(`[AUTH] ${stage} FAILED (${code})`, detail);
}

const FAILURE_MESSAGES: Record<AuthFailureCode, string> = {
  MOD_UNCONFIGURED: "Cloud authentication is not configured in this build.",
  INVALID_CREDENTIALS: "Invalid credentials. Check your email and password.",
  NO_AUTH_USER: "The session exists but no authenticated user was returned. Sign in again.",
  PROFILE_MISSING: "Signed in, but no staff profile matches this account. Contact the Root Super Admin.",
  PROFILE_BLOCKED: "The staff profile could not be loaded because of a database permission problem. Verify RLS policies in Supabase.",
  PROFILE_INACTIVE: "This account is not active yet. Open your invitation to finish setup.",
  PROFILE_SUSPENDED: "This account has been suspended. Contact your administrator.",
  SESSION_EXPIRED: "Your session has expired. Sign in again.",
  NETWORK_ERROR: "Could not reach the authentication service. Check your connection.",
  SERVER_ERROR: "Authentication failed unexpectedly. Check the browser console for details.",
};

// ============ Roles ============
// The database and the frontend share ONE vocabulary. There is deliberately no
// translation layer: supabase/role_canonicalization.sql migrates the database
// to these exact values, and profiles_role_check enforces them.
//
//   root · super_admin · content_manager · booking_manager
//   marketing_manager · finance

export type DbRole = Role;

/** Narrows an arbitrary database string to a known role. */
export function normalizeRole(role: string | null | undefined): Role {
  return ROLES.includes(role as Role) ? (role as Role) : "content_manager";
}

// ============ Profile mapping ============

/**
 * Exact shape of a `public.profiles` row. Column names mirror the database;
 * conversion to the camelCase {@link AdminUser} model happens in one place
 * ({@link profileToAdminUser}) so no other module touches snake_case.
 */
type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  status: ProfileStatus | null;
  avatar_url: string | null;
  invited_by: string | null;
  is_root: boolean | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

function profileToAdminUser(row: ProfileRow): AdminUser {
  const email = row.email ?? "";
  return {
    id: row.id,
    email,
    fullName: row.full_name ?? (email ? email.split("@")[0] : "Staff"),
    role: row.is_root ? "root" : normalizeRole(row.role),
    avatar: row.avatar_url ?? "",
    lastLogin: row.last_login_at ?? "",
    // `pending` is presented as "invited" in the CMS; every other value maps 1:1.
    status: row.status === "pending" ? "invited" : row.status === "suspended" ? "suspended" : "active",
    createdAt: row.created_at,
    invitedBy: row.invited_by ?? undefined,
    isRoot: row.is_root === true || row.role === "root",
  };
}

export type SessionUser = { user: AdminUser; sessionToken: string } | null;

// ============ Profile access ============

type ProfileResult =
  | { user: AdminUser; error: null }
  | { user: null; error: { code: AuthFailureCode; detail?: unknown } };

async function fetchOwnProfileDetailed(): Promise<ProfileResult> {
  if (!supabase) return { user: null, error: { code: "MOD_UNCONFIGURED" } };

  authTrace("PROFILE QUERY");
  const { data: auth, error: authUserError } = await supabase.auth.getUser();
  if (authUserError || !auth.user) {
    authWarn("PROFILE QUERY", "NO_AUTH_USER", authUserError?.message);
    return { user: null, error: { code: "NO_AUTH_USER", detail: authUserError?.message } };
  }

  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    // RLS denial and database errors land here. Not a missing profile row.
    authWarn("PROFILE ERROR", "PROFILE_BLOCKED");
    return { user: null, error: { code: "PROFILE_BLOCKED", detail: { message: error.message, code: (error as { code?: string })?.code, details: (error as { details?: string })?.details ?? undefined } } };
  }
  if (!data) {
    authWarn("PROFILE QUERY", "PROFILE_MISSING", { authUserId: auth.user.id });
    return { user: null, error: { code: "PROFILE_MISSING", detail: { authUserId: auth.user.id } } };
  }

  authTrace("PROFILE FOUND", { id: data.id, role: data.role, status: data.status, isRoot: data.is_root });
  return { user: profileToAdminUser(data as ProfileRow), error: null };
}



/** Lists every staff profile. RLS restricts this to privileged accounts. */
export async function authListProfiles(): Promise<AdminUser[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) authWarn("STAFF DIRECTORY", "PROFILE_BLOCKED", error.message);
    return null;
  }
  return (data as ProfileRow[]).map(profileToAdminUser);
}

// ============ Sign in / out ============

export type SignInResult =
  | { ok: true; user: AdminUser; sessionToken: string; code: null }
  | { ok: false; code: AuthFailureCode; message: string };

export async function authSignIn(email: string, password: string): Promise<SignInResult> {
  if (!supabase) return { ok: false, code: "MOD_UNCONFIGURED", message: cloudUnavailableReason() };

  authTrace("AUTH START", { email: email.trim().toLowerCase() });
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.session || !data.user) {
    authWarn("SIGN IN", "INVALID_CREDENTIALS", error?.message);
    void writeAudit(null, "login.attempt", "auth", { outcome: "failure", reason: "invalid-credentials" });
    return { ok: false, code: "INVALID_CREDENTIALS", message: FAILURE_MESSAGES.INVALID_CREDENTIALS };
  }
  authTrace("SIGN IN", { authUserId: data.user.id });

  const profileResult = await fetchOwnProfileDetailed();
  if (!profileResult.user) {
    // Sign out so a broken profile can't sit half-authenticated.
    await supabase.auth.signOut();
    void writeAudit(data.user.id, "login.attempt", "auth", { outcome: "failure", reason: profileResult.error.code });
    return { ok: false, code: profileResult.error.code, message: FAILURE_MESSAGES[profileResult.error.code] };
  }
  const profile = profileResult.user;

  if (profile.status === "suspended") {
    await supabase.auth.signOut();
    void writeAudit(data.user.id, "login.attempt", "auth", { outcome: "failure", reason: "suspended" });
    return { ok: false, code: "PROFILE_SUSPENDED", message: FAILURE_MESSAGES.PROFILE_SUSPENDED };
  }
  if (profile.status !== "active") {
    await supabase.auth.signOut();
    void writeAudit(data.user.id, "login.attempt", "auth", { outcome: "failure", reason: `status-${profile.status}` });
    return { ok: false, code: "PROFILE_INACTIVE", message: FAILURE_MESSAGES.PROFILE_INACTIVE };
  }

  authTrace("ROLE VERIFIED", { role: profile.role, isRoot: profile.isRoot });
  authTrace("STATUS VERIFIED", { status: profile.status });
  void writeAudit(data.user.id, "login.success", "auth", { outcome: "success", targetId: profile.id });
  authTrace("LOGIN COMPLETE", { email: profile.email });
  return { ok: true, user: profile, sessionToken: data.session.access_token, code: null };
}

export async function authSignOut(userLogId?: string): Promise<void> {
  if (!supabase) return;
  void writeAudit(userLogId ?? null, "logout", "auth", { outcome: "success" });
  await supabase.auth.signOut();
  authTrace("LOGOUT COMPLETE");
}

// ============ Sessions ============

export type SessionFetchResult =
  | { user: AdminUser; sessionToken: string; error: null }
  | { user: null; sessionToken: null; error: { code: AuthFailureCode; detail?: unknown } };

export async function authGetSessionUserDetailed(): Promise<SessionFetchResult> {
  if (!supabase) return { user: null, sessionToken: null, error: { code: "MOD_UNCONFIGURED" } };
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    authTrace("SESSION LOST");
    return { user: null, sessionToken: null, error: { code: "SESSION_EXPIRED" } };
  }
  authTrace("SESSION FOUND", { userId: data.session.user.id });
  const profileResult = await fetchOwnProfileDetailed();
  if (!profileResult.user) {
    return { user: null, sessionToken: null, error: profileResult.error };
  }
  if (profileResult.user.status !== "active") {
    return { user: null, sessionToken: null, error: { code: profileResult.user.status === "suspended" ? "PROFILE_SUSPENDED" : "PROFILE_INACTIVE" } };
  }
  return { user: profileResult.user, sessionToken: data.session.access_token, error: null };
}

export async function authGetSessionUser(): Promise<SessionUser> {
  const result = await authGetSessionUserDetailed();
  return result.user && result.sessionToken ? { user: result.user, sessionToken: result.sessionToken } : null;
}

export type AuthListenerPayload =
  | { kind: "signed-out"; event: string }
  | { kind: "session"; event: string; user: AdminUser; sessionToken: string }
  | { kind: "inactive"; event: string; code: AuthFailureCode };

// The listener NEVER logs somebody out on its own. It *reports* what happened;
// callers decide. A transient profile fetch error must not kill a valid
// session — that was the production logout-follows-login failure.
export function authOnStateChange(callback: (payload: AuthListenerPayload, event: string) => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    authTrace("AUTH LISTENER", { event, hasSession: Boolean(session) });
    void (async () => {
      if (event === "SIGNED_OUT" || (!session && event !== "INITIAL_SESSION")) {
        callback({ kind: "signed-out", event }, event);
        return;
      }
      if (event === "PASSWORD_RECOVERY") return; // recovery screens handle it
      if (!session) return; // pass-through for initial nulls

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        authTrace("SESSION REFRESHED", { event });
        const profileResult = await fetchOwnProfileDetailed();
        if (profileResult.user && profileResult.user.status === "active") {
          callback({ kind: "session", event, user: profileResult.user, sessionToken: session.access_token }, event);
          return;
        }
        if (!profileResult.user) {
          // Fetch or status failed — report it, do not declare signed-out.
          callback({ kind: "inactive", event, code: profileResult.error.code }, event);
          return;
        }
        callback({
          kind: "inactive",
          event,
          code: profileResult.user.status === "suspended" ? "PROFILE_SUSPENDED" : "PROFILE_INACTIVE",
        }, event);
      }
    })();
  });
  return () => data.subscription.unsubscribe();
}

// ============ Privileged operations → Vercel serverless API ============
// Authorization carries the caller's *user* access token; the service role
// key never exists in this bundle.

async function currentAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function postPrivileged(path: string, payload: Record<string, unknown>, accessToken: string): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
}

async function callPrivilegedApi(path: string, payload: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> {
  let token = await currentAccessToken();
  if (!token) return { ok: false, message: "Sign in again to continue." };

  try {
    let response = await postPrivileged(path, payload, token);

    // Session tokens expire sooner than users think. One transparent refresh
    // + retry handles the most common production failure behind 401s.
    if (response.status === 401 && supabase) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      const refreshedToken = refreshed.session?.access_token;
      if (refreshedToken) {
        token = refreshedToken;
        response = await postPrivileged(path, payload, token);
      }
    }

    if (!response.ok) {
      let message = "That action is not allowed right now.";
      try {
        const data = (await response.json()) as { error?: string; stage?: string; supabaseName?: string; actual?: string };
        if (data.error) message = data.error;
        if (import.meta.env.DEV) {
          console.warn(`[Olkinyei] ${path} failed`, {
            stage: data.stage ?? "unknown",
            supabaseName: data.supabaseName,
            actual: data.actual,
            status: response.status,
          });
        }
      } catch {
        message = response.status === 404
          ? "The invitation service is not deployed on this site. Deploy the /api serverless functions."
          : `The service returned an unexpected response (${response.status}). Check Vercel → Functions → Logs.`;
      }
      return { ok: false, message };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not reach the invitation service. Check your connection and that the site was fully deployed." };
  }
}

// ============ Invitations (server-only) ============

export async function authInviteUser(payload: { email: string; fullName: string; role: DbRole }): Promise<{ ok: boolean; message?: string }> {
  return callPrivilegedApi(API_ROUTES.inviteUser, payload);
}

// ============ User management (server-only) ============

export async function authManageUser(action: "suspend" | "reactivate" | "delete" | "set_role", payload: { userId: string; role?: DbRole }): Promise<{ ok: boolean; message?: string }> {
  return callPrivilegedApi(API_ROUTES.manageUser, { action, ...payload });
}

// ============ Password recovery / updates ============

export async function authRequestPasswordReset(email: string): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: cloudUnavailableReason() };
  const redirectTo = `${window.location.origin}/auth/set-password`;
  // Same response whether or not the account exists: prevents enumeration.
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
  return { ok: true };
}

export async function authSetPasswordAfterRecovery(newPassword: string): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: cloudUnavailableReason() };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: "This link has expired. Request a new one." };
  void writeAudit(null, "password.reset.completed", "auth", { outcome: "success" });
  return { ok: true };
}

export async function authChangePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: cloudUnavailableReason() };
  const { data: auth } = await supabase.auth.getUser();
  const email = auth?.user?.email;
  if (!email) return { ok: false, message: "You are not signed in." };
  // Re-verify the current password server-side before allowing rotation.
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (verifyError) return { ok: false, message: "Current password is incorrect." };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: "Choose a stronger password." };
  void writeAudit(auth?.user?.id ?? null, "password.change", "auth", { outcome: "success" });
  return { ok: true };
}

// ============ Audit logging ============

export async function writeAudit(
  actorId: string | null,
  action: string,
  target: string,
  options: { targetId?: string; outcome?: "success" | "failure"; reason?: string; oldValue?: unknown; newValue?: unknown } = {},
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from(TABLES.auditLogs).insert({
      user_id: actorId,
      action,
      target,
      target_id: options.targetId ?? null,
      outcome: options.outcome ?? "success",
      reason: options.reason ?? null,
      old_value: options.oldValue ? JSON.stringify(options.oldValue) : null,
      new_value: options.newValue ? JSON.stringify(options.newValue) : null,
      browser: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : null,
    });
  } catch { /* audit must never block user workflows */ }
}

// ============ Auth email link handling ============
// Supabase emailed links arrive at configured redirect paths. The invite flow
// carries token_hash + type as query params (PKCE); recovery links may carry
// either location. verifyOtp consumes them to establish the session.

export type LinkFlow = "invite" | "recovery" | null;

function readLinkParams(): { tokenHash: string | null; type: LinkFlow; pathname: string } {
  const pathname = window.location.pathname.replace(/\/$/, "");
  const search = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const tokenHash = search.get("token_hash") ?? hashParams.get("token_hash");
  const typeParam = search.get("type") ?? hashParams.get("type");
  const type: LinkFlow = typeParam === "invite" ? "invite" : typeParam === "recovery" ? "recovery" : null;
  return { tokenHash, type, pathname };
}

export function isAuthPath(): boolean {
  return window.location.pathname.startsWith("/auth");
}

export async function consumeAuthCallback(): Promise<{ consumed: boolean; needsPassword: boolean; message?: string }> {
  if (!supabase || !isAuthPath()) return { consumed: false, needsPassword: false };
  const { tokenHash, type } = readLinkParams();
  if (!tokenHash || !type) {
    // PKCE-code style links: supabase-js may already have exchanged them.
    return { consumed: true, needsPassword: true };
  }
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    return { consumed: true, needsPassword: false, message: "This link has expired or was already used. Request a new one." };
  }
  void writeAudit(null, `${type}.accepted`, "auth", { outcome: "success" });
  return { consumed: true, needsPassword: true };
}

export function clearAuthQuery(): void {
  window.history.replaceState({}, document.title, window.location.pathname);
}

export type { AuditEntry };
