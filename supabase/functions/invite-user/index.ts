// invite-user — Root/Super Admin only user provisioning.
// Runs with the service-role key server-side; the browser never sees it.
// Workflow: verify caller -> enforce Root requester for super_admin roles ->
// Supabase Auth admin invite (sends the secure email) -> upsert profile.

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
  const siteUrl = Deno.env.get("SITE_URL") ?? Deno.env.get("PUBLIC_SITE_URL") ?? "";

  const authHeader = request.headers.get("Authorization") ?? "";
  const callerClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: callerAuth } = await callerClient.auth.getUser();
  const caller = callerAuth.user;
  if (!caller) return json(401, { error: "Unauthenticated" });

  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role, is_root, status")
    .eq("id", caller.id)
    .single();

  const isRoot = (callerProfile?.is_root as boolean) || ADMIN_EMAILS.includes((caller.email ?? "").toLowerCase());
  const isPrivileged = isRoot || callerProfile?.role === "super_admin";
  if (callerProfile?.status && callerProfile.status !== "active") return json(403, { error: "Suspended" });
  if (!isPrivileged) return json(403, { error: "Only administrators can invite users" });

  const { email, fullName, role } = await request.json() as { email: string; fullName: string; role: string };

  if (!/^\S+@\S+\.\S+$/.test(email)) return json(400, { error: "Valid email required" });
  const allowedRoles = ["super_admin", "content_manager", "booking_manager", "marketing_manager", "finance"];
  if (!allowedRoles.includes(role)) return json(400, { error: "Unsupported role" });
  if (role === "super_admin" && !isRoot) return json(403, { error: "Only the Root Super Admin can create Super Admin accounts" });

  const admin = createClient(supabaseUrl, serviceKey);

  // Supabase sends the single-use, expiring invitation email and creates the
  // pending user server-side with a secure token — never visible to clients.
  const redirectTo = `${siteUrl}/#/admin/setup`;
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo,
  });

  if (inviteError || !invited.user) {
    return json(400, { error: inviteError?.message ?? "Invitation failed" });
  }

  // Profile row mirrors identity + RBAC for the CMS. RLS on `profiles` still
  // governs access; this upsert runs with the service role for provisioning.
  await admin.from("profiles").upsert({
    id: invited.user.id,
    email,
    full_name: fullName,
    role,
    status: "pending",
    invited_by: caller.id,
    is_root: false,
  }, { onConflict: "id" });

  await admin.from("audit_logs").insert({
    user_id: caller.id,
    action: "invitation.sent",
    target: "user",
    target_id: invited.user.id,
    outcome: "success",
    new_value: email,
  });

  return json(200, { invited: true });
});
