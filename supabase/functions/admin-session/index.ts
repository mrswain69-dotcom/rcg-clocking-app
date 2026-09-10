import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type Role = "owner" | "admin" | "developer" | "user";

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function validTime(value: string) {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply({ error: "Service configuration is missing." }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "Authentication required." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return reply({ error: "Authentication failed." }, 401);

  const { data: actor } = await admin.from("profiles").select("id,role,is_active,archived_at").eq("user_id", userData.user.id).maybeSingle();
  if (!actor || !actor.is_active || actor.archived_at || !["owner", "admin", "developer"].includes(actor.role as Role)) {
    return reply({ error: "Administrator access required." }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid request." }, 400); }
  const action = String(body.action ?? "");
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 3) return reply({ error: "A reason for the manual attendance change is required." }, 400);

  async function audit(auditAction: string, targetProfileId: string | null, targetSessionId: string | null, metadata: Record<string, unknown>) {
    await admin.from("audit_log").insert({
      performed_by_profile_id: actor.id,
      action: auditAction,
      target_profile_id: targetProfileId,
      target_session_id: targetSessionId,
      metadata,
    });
  }

  if (action === "add_session") {
    const profileId = String(body.profile_id ?? "");
    const clockInAt = String(body.clock_in_at ?? "");
    const clockOutAt = body.clock_out_at ? String(body.clock_out_at) : null;
    if (!profileId || !validTime(clockInAt) || (clockOutAt && !validTime(clockOutAt))) return reply({ error: "Valid profile and timestamps are required." }, 400);
    if (clockOutAt && new Date(clockOutAt) < new Date(clockInAt)) return reply({ error: "Clock-out cannot be before clock-in." }, 400);

    const { data: session, error } = await admin.from("sessions").insert({
      profile_id: profileId,
      clock_in_at: new Date(clockInAt).toISOString(),
      clock_out_at: clockOutAt ? new Date(clockOutAt).toISOString() : null,
      clock_in_method: "admin_override",
      clock_out_method: clockOutAt ? "admin_override" : null,
      notes: reason,
    }).select("id").single();
    if (error || !session) return reply({ error: "Unable to add the session. Check for an existing open session." }, 400);
    await audit("session_added", profileId, session.id, { reason, clock_in_at: clockInAt, clock_out_at: clockOutAt });
    return reply({ success: true, session_id: session.id });
  }

  const sessionId = String(body.session_id ?? "");
  if (!sessionId) return reply({ error: "Session is required." }, 400);
  const { data: existing } = await admin.from("sessions").select("id,profile_id,clock_in_at,clock_out_at,notes").eq("id", sessionId).maybeSingle();
  if (!existing) return reply({ error: "Session not found." }, 404);

  if (action === "close_session") {
    if (existing.clock_out_at) return reply({ error: "This session is already closed." }, 400);
    const now = new Date().toISOString();
    const { error } = await admin.from("sessions").update({ clock_out_at: now, clock_out_method: "admin_override", notes: reason }).eq("id", sessionId).is("clock_out_at", null);
    if (error) return reply({ error: "Unable to close the session." }, 400);
    await audit("session_closed_manually", existing.profile_id, sessionId, { reason, old: existing, clock_out_at: now });
    return reply({ success: true });
  }

  if (action === "correct_session") {
    const clockInAt = String(body.clock_in_at ?? "");
    const clockOutAt = body.clock_out_at ? String(body.clock_out_at) : null;
    if (!validTime(clockInAt) || (clockOutAt && !validTime(clockOutAt))) return reply({ error: "Valid timestamps are required." }, 400);
    if (clockOutAt && new Date(clockOutAt) < new Date(clockInAt)) return reply({ error: "Clock-out cannot be before clock-in." }, 400);

    const next = {
      clock_in_at: new Date(clockInAt).toISOString(),
      clock_out_at: clockOutAt ? new Date(clockOutAt).toISOString() : null,
      clock_in_method: "admin_override",
      clock_out_method: clockOutAt ? "admin_override" : null,
      notes: reason,
    };
    const { error } = await admin.from("sessions").update(next).eq("id", sessionId);
    if (error) return reply({ error: "Unable to correct the session. Check for an existing open session." }, 400);
    await audit("session_corrected", existing.profile_id, sessionId, { reason, old: existing, new: next });
    return reply({ success: true });
  }

  return reply({ error: "Unsupported action." }, 400);
});
