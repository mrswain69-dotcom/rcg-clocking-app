import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type Role = "owner" | "admin" | "developer" | "user";

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function validTime(value: string) {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function futureAttendance(value: string) {
  return new Date(value).getTime() > Date.now() + 5 * 60_000;
}

function appendAdminNote(existing: string | null, label: string, reason: string) {
  const note = `${label}: ${reason}`;
  return existing?.trim() ? `${existing.trim()}\n${note}` : note;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply({ error: "Service configuration is missing." }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply({ error: "Authentication required." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return reply({ error: "Authentication failed." }, 401);

  const { data: actor } = await admin
    .from("profiles")
    .select("id,role,is_active,archived_at")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!actor || !actor.is_active || actor.archived_at || !["owner", "admin", "developer"].includes(actor.role as Role)) {
    return reply({ error: "Administrator access required." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }

  const action = String(body.action ?? "");
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 3) {
    return reply({ error: "A reason for the manual attendance change is required." }, 400);
  }

  async function audit(
    auditAction: string,
    targetProfileId: string | null,
    targetSessionId: string | null,
    metadata: Record<string, unknown>,
  ) {
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

    if (!profileId || !validTime(clockInAt) || (clockOutAt && !validTime(clockOutAt))) {
      return reply({ error: "Valid person and timestamps are required." }, 400);
    }
    if (futureAttendance(clockInAt) || (clockOutAt && futureAttendance(clockOutAt))) {
      return reply({ error: "Attendance times cannot be in the future." }, 400);
    }
    if (clockOutAt && new Date(clockOutAt) < new Date(clockInAt)) {
      return reply({ error: "Clock-out cannot be before clock-in." }, 400);
    }

    const { data: target } = await admin
      .from("profiles")
      .select("id,full_name,profile_type,is_active,archived_at")
      .eq("id", profileId)
      .maybeSingle();

    if (!target || !target.is_active || target.archived_at) {
      return reply({ error: "The selected person is not active." }, 400);
    }

    const inIso = new Date(clockInAt).toISOString();
    const outIso = clockOutAt ? new Date(clockOutAt).toISOString() : null;

    const { data: session, error } = await admin
      .from("sessions")
      .insert({
        profile_id: profileId,
        clock_in_at: inIso,
        clock_out_at: outIso,
        clock_in_method: "admin_override",
        clock_out_method: outIso ? "admin_override" : null,
        notes: `Admin entry: ${reason}`,
        clock_in_location_status: "location_unavailable",
        clock_in_distance_m: null,
        clock_in_accuracy_m: null,
        first_on_site_verified_at: null,
        first_on_site_verification_method: null,
        last_presence_check_at: null,
        last_presence_distance_m: null,
        last_presence_accuracy_m: null,
        current_presence_status: outIso ? "off_site" : "unverified",
        current_presence_status_at: outIso ?? inIso,
        current_presence_source: "admin_override",
      })
      .select("id")
      .single();

    if (error || !session) {
      return reply({ error: "Unable to add the session. Check for an existing open session." }, 400);
    }

    await audit("session_added_manually", profileId, session.id, {
      reason,
      person_name: target.full_name,
      profile_type: target.profile_type,
      clock_in_at: inIso,
      clock_out_at: outIso,
      location_verification: "not_available_admin_entry",
      method: "admin_override",
    });

    return reply({ success: true, session_id: session.id });
  }

  const sessionId = String(body.session_id ?? "");
  if (!sessionId) return reply({ error: "Session is required." }, 400);

  const { data: existing } = await admin
    .from("sessions")
    .select("id,profile_id,clock_in_at,clock_out_at,clock_in_method,clock_out_method,notes,clock_in_location_status,clock_in_distance_m,clock_in_accuracy_m,first_on_site_verified_at,first_on_site_verification_method,last_presence_check_at,last_presence_distance_m,last_presence_accuracy_m,current_presence_status,current_presence_status_at,current_presence_source")
    .eq("id", sessionId)
    .maybeSingle();

  if (!existing) return reply({ error: "Session not found." }, 404);

  if (action === "close_session") {
    if (existing.clock_out_at) return reply({ error: "This session is already closed." }, 400);

    const requested = body.clock_out_at ? String(body.clock_out_at) : new Date().toISOString();
    if (!validTime(requested)) return reply({ error: "Enter a valid clock-out date and time." }, 400);
    if (futureAttendance(requested)) return reply({ error: "Clock-out cannot be in the future." }, 400);

    const outIso = new Date(requested).toISOString();
    if (new Date(outIso) < new Date(existing.clock_in_at)) {
      return reply({ error: "Clock-out cannot be before clock-in." }, 400);
    }

    const next = {
      clock_out_at: outIso,
      clock_out_method: "admin_override",
      current_presence_status: "off_site",
      current_presence_status_at: outIso,
      current_presence_source: "admin_override_clock_out",
      notes: appendAdminNote(existing.notes, "Admin clock-out", reason),
    };

    const { error } = await admin
      .from("sessions")
      .update(next)
      .eq("id", sessionId)
      .is("clock_out_at", null);

    if (error) return reply({ error: "Unable to close the session." }, 400);

    await audit("session_closed_manually", existing.profile_id, sessionId, {
      reason,
      old: existing,
      new: next,
      method: "admin_override",
    });

    return reply({ success: true });
  }

  if (action === "correct_session") {
    const clockInAt = String(body.clock_in_at ?? "");
    const clockOutAt = body.clock_out_at ? String(body.clock_out_at) : null;

    if (!validTime(clockInAt) || (clockOutAt && !validTime(clockOutAt))) {
      return reply({ error: "Valid timestamps are required." }, 400);
    }
    if (futureAttendance(clockInAt) || (clockOutAt && futureAttendance(clockOutAt))) {
      return reply({ error: "Attendance times cannot be in the future." }, 400);
    }
    if (clockOutAt && new Date(clockOutAt) < new Date(clockInAt)) {
      return reply({ error: "Clock-out cannot be before clock-in." }, 400);
    }

    const inIso = new Date(clockInAt).toISOString();
    const outIso = clockOutAt ? new Date(clockOutAt).toISOString() : null;
    const clockInChanged = Math.abs(new Date(inIso).getTime() - new Date(existing.clock_in_at).getTime()) > 1000;

    const next: Record<string, unknown> = {
      clock_in_at: inIso,
      clock_out_at: outIso,
      clock_out_method: outIso ? "admin_override" : null,
      notes: appendAdminNote(existing.notes, "Admin correction", reason),
      current_presence_status: outIso ? "off_site" : existing.current_presence_status,
      current_presence_status_at: outIso ?? existing.current_presence_status_at,
      current_presence_source: outIso ? "admin_override_clock_out" : existing.current_presence_source,
    };

    if (clockInChanged) {
      Object.assign(next, {
        clock_in_method: "admin_override",
        clock_in_location_status: "location_unavailable",
        clock_in_distance_m: null,
        clock_in_accuracy_m: null,
        first_on_site_verified_at: null,
        first_on_site_verification_method: null,
        last_presence_check_at: null,
        last_presence_distance_m: null,
        last_presence_accuracy_m: null,
        current_presence_status: outIso ? "off_site" : "unverified",
        current_presence_status_at: outIso ?? inIso,
        current_presence_source: "admin_override",
      });
    }

    const { error } = await admin.from("sessions").update(next).eq("id", sessionId);
    if (error) {
      return reply({ error: "Unable to correct the session. Check for an existing open session." }, 400);
    }

    await audit("session_corrected", existing.profile_id, sessionId, {
      reason,
      old: existing,
      new: next,
      location_verification_invalidated: clockInChanged,
    });

    return reply({ success: true });
  }

  return reply({ error: "Unsupported action." }, 400);
});
