import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type Role = "owner" | "admin" | "developer" | "user";

type Actor = {
  id: string;
  role: Role;
  is_active: boolean;
  archived_at: string | null;
};

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function sendTestEmail(apiKey: string, from: string, to: string, siteName: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${siteName} after-hours alert test`,
      html: `<p>This is a test of the ${siteName} after-hours safety alert system.</p><p>No attendance action is required.</p>`,
    }),
  });

  return response.ok;
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

  const { data: actorData } = await admin
    .from("profiles")
    .select("id,role,is_active,archived_at")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  const actor = actorData as Actor | null;

  if (!actor || !actor.is_active || actor.archived_at || !["owner", "admin", "developer"].includes(actor.role)) {
    return reply({ error: "Administrator access required." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }

  const action = String(body.action ?? "");

  async function audit(auditAction: string, metadata: Record<string, unknown> = {}) {
    await admin.from("audit_log").insert({
      performed_by_profile_id: actor!.id,
      action: auditAction,
      metadata,
    });
  }

  const { data: settings } = await admin.from("settings").select("*").limit(1).maybeSingle();
  if (!settings) return reply({ error: "Application settings are missing." }, 500);

  if (action === "update_settings") {
    const siteName = String(body.site_name ?? "").trim();
    const timezone = String(body.timezone ?? "").trim();
    const closingTime = String(body.closing_time ?? "").trim();
    const grace = Number(body.alert_grace_minutes);
    const repeat = Number(body.alert_repeat_minutes);
    const enabled = body.alert_enabled === true;

    if (!siteName || siteName.length > 120) return reply({ error: "Site name is required and must be 120 characters or fewer." }, 400);
    if (!validTimezone(timezone)) return reply({ error: "Enter a valid timezone." }, 400);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(closingTime)) return reply({ error: "Closing time must use HH:MM." }, 400);
    if (!Number.isInteger(grace) || grace < 0 || grace > 240) return reply({ error: "Grace period must be 0–240 minutes." }, 400);
    if (!Number.isInteger(repeat) || repeat < 15 || repeat > 1440) return reply({ error: "Repeat interval must be 15–1440 minutes." }, 400);

    const next = {
      site_name: siteName,
      timezone,
      closing_time: closingTime,
      alert_enabled: enabled,
      alert_grace_minutes: grace,
      alert_repeat_minutes: repeat,
    };

    const { error } = await admin.from("settings").update(next).eq("id", settings.id);
    if (error) return reply({ error: "Unable to update operational settings." }, 400);
    await audit("operational_settings_changed", { old: {
      site_name: settings.site_name,
      timezone: settings.timezone,
      closing_time: settings.closing_time,
      alert_enabled: settings.alert_enabled,
      alert_grace_minutes: settings.alert_grace_minutes,
      alert_repeat_minutes: settings.alert_repeat_minutes,
    }, new: next });
    return reply({ success: true });
  }

  if (action === "add_recipient") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) return reply({ error: "Enter a valid email address." }, 400);

    const { data: existing } = await admin.from("alert_recipients").select("id,active").ilike("email", email).maybeSingle();
    if (existing) {
      const { error } = await admin.from("alert_recipients").update({ active: true }).eq("id", existing.id);
      if (error) return reply({ error: "Unable to reactivate this recipient." }, 400);
      await audit("alert_recipient_reactivated", { recipient_id: existing.id, email });
      return reply({ success: true });
    }

    const { data: recipient, error } = await admin.from("alert_recipients").insert({ email, active: true }).select("id").single();
    if (error || !recipient) return reply({ error: "Unable to add this recipient." }, 400);
    await audit("alert_recipient_added", { recipient_id: recipient.id, email });
    return reply({ success: true });
  }

  if (action === "set_recipient_active") {
    const recipientId = String(body.recipient_id ?? "");
    const active = body.active === true;
    if (!recipientId) return reply({ error: "Recipient is required." }, 400);

    const { data: recipient } = await admin.from("alert_recipients").select("id,email,active").eq("id", recipientId).maybeSingle();
    if (!recipient) return reply({ error: "Recipient not found." }, 404);

    const { error } = await admin.from("alert_recipients").update({ active }).eq("id", recipientId);
    if (error) return reply({ error: "Unable to update this recipient." }, 400);
    await audit("alert_recipient_status_changed", { recipient_id: recipientId, email: recipient.email, from: recipient.active, to: active });
    return reply({ success: true });
  }

  if (action === "remove_recipient") {
    const recipientId = String(body.recipient_id ?? "");
    if (!recipientId) return reply({ error: "Recipient is required." }, 400);

    const { data: recipient } = await admin.from("alert_recipients").select("id,email").eq("id", recipientId).maybeSingle();
    if (!recipient) return reply({ error: "Recipient not found." }, 404);

    const { error } = await admin.from("alert_recipients").delete().eq("id", recipientId);
    if (error) return reply({ error: "Unable to remove this recipient." }, 400);
    await audit("alert_recipient_removed", { recipient_id: recipientId, email: recipient.email });
    return reply({ success: true });
  }

  if (action === "send_test") {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("ALERT_FROM_EMAIL") || "RCG Clocking <alerts@rcgclocking.app>";
    if (!apiKey) return reply({ error: "Email delivery is not configured yet. Add RESEND_API_KEY to Supabase Edge Function secrets first." }, 503);

    const { data: recipients } = await admin.from("alert_recipients").select("email").eq("active", true).order("email");
    if (!recipients?.length) return reply({ error: "Add at least one active alert recipient first." }, 400);

    const results = await Promise.all(recipients.map((recipient) => sendTestEmail(apiKey, from, recipient.email, settings.site_name)));
    const sent = results.filter(Boolean).length;
    await audit("alert_test_sent", { recipient_count: recipients.length, sent_count: sent });
    if (sent === 0) return reply({ error: "The email provider did not accept the test message." }, 502);
    return reply({ success: true, sent_count: sent, recipient_count: recipients.length });
  }

  return reply({ error: "Unsupported action." }, 400);
});
