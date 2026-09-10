import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type Settings = {
  id: number | string;
  site_name: string;
  timezone: string;
  closing_time: string;
  alert_enabled: boolean;
  alert_grace_minutes: number;
  alert_repeat_minutes: number;
  last_alert_sent_at: string | null;
};

type OpenSession = {
  id: string;
  profile_id: string;
  clock_in_at: string;
};

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function htmlEscape(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] ?? char);
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(map.hour) * 60 + Number(map.minute),
    display: `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}`,
  };
}

function dayDifference(earlier: string, later: string) {
  const start = Date.parse(`${earlier}T00:00:00Z`);
  const end = Date.parse(`${later}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function sessionIsAfterDeadline(sessionClockIn: string, now: Date, settings: Settings) {
  const current = localParts(now, settings.timezone);
  const clockIn = localParts(new Date(sessionClockIn), settings.timezone);
  const [hours, minutes] = settings.closing_time.split(":").map(Number);
  const deadlineMinutes = hours * 60 + minutes + settings.alert_grace_minutes;
  const dateDiff = dayDifference(clockIn.date, current.date);

  if (dateDiff < 0) return false;
  if (dateDiff >= 2) return true;
  if (dateDiff === 1) {
    return deadlineMinutes < 1440 || current.minutes >= deadlineMinutes - 1440;
  }
  return deadlineMinutes < 1440 && current.minutes >= deadlineMinutes;
}

function formatDuration(clockIn: string, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(clockIn).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

async function sendEmail(apiKey: string, from: string, to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return response.ok;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply({ error: "Service configuration is missing." }, 500);

  const suppliedSecret = req.headers.get("x-rcg-cron-secret") ?? "";
  if (!suppliedSecret) return reply({ error: "Scheduler authentication required." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: secretValid, error: secretError } = await admin.rpc("verify_alert_cron_secret", {
    p_candidate: suppliedSecret,
  });
  if (secretError || secretValid !== true) return reply({ error: "Scheduler authentication failed." }, 401);

  const { data: settingsData, error: settingsError } = await admin.from("settings").select(
    "id,site_name,timezone,closing_time,alert_enabled,alert_grace_minutes,alert_repeat_minutes,last_alert_sent_at",
  ).limit(1).maybeSingle();
  const settings = settingsData as Settings | null;
  if (settingsError || !settings) return reply({ error: "Application settings are missing." }, 500);
  if (!settings.alert_enabled) return reply({ success: true, skipped: "disabled" });

  const now = new Date();
  if (settings.last_alert_sent_at) {
    const elapsedMinutes = (now.getTime() - new Date(settings.last_alert_sent_at).getTime()) / 60_000;
    if (elapsedMinutes < settings.alert_repeat_minutes) {
      return reply({ success: true, skipped: "repeat_window" });
    }
  }

  const { data: sessionsData, error: sessionsError } = await admin
    .from("sessions")
    .select("id,profile_id,clock_in_at")
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: true });
  if (sessionsError) return reply({ error: "Unable to read current attendance." }, 500);

  const sessions = (sessionsData ?? []) as OpenSession[];
  if (!sessions.length) return reply({ success: true, skipped: "nobody_on_site" });
  if (!sessions.some((session) => sessionIsAfterDeadline(session.clock_in_at, now, settings))) {
    return reply({ success: true, skipped: "before_deadline" });
  }

  const profileIds = [...new Set(sessions.map((session) => session.profile_id))];
  const { data: profilesData } = await admin.from("profiles").select("id,full_name").in("id", profileIds);
  const profileNames = new Map((profilesData ?? []).map((profile) => [profile.id, profile.full_name]));

  const { data: recipientsData, error: recipientsError } = await admin
    .from("alert_recipients")
    .select("email")
    .eq("active", true)
    .order("email");
  if (recipientsError) return reply({ error: "Unable to read alert recipients." }, 500);
  const recipients = recipientsData ?? [];
  if (!recipients.length) return reply({ success: true, skipped: "no_recipients" });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERT_FROM_EMAIL") || "RCG Clocking <alerts@rcgclocking.app>";
  if (!apiKey) return reply({ error: "Email delivery is not configured." }, 503);

  const currentLocal = localParts(now, settings.timezone);
  const rows = sessions.map((session) => {
    const name = profileNames.get(session.profile_id) ?? "Unknown user";
    const clockInLocal = localParts(new Date(session.clock_in_at), settings.timezone).display;
    return `<tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>${htmlEscape(name)}</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">${htmlEscape(clockInLocal)}</td><td style="padding:8px;border-bottom:1px solid #ddd">${htmlEscape(formatDuration(session.clock_in_at, now))}</td></tr>`;
  }).join("");

  const subject = `${settings.site_name}: people still on site after hours`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#253128;max-width:680px">
      <h2 style="color:#d7652f">After-hours site safety alert</h2>
      <p><strong>${htmlEscape(settings.site_name)}</strong> still has ${sessions.length} ${sessions.length === 1 ? "person" : "people"} recorded on site at ${htmlEscape(currentLocal.display)}.</p>
      <table style="border-collapse:collapse;width:100%"><thead><tr><th style="text-align:left;padding:8px">Name</th><th style="text-align:left;padding:8px">Clocked in</th><th style="text-align:left;padding:8px">Duration</th></tr></thead><tbody>${rows}</tbody></table>
      <p>Please check that everyone is safe and that nobody is accidentally left on site before lock-up.</p>
      <p style="font-size:12px;color:#6d756d">This alert is generated from open attendance sessions in the RCG Clocking App.</p>
    </div>`;

  const results = await Promise.all(
    recipients.map((recipient) => sendEmail(apiKey, from, recipient.email, subject, html)),
  );
  const sentCount = results.filter(Boolean).length;
  const failedCount = results.length - sentCount;

  if (sentCount === 0) return reply({ error: "The email provider did not accept any alert messages." }, 502);

  await admin.from("settings").update({ last_alert_sent_at: now.toISOString() }).eq("id", settings.id);
  await admin.from("audit_log").insert({
    performed_by_profile_id: null,
    action: "after_hours_alert_sent",
    metadata: {
      provider: "resend",
      session_count: sessions.length,
      recipient_count: recipients.length,
      sent_count: sentCount,
      failed_count: failedCount,
    },
  });

  return reply({ success: true, sent_count: sentCount, failed_count: failedCount, session_count: sessions.length });
});
