import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
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
  supabase: ReturnType<typeof createClient>,
  deviceId: string,
  deviceToken: string,
) {
  if (!deviceId || !deviceToken) return null;
  const tokenHash = await sha256Hex(deviceToken);

  const { data: device } = await supabase
    .from("kiosk_devices")
    .select("id,label,is_active,token_hash")
    .eq("id", deviceId)
    .maybeSingle();

  if (!device || !device.is_active || device.token_hash !== tokenHash) return null;

  await supabase
    .from("kiosk_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id);

  return device;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json({ error: "Service configuration is missing." }, 500);

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: {
    action?: string;
    device_id?: string;
    device_token?: string;
    identifier?: string;
    pin?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const device = await validateDevice(
    supabase,
    String(body.device_id ?? ""),
    String(body.device_token ?? ""),
  );

  if (!device) {
    return json({ error: "This device is not registered as an active RCG kiosk." }, 403);
  }

  if (body.action === "device_status") {
    return json({
      success: true,
      device_id: device.id,
      device_label: device.label,
    });
  }

  const identifier = String(body.identifier ?? "").trim();
  const pin = String(body.pin ?? "");

  if (identifier.length < 3 || !/^\d{4,6}$/.test(pin)) {
    return json({ error: "Enter a valid email/short code and 4–6 digit PIN." }, 400);
  }

  let profileQuery = supabase
    .from("profiles")
    .select("id,full_name,email,short_code,profile_type,is_active,archived_at,can_use_kiosk")
    .ilike("short_code", identifier)
    .eq("profile_type", "account")
    .maybeSingle();

  let { data: profile } = await profileQuery;

  if (!profile && identifier.includes("@")) {
    const response = await supabase
      .from("profiles")
      .select("id,full_name,email,short_code,profile_type,is_active,archived_at,can_use_kiosk")
      .ilike("email", identifier)
      .eq("profile_type", "account")
      .maybeSingle();
    profile = response.data;
  }

  if (!profile || !profile.is_active || profile.archived_at || !profile.can_use_kiosk) {
    await supabase.from("kiosk_events").insert({
      entered_identifier: identifier,
      resolved_profile_id: profile?.id ?? null,
      event_type: "pin_failure",
      device_label: device.label,
      kiosk_device_id: device.id,
      metadata: { reason: "unavailable_profile", source: "trusted_kiosk" },
    });
    return json({ error: "Details not recognised or kiosk access is disabled." }, 401);
  }

  const { data: credential } = await supabase
    .from("pin_credentials")
    .select("pin_hash,failed_attempts,locked_until")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!credential) return json({ error: "Kiosk PIN is not configured for this account." }, 403);

  if (credential.locked_until && new Date(credential.locked_until) > new Date()) {
    return json({ error: "PIN access is temporarily locked. Please ask an administrator." }, 429);
  }

  const valid = await bcrypt.compare(pin, credential.pin_hash);

  if (!valid) {
    const attempts = Number(credential.failed_attempts ?? 0) + 1;
    const lock = attempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;

    await Promise.all([
      supabase.from("pin_credentials").update({
        failed_attempts: attempts >= 5 ? 0 : attempts,
        locked_until: lock,
        updated_at: new Date().toISOString(),
      }).eq("profile_id", profile.id),
      supabase.from("kiosk_events").insert({
        entered_identifier: identifier,
        resolved_profile_id: profile.id,
        event_type: "pin_failure",
        device_label: device.label,
        kiosk_device_id: device.id,
        metadata: { attempts, locked: Boolean(lock), source: "trusted_kiosk" },
      }),
    ]);

    return json({ error: lock ? "Too many failed attempts. Ask an administrator." : "PIN not recognised." }, 401);
  }

  await supabase.from("pin_credentials").update({
    failed_attempts: 0,
    locked_until: null,
    updated_at: new Date().toISOString(),
  }).eq("profile_id", profile.id);

  const { data: openSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("profile_id", profile.id)
    .is("clock_out_at", null)
    .maybeSingle();

  const now = new Date().toISOString();
  let action: "clock_in" | "clock_out";

  if (openSession) {
    action = "clock_out";
    const { error } = await supabase
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
    if (error) return json({ error: "Could not clock out." }, 500);
  } else {
    action = "clock_in";
    const { error } = await supabase.from("sessions").insert({
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
    if (error) return json({ error: "Could not clock in." }, 500);
  }

  await supabase.from("kiosk_events").insert({
    entered_identifier: identifier,
    resolved_profile_id: profile.id,
    event_type: action,
    device_label: device.label,
    kiosk_device_id: device.id,
    metadata: { source: "trusted_kiosk", on_site_verified: action === "clock_in" },
  });

  return json({
    success: true,
    action,
    full_name: profile.full_name,
    at: now,
    device_label: device.label,
  });
});
