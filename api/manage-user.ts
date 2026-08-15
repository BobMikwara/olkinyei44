// POST /api/manage-user
//
// Vercel serverless function (Edge runtime) for privileged staff actions:
// suspend, reactivate, delete, set_role. Service-role key stays server-side.
// The Root Super Admin profile can never be altered through this API.

import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Canonical values only.
const ROOT_SCOPE = new Set(["root_super_admin"]);
const ALLOWED_ROLES = new Set(["super_admin", "content_manager", "editor", "reservation_manager", "marketing", "finance"]);
const ALLOWED_ACTIONS = new Set(["suspend", "reactivate", "delete", "set_role"]);

const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 30;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("manage-user misconfiguration: missing Supabase environment variables");
    return json(500, { error: "Service unavailable" });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (isRateLimited(ip)) {
    console.warn(`manage-user rate limited ip=${ip}`);
    return json(429, { error: "Too many requests. Try again later." });
  }

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json(401, { error: "Authentication required" });
  const callerToken = authorization.slice("Bearer ".length).trim();
  if (!callerToken) return json(401, { error: "Authentication required" });

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: callerData, error: callerError } = await anonClient.auth.getUser(callerToken);
  const caller = callerData?.user;
  if (callerError || !caller) return json(401, { error: "Authentication required" });

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("id, role, status, is_root")
    .eq("id", caller.id)
    .maybeSingle();

  const callerIsRoot = Boolean(callerProfile?.is_root) || ROOT_SCOPE.has(String(callerProfile?.role ?? ""));
  // Suspension, reactivation, deletion, and role changes belong to the Root
  // Super Admin only.
  if (!callerProfile || callerProfile.status !== "active" || !callerIsRoot) {
    return json(403, { error: "Only the Root Super Admin can manage users" });
  }

  let body: { action?: string; userId?: string; role?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: "Invalid request" });
  }

  const action = String(body.action ?? "");
  const userId = String(body.userId ?? "");
  const role = body.role ? String(body.role) : undefined;

  if (!ALLOWED_ACTIONS.has(action) || !userId) return json(400, { error: "Invalid request" });
  if (action === "set_role" && (!role || !ALLOWED_ROLES.has(role))) return json(400, { error: "Unsupported role" });
  if (userId === caller.id && (action === "delete" || action === "suspend")) {
    return json(400, { error: "You cannot perform that action on your own account" });
  }

  const { data: target } = await adminClient
    .from("profiles")
    .select("id, email, role, is_root")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return json(404, { error: "User not found" });

  // The Root Super Admin is immutable through the API (database triggers
  // enforce this as well for direct SQL access).
  if (Boolean(target.is_root) || ROOT_SCOPE.has(String(target.role ?? ""))) {
    return json(403, { error: "The Root Super Admin cannot be modified" });
  }
  if (action === "delete" && target.role === "super_admin" && !callerIsRoot) {
    return json(403, { error: "Only the Root Super Admin can delete Super Admin accounts" });
  }
  if (action === "set_role" && role === "super_admin" && !callerIsRoot) {
    return json(403, { error: "Only the Root Super Admin can promote Super Admin accounts" });
  }

  const timestamp = new Date().toISOString();
  const audit = (actionName: string, outcome: string) =>
    adminClient.from("audit_logs").insert({
      user_id: caller.id,
      action: actionName,
      target: "user",
      target_id: userId,
      outcome,
      ip_address: ip === "unknown" ? null : ip,
    });

  try {
    switch (action) {
      case "suspend": {
        const { error } = await adminClient.from("profiles").update({ status: "suspended", updated_at: timestamp }).eq("id", userId);
        if (error) throw error;
        await adminClient.auth.admin.signOut(userId);
        await audit("user.suspended", "success");
        return json(200, { ok: true });
      }
      case "reactivate": {
        const { error } = await adminClient.from("profiles").update({ status: "active", updated_at: timestamp }).eq("id", userId);
        if (error) throw error;
        await audit("user.reactivated", "success");
        return json(200, { ok: true });
      }
      case "delete": {
        const { error: softError } = await adminClient.from("profiles").update({ status: "deleted", updated_at: timestamp }).eq("id", userId);
        if (softError) throw softError;
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
        if (deleteError) {
          console.error(`manage-user admin.deleteUser failed user=${userId}:`, deleteError.message);
          await audit("user.deleted", "failure");
          return json(500, { error: "Service unavailable" });
        }
        await audit("user.deleted", "success");
        return json(200, { ok: true });
      }
      case "set_role": {
        const { error } = await adminClient.from("profiles").update({ role: role!, updated_at: timestamp }).eq("id", userId);
        if (error) throw error;
        await audit("user.role_changed", "success");
        return json(200, { ok: true });
      }
    }
  } catch (error) {
    console.error(`manage-user action=${action} failed:`, error instanceof Error ? error.message : error);
    return json(500, { error: "Service unavailable" });
  }

  return json(400, { error: "Invalid request" });
}
