import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type AttendanceCategory = "one_off_volunteer" | "visitor";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function validateDevice(
  admin: ReturnType<typeof createClient>,
  deviceId: string,
  deviceToken: string,
) {
  if (!deviceId || !deviceToken) return null;
  const tokenHash = await sha256Hex(deviceToken);

  const { data: device } = await admin
    .from("kiosk_devices")
    .select("id,label,is_active,token_hash")
    .eq("id", deviceId)
    .maybeSingle();

  if (!device || !device.is_active || device.token_hash !== tokenHash) return null;

  await admin
    .from("kiosk_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id);

  return device;
}

function validCategory(value: string): value is AttendanceCategory {
  return value === "one_off_volunteer" || value === "visitor";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply({ error: "Service configuration is missing." }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }

  const deviceId = String(body.device_id ?? "");
  const deviceToken = String(body.device_token ?? "");
  const device = await validateDevice(admin, deviceId, deviceToken);
  if (!device) return reply({ error: "This device is not an active RCG kiosk." }, 403);

  const action = String(body.action ?? "");
  const category = String(body.category ?? "");
  if (!validCategory(category)) return reply({ error: "Invalid attendance type." }, 400);

  if (action === "search") {
    const name = String(body.name ?? "").trim();
    if (name.length < 2) return reply({ success: true, people: [] });

    const { data: people } = await admin
      .from("profiles")
      .select("id,full_name,organisation,attendance_category")
      .eq("profile_type", "attendance_only")
      .eq("attendance_category", category)
      .eq("is_active", true)
      .is("archived_at", null)
      .ilike("full_name", `%${name.replace(/[%_]/g, "")}%`)
      .order("full_name")
      .limit(6);

    return reply({ success: true, people: people ?? [] });
  }

  if (action !== "clock") return reply({ error: "Unsupported action." }, 400);

  const requestedProfileId = String(body.profile_id ?? "");
  const fullName = String(body.full_name ?? "").trim();
  const organisation = String(body.organisation ?? "").trim().slice(0, 160) || null;
  let profile: { id: string; full_name: string; attendance_category: string; organisation: string | null } | null = null;
  let createdProfile = false;

  if (requestedProfileId) {
    const { data } = await admin
      .from("profiles")
      .select("id,full_name,attendance_category,organisation,profile_type,is_active,archived_at")
      .eq("id", requestedProfileId)
      .maybeSingle();

    if (
      !data
      || data.profile_type !== "attendance_only"
      || data.attendance_category !== category
      || !data.is_active
      || data.archived_at
    ) {
      return reply({ error: "That attendance record is no longer available." }, 400);
    }

    profile = data;
  } else {
    if (fullName.length < 2 || fullName.length > 120) {
      return reply({ error: "Enter a name between 2 and 120 characters." }, 400);
    }

    const { data, error } = await admin
      .from("profiles")
      .insert({
        user_id: null,
        email: null,
        full_name: fullName,
        role: "user",
        profile_type: "attendance_only",
        attendance_category: category,
        organisation,
        can_use_kiosk: false,
        can_view_currently_on_site: false,
        can_receive_safety_alerts: false,
      })
      .select("id,full_name,attendance_category,organisation")
      .single();

    if (error || !data) return reply({ error: "Unable to create the attendance record." }, 400);
    profile = data;
    createdProfile = true;

    await admin.from("audit_log").insert({
      performed_by_profile_id: null,
      action: category === "visitor" ? "kiosk_visitor_created" : "kiosk_volunteer_created",
      target_profile_id: profile.id,
      metadata: {
        kiosk_device_id: device.id,
        kiosk_label: device.label,
        organisation,
      },
    });
  }

  const now = new Date().toISOString();
  const { data: openSession } = await admin
    .from("sessions")
    .select("id")
    .eq("profile_id", profile.id)
    .is("clock_out_at", null)
    .maybeSingle();

  let clockAction: "clock_in" | "clock_out";

  if (openSession) {
    clockAction = "clock_out";
    const { error } = await admin
      .from("sessions")
      .update({
        clock_out_at: now,
        clock_out_method: "kiosk",
        current_presence_status: "off_site",
        current_presence_status_at: now,
        current_presence_source: "kiosk_clock_out",
      })
      .eq("id", openSession.id)
      .is("clock_out_at", null);

    if (error) return reply({ error: "Could not clock out." }, 500);
  } else {
    clockAction = "clock_in";
    const { error } = await admin
      .from("sessions")
      .insert({
        profile_id: profile.id,
        clock_in_at: now,
        clock_in_method: "kiosk",
        clock_in_location_status: "kiosk_verified",
        clock_in_distance_m: 0,
        first_on_site_verified_at: now,
        first_on_site_verification_method: "kiosk",
        last_presence_check_at: now,
        last_presence_distance_m: 0,
        current_presence_status: "on_site",
        current_presence_status_at: now,
        current_presence_source: "kiosk",
      });

    if (error) return reply({ error: "Could not clock in." }, 500);
  }

  await admin.from("kiosk_events").insert({
    entered_identifier: profile.full_name,
    resolved_profile_id: profile.id,
    event_type: clockAction,
    device_label: device.label,
    kiosk_device_id: device.id,
    metadata: {
      source: "trusted_kiosk_attendance",
      attendance_category: category,
      organisation: profile.organisation,
      new_person_record: createdProfile,
    },
  });

  return reply({
    success: true,
    action: clockAction,
    full_name: profile.full_name,
    organisation: profile.organisation,
    profile_id: profile.id,
    created_profile: createdProfile,
    at: now,
  });
});
