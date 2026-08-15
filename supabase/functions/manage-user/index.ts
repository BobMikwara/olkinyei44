// manage-user — privileged staff account operations, service-role only.
// Actions: suspend, reactivate, delete, set_role. Root-flagged profiles are
// protected at SQL level as well; this function refuses them unconditionally.

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const corsHeaders = { ...cors, "Content-Type": "application/json" };

const ADMIN_EMAILS = (Deno.env.get("ROOT_ADMIN_EMAILS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = request.headers.get("Authorization") ?? "";
  const callerClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: callerAuth } = await callerClient.auth.getUser();
  const caller = callerAuth.user;
  if (!caller) return json(401, { error: "Unauthenticated" });

  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role, is_root, status, email")
    .eq("id", caller.id)
    .single();

  const isRoot = (callerProfile?.is_root as boolean) || ADMIN_EMAILS.includes((caller.email ?? "").toLowerCase());
  if (callerProfile?.status && callerProfile.status !== "active") return json(403, { error: "Suspended" });
  if (!isRoot && callerProfile?.role !== "super_admin") return json(403, { error: "Only administrators can manage users" });

  const { action, userId, role } = await request.json() as { action: string; userId: string; role?: string };
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: target } = await admin.from("profiles").select("id, email, role, is_root").eq("id", userId).maybeSingle();
  if (!target) return json(404, { error: "User not found" });
  if (target.is_root) return json(403, { error: "The Root Super Admin cannot be modified" });

  const auditEntry = (outcome: string) => admin.from("audit_logs").insert({
    user_id: caller.id,
    action: `user.${action}`,
    target: "user",
    target_id: userId,
    outcome,
  });

  switch (action) {
    case "suspend": {
      await admin.from("profiles").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("id", userId);
      await admin.auth.admin.signOut(userId);
      await auditEntry("success");
      return json(200, { ok: true });
    }
    case "reactivate": {
      await admin.from("profiles").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", userId);
      await auditEntry("success");
      return json(200, { ok: true });
    }
    case "delete": {
      if (target.role === "super_admin" && !isRoot) return json(403, { error: "Only the Root Super Admin can delete Super Admin accounts" });
      await admin.from("profiles").update({ status: "deleted", updated_at: new Date().toISOString() }).eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
      await auditEntry("success");
      return json(200, { ok: true });
    }
    case "set_role": {
      const allowedRoles = ["super_admin", "content_manager", "booking_manager", "marketing_manager", "finance"];
      if (!role || !allowedRoles.includes(role)) return json(400, { error: "Unsupported role" });
      if (role === "super_admin" && !isRoot) return json(403, { error: "Only the Root Super Admin can promote Super Admin accounts" });
      await admin.from("profiles").update({ role, updated_at: new Date().toISOString() }).eq("id", userId);
      await auditEntry("success");
      return json(200, { ok: true });
    }
    default:
      return json(400, { error: "Unsupported action" });
  }
});
