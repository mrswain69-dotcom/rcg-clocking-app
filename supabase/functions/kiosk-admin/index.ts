import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type Role = "owner" | "admin" | "developer" | "user";

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function randomToken(bytes = 32) {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

  if (
    !actor
    || !actor.is_active
    || actor.archived_at
    || !["owner", "admin", "developer"].includes(actor.role as Role)
  ) {
    return reply({ error: "Administrator access required." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }

  const action = String(body.action ?? "");

  async function audit(actionName: string, metadata: Record<string, unknown>) {
    await admin.from("audit_log").insert({
      performed_by_profile_id: actor.id,
      action: actionName,
      metadata,
    });
  }

  if (action === "enrol") {
    const label = String(body.label ?? "").trim();
    const userAgent = String(body.user_agent ?? "").slice(0, 500) || null;

    if (label.length < 2 || label.length > 80) {
      return reply({ error: "Enter a kiosk name between 2 and 80 characters." }, 400);
    }

    const deviceToken = randomToken();
    const tokenHash = await sha256Hex(deviceToken);

    const { data: device, error } = await admin
      .from("kiosk_devices")
      .insert({
        label,
        token_hash: tokenHash,
        enrolled_by_profile_id: actor.id,
        user_agent: userAgent,
        last_seen_at: new Date().toISOString(),
      })
      .select("id,label")
      .single();

    if (error || !device) return reply({ error: "Unable to enrol this kiosk device." }, 400);

    await audit("kiosk_device_enrolled", {
      kiosk_device_id: device.id,
      label: device.label,
    });

    return reply({
      success: true,
      device_id: device.id,
      device_token: deviceToken,
      label: device.label,
    });
  }

  const deviceId = String(body.device_id ?? "");
  if (!deviceId) return reply({ error: "Kiosk device is required." }, 400);

  const { data: existing } = await admin
    .from("kiosk_devices")
    .select("id,label,is_active,revoked_at")
    .eq("id", deviceId)
    .maybeSingle();

  if (!existing) return reply({ error: "Kiosk device not found." }, 404);

  if (action === "revoke") {
    const now = new Date().toISOString();
    const { error } = await admin
      .from("kiosk_devices")
      .update({ is_active: false, revoked_at: now })
      .eq("id", deviceId);

    if (error) return reply({ error: "Unable to revoke this kiosk device." }, 400);

    await audit("kiosk_device_revoked", {
      kiosk_device_id: deviceId,
      label: existing.label,
    });

    return reply({ success: true });
  }

  if (action === "rename") {
    const label = String(body.label ?? "").trim();
    if (label.length < 2 || label.length > 80) {
      return reply({ error: "Enter a kiosk name between 2 and 80 characters." }, 400);
    }

    const { error } = await admin
      .from("kiosk_devices")
      .update({ label })
      .eq("id", deviceId);

    if (error) return reply({ error: "Unable to rename this kiosk device." }, 400);

    await audit("kiosk_device_renamed", {
      kiosk_device_id: deviceId,
      from: existing.label,
      to: label,
    });

    return reply({ success: true });
  }

  return reply({ error: "Unsupported action." }, 400);
});
