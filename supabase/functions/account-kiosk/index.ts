import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

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

function normaliseShortCode(value: string) {
  return value.trim().toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

  const { data: profile } = await admin
    .from("profiles")
    .select("id,user_id,email,full_name,profile_type,is_active,archived_at,can_use_kiosk,kiosk_user_enabled,short_code")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile || profile.profile_type !== "account" || !profile.is_active || profile.archived_at) {
    return reply({ error: "Active registered account required." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }

  const action = String(body.action ?? "");

  async function audit(actionName: string, metadata: Record<string, unknown> = {}) {
    await admin.from("audit_log").insert({
      performed_by_profile_id: profile.id,
      action: actionName,
      target_profile_id: profile.id,
      metadata,
    });
  }

  if (action === "status") {
    const { data: credential } = await admin
      .from("pin_credentials")
      .select("profile_id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    return reply({
      success: true,
      allowed: profile.can_use_kiosk,
      enabled: profile.can_use_kiosk && profile.kiosk_user_enabled,
      email: profile.email,
      short_code: profile.short_code,
      pin_set: Boolean(credential),
    });
  }

  if (action === "check_short_code") {
    const shortCode = normaliseShortCode(String(body.short_code ?? ""));
    if (!/^[A-Z0-9_-]{3,12}$/.test(shortCode)) {
      return reply({ success: true, available: false, reason: "Use 3–12 letters, numbers, - or _." });
    }

    const { data: matches } = await admin
      .from("profiles")
      .select("id")
      .ilike("short_code", shortCode)
      .neq("id", profile.id)
      .limit(1);

    return reply({ success: true, available: !matches?.length, short_code: shortCode });
  }

  if (action === "set_credentials") {
    if (!profile.can_use_kiosk) {
      return reply({ error: "RCG has disabled kiosk access for this account. Ask an administrator if you need it restored." }, 403);
    }

    const pin = String(body.pin ?? "");
    const requestedShortCode = normaliseShortCode(String(body.short_code ?? ""));
    const shortCode = requestedShortCode || null;

    if (!/^\d{4,6}$/.test(pin)) {
      return reply({ error: "PIN must be 4–6 digits." }, 400);
    }

    if (shortCode && !/^[A-Z0-9_-]{3,12}$/.test(shortCode)) {
      return reply({ error: "Short code must be 3–12 letters, numbers, - or _." }, 400);
    }

    if (shortCode) {
      const { data: matches } = await admin
        .from("profiles")
        .select("id")
        .ilike("short_code", shortCode)
        .neq("id", profile.id)
        .limit(1);

      if (matches?.length) return reply({ error: "That short code is already in use." }, 409);
    }

    const pinHash = await bcrypt.hash(pin, 12);

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        short_code: shortCode,
        kiosk_user_enabled: true,
      })
      .eq("id", profile.id);

    if (profileError) return reply({ error: "Unable to save kiosk settings." }, 400);

    const { error: pinError } = await admin
      .from("pin_credentials")
      .upsert({
        profile_id: profile.id,
        pin_hash: pinHash,
        failed_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      });

    if (pinError) return reply({ error: "Unable to save kiosk PIN." }, 400);

    await audit("kiosk_credentials_self_updated", {
      short_code: shortCode,
      kiosk_enabled: true,
      pin_changed: true,
    });

    return reply({ success: true, short_code: shortCode });
  }

  if (action === "disable") {
    const { error } = await admin
      .from("profiles")
      .update({ kiosk_user_enabled: false })
      .eq("id", profile.id);

    if (error) return reply({ error: "Unable to disable kiosk access." }, 400);

    await audit("kiosk_access_self_disabled", { kiosk_enabled: false });
    return reply({ success: true });
  }

  return reply({ error: "Unsupported action." }, 400);
});
