import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type Settings = {
  id: number | string;
  site_name: string;
  timezone: string;
  closing_time: string;
  alert_enabled: boolean;
  alert_grace_minutes: number;
  alert_repeat_minutes: number;
  last_alert_sent_at: string | null;
  presence_check_enabled: boolean;
  presence_check_escalation_minutes: number;
  vapid_public_key: string | null;
  app_base_url: string;
};

type OpenSession = {
  id: string;
  profile_id: string;
  clock_in_at: string;
  current_presence_status: "on_site" | "off_site" | "unverified";
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
};

type PresenceRequest = {
  id: string;
  session_id: string;
  profile_id: string;
  status: string;
  requested_at: string;
  escalated_at: string | null;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
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

async function notifyUser(
  admin: ReturnType<typeof createClient>,
  settings: Settings,
  profile: Profile,
  requestId: string,
  nowIso: string,
) {
  let pushSent = 0;
  const { data: privateKey } = await admin.rpc("get_web_push_private_key");
  const publicKey = settings.vapid_public_key ?? "";

  if (publicKey && privateKey) {
    webpush.setVapidDetails("mailto:alerts@rcgclocking.app", publicKey, String(privateKey));

    const { data: subscriptionsData } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("profile_id", profile.id)
      .eq("active", true);

    const subscriptions = (subscriptionsData ?? []) as PushSubscriptionRow[];
    const payload = JSON.stringify({
      title: "Redcatch presence check",
      body: "You're still recorded as being on site. Tap to confirm your status or clock out.",
      url: `/dashboard?presenceCheck=${requestId}`,
      requestId,
    });

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        );
        pushSent += 1;
        await admin.from("push_subscriptions").update({
          last_success_at: nowIso,
          last_failure_at: null,
        }).eq("id", subscription.id);
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number }).statusCode ?? 0);
        await admin.from("push_subscriptions").update({
          active: ![404, 410].includes(statusCode),
          last_failure_at: nowIso,
        }).eq("id", subscription.id);
      }
    }
  }

  let emailSent = false;
  if (pushSent === 0) {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("ALERT_FROM_EMAIL") || "RCG Clocking <alerts@rcgclocking.app>";
    if (apiKey && profile.email) {
      const firstName = profile.full_name.trim().split(/\s+/)[0] || profile.full_name;
      const baseUrl = String(settings.app_base_url || "https://rcgclocking.app").replace(/\/$/, "");
      const checkUrl = `${baseUrl}/dashboard?presenceCheck=${encodeURIComponent(requestId)}`;
      emailSent = await sendEmail(
        apiKey,
        from,
        profile.email,
        `${settings.site_name}: please confirm your site status`,
        `
          <div style="font-family:Arial,sans-serif;color:#253128;max-width:620px">
            <h2 style="color:#315d3a">Are you still at ${htmlEscape(settings.site_name)}?</h2>
            <p>Hi ${htmlEscape(firstName)}, you are still recorded as being on site after the normal closing time.</p>
            <p>Please open the clocking app to confirm you are still there, or clock out and enter the time you actually left.</p>
            <p style="margin:28px 0"><a href="${htmlEscape(checkUrl)}" style="background:#315d3a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Open presence check</a></p>
            <p style="font-size:12px;color:#6d756d">Management is only told whether you appear to be on site or not. Your exact location is not shared.</p>
          </div>
        `,
      );
    }
  }

  return {
    pushSent,
    emailSent,
    channel: pushSent > 0 ? "push" : emailSent ? "email" : "in_app",
  };
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
    "id,site_name,timezone,closing_time,alert_enabled,alert_grace_minutes,alert_repeat_minutes,last_alert_sent_at,presence_check_enabled,presence_check_escalation_minutes,vapid_public_key,app_base_url",
  ).limit(1).maybeSingle();
  const settings = settingsData as Settings | null;
  if (settingsError || !settings) return reply({ error: "Application settings are missing." }, 500);
  if (!settings.alert_enabled) return reply({ success: true, skipped: "disabled" });

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: sessionsData, error: sessionsError } = await admin
    .from("sessions")
    .select("id,profile_id,clock_in_at,current_presence_status")
    .is("clock_out_at", null)
    .neq("current_presence_status", "off_site")
    .order("clock_in_at", { ascending: true });
  if (sessionsError) return reply({ error: "Unable to read current attendance." }, 500);

  const sessions = ((sessionsData ?? []) as OpenSession[])
    .filter((session) => sessionIsAfterDeadline(session.clock_in_at, now, settings));

  if (!sessions.length) return reply({ success: true, skipped: "nobody_on_site_after_deadline" });

  const profileIds = [...new Set(sessions.map((session) => session.profile_id))];
  const { data: profilesData } = await admin
    .from("profiles")
    .select("id,full_name,email")
    .in("id", profileIds);
  const profiles = new Map(((profilesData ?? []) as Profile[]).map((profile) => [profile.id, profile]));

  const sessionIds = sessions.map((session) => session.id);
  const { data: requestsData } = await admin
    .from("presence_check_requests")
    .select("id,session_id,profile_id,status,requested_at,escalated_at")
    .in("session_id", sessionIds)
    .is("resolved_at", null)
    .order("requested_at", { ascending: false });

  const unresolvedBySession = new Map<string, PresenceRequest>();
  for (const request of (requestsData ?? []) as PresenceRequest[]) {
    if (!unresolvedBySession.has(request.session_id)) unresolvedBySession.set(request.session_id, request);
  }

  let requestedCount = 0;

  if (settings.presence_check_enabled) {
    for (const session of sessions) {
      if (unresolvedBySession.has(session.id)) continue;
      const profile = profiles.get(session.profile_id);
      if (!profile) continue;

      const { data: created, error } = await admin
        .from("presence_check_requests")
        .insert({
          session_id: session.id,
          profile_id: session.profile_id,
          requested_by_profile_id: null,
          request_source: "automatic_after_hours",
          status: "pending",
          requested_at: nowIso,
        })
        .select("id,session_id,profile_id,status,requested_at,escalated_at")
        .single();

      if (error || !created) continue;

      const request = created as PresenceRequest;
      unresolvedBySession.set(session.id, request);
      const delivery = await notifyUser(admin, settings, profile, request.id, nowIso);

      await admin.from("presence_check_requests").update({
        notified_at: nowIso,
        notification_channel: delivery.channel,
      }).eq("id", request.id);

      await admin.from("audit_log").insert({
        performed_by_profile_id: null,
        action: "presence_check_requested_automatic",
        target_profile_id: session.profile_id,
        target_session_id: session.id,
        metadata: {
          request_id: request.id,
          notification_channel: delivery.channel,
          push_sent: delivery.pushSent,
          email_sent: delivery.emailSent,
        },
      });

      requestedCount += 1;
    }
  }

  const escalationSessions = sessions.filter((session) => {
    if (!settings.presence_check_enabled) return true;
    const request = unresolvedBySession.get(session.id);
    if (!request) return false;

    const ageMinutes = (now.getTime() - new Date(request.requested_at).getTime()) / 60_000;
    if (ageMinutes < settings.presence_check_escalation_minutes) return false;

    if (!request.escalated_at) return true;
    const sinceEscalation = (now.getTime() - new Date(request.escalated_at).getTime()) / 60_000;
    return sinceEscalation >= settings.alert_repeat_minutes;
  });

  if (!escalationSessions.length) {
    return reply({
      success: true,
      presence_checks_requested: requestedCount,
      escalations_sent: 0,
    });
  }

  const { data: recipientsData, error: recipientsError } = await admin
    .from("alert_recipients")
    .select("email")
    .eq("active", true)
    .order("email");
  if (recipientsError) return reply({ error: "Unable to read alert recipients." }, 500);

  const recipients = recipientsData ?? [];
  if (!recipients.length) {
    return reply({
      success: true,
      presence_checks_requested: requestedCount,
      skipped: "no_management_recipients",
    });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERT_FROM_EMAIL") || "RCG Clocking <alerts@rcgclocking.app>";
  if (!apiKey) return reply({ error: "Email delivery is not configured." }, 503);

  const currentLocal = localParts(now, settings.timezone);
  const rows = escalationSessions.map((session) => {
    const profile = profiles.get(session.profile_id);
    const name = profile?.full_name ?? "Unknown user";
    const clockInLocal = localParts(new Date(session.clock_in_at), settings.timezone).display;
    const request = unresolvedBySession.get(session.id);
    const checkState = settings.presence_check_enabled
      ? request?.status === "location_unavailable"
        ? "Location unavailable / unresolved"
        : "Presence check sent – no response"
      : "No automated presence check";
    return `<tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>${htmlEscape(name)}</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">${htmlEscape(clockInLocal)}</td><td style="padding:8px;border-bottom:1px solid #ddd">${htmlEscape(formatDuration(session.clock_in_at, now))}</td><td style="padding:8px;border-bottom:1px solid #ddd">${htmlEscape(checkState)}</td></tr>`;
  }).join("");

  const adminUrl = `${String(settings.app_base_url || "https://rcgclocking.app").replace(/\/$/, "")}/admin`;
  const subject = `${settings.site_name}: unresolved after-hours presence check`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#253128;max-width:760px">
      <h2 style="color:#d7652f">After-hours site safety escalation</h2>
      <p><strong>${htmlEscape(settings.site_name)}</strong> has ${escalationSessions.length} ${escalationSessions.length === 1 ? "person" : "people"} still requiring management attention at ${htmlEscape(currentLocal.display)}.</p>
      <table style="border-collapse:collapse;width:100%">
        <thead><tr><th style="text-align:left;padding:8px">Name</th><th style="text-align:left;padding:8px">Clocked in</th><th style="text-align:left;padding:8px">Duration</th><th style="text-align:left;padding:8px">Presence check</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>The person was asked to confirm their status first. Please open the admin dashboard to request another check or contact them directly.</p>
      <p style="margin:28px 0"><a href="${htmlEscape(adminUrl)}" style="background:#315d3a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Open admin safety view</a></p>
      <p style="font-size:12px;color:#6d756d">Exact user locations are not disclosed; the system reports only on-site, off-site or unresolved status.</p>
    </div>`;

  const results = await Promise.all(
    recipients.map((recipient) => sendEmail(apiKey, from, recipient.email, subject, html)),
  );
  const sentCount = results.filter(Boolean).length;
  const failedCount = results.length - sentCount;

  if (sentCount === 0) return reply({ error: "The email provider did not accept any management alert messages." }, 502);

  const escalatedRequestIds = escalationSessions
    .map((session) => unresolvedBySession.get(session.id)?.id)
    .filter((id): id is string => Boolean(id));

  if (escalatedRequestIds.length) {
    await admin.from("presence_check_requests").update({ escalated_at: nowIso }).in("id", escalatedRequestIds);
  }

  await admin.from("settings").update({ last_alert_sent_at: nowIso }).eq("id", settings.id);
  await admin.from("audit_log").insert({
    performed_by_profile_id: null,
    action: "after_hours_presence_escalated",
    metadata: {
      session_count: escalationSessions.length,
      recipient_count: recipients.length,
      sent_count: sentCount,
      failed_count: failedCount,
      presence_checks_requested_this_run: requestedCount,
    },
  });

  return reply({
    success: true,
    presence_checks_requested: requestedCount,
    escalations_sent: sentCount,
    failed_count: failedCount,
    session_count: escalationSessions.length,
  });
});
