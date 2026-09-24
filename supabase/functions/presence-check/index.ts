import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type Actor = {
  id: string;
  role: "owner" | "admin" | "developer" | "user";
  is_active: boolean;
  archived_at: string | null;
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

async function sendEmail(
  apiKey: string,
  from: string,
  to: string,
  siteName: string,
  fullName: string,
  url: string,
) {
  const firstName = fullName.trim().split(/\s+/)[0] || fullName;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${siteName}: please confirm your site status`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#253128;max-width:620px">
          <h2 style="color:#315d3a">Are you still at ${htmlEscape(siteName)}?</h2>
          <p>Hi ${htmlEscape(firstName)}, you are still recorded as being on site.</p>
          <p>Please open the clocking app to confirm you are still there, or clock out and enter the time you actually left.</p>
          <p style="margin:28px 0"><a href="${htmlEscape(url)}" style="background:#315d3a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Open presence check</a></p>
          <p style="font-size:12px;color:#6d756d">The app only reports whether your device appears to be at RCG; it does not send management your exact location.</p>
        </div>
      `,
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

  if (String(body.action ?? "") !== "request") {
    return reply({ error: "Unsupported action." }, 400);
  }

  const sessionId = String(body.session_id ?? "");
  if (!sessionId) return reply({ error: "Session is required." }, 400);

  const { data: session } = await admin
    .from("sessions")
    .select("id,profile_id,clock_in_at,clock_out_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.clock_out_at) {
    return reply({ error: "This session is no longer open." }, 409);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id,full_name,email,is_active,archived_at")
    .eq("id", session.profile_id)
    .maybeSingle();

  if (!profile || !profile.is_active || profile.archived_at) {
    return reply({ error: "The user is not available for a presence check." }, 404);
  }

  const now = new Date().toISOString();
  const { data: unresolved } = await admin
    .from("presence_check_requests")
    .select("id")
    .eq("session_id", session.id)
    .is("resolved_at", null)
    .maybeSingle();

  let requestId: string;

  if (unresolved) {
    requestId = unresolved.id;
    const { error } = await admin
      .from("presence_check_requests")
      .update({
        requested_by_profile_id: actor.id,
        request_source: "admin_manual",
        status: "pending",
        requested_at: now,
        notified_at: null,
        notification_channel: null,
        responded_at: null,
        escalated_at: null,
      })
      .eq("id", unresolved.id);
    if (error) return reply({ error: "Unable to refresh the presence check." }, 500);
  } else {
    const { data: created, error } = await admin
      .from("presence_check_requests")
      .insert({
        session_id: session.id,
        profile_id: session.profile_id,
        requested_by_profile_id: actor.id,
        request_source: "admin_manual",
        status: "pending",
        requested_at: now,
      })
      .select("id")
      .single();

    if (error || !created) return reply({ error: "Unable to create the presence check." }, 500);
    requestId = created.id;
  }

  const { data: settings } = await admin
    .from("settings")
    .select("site_name,vapid_public_key,app_base_url")
    .limit(1)
    .maybeSingle();

  const appBaseUrl = String(settings?.app_base_url || "https://rcgclocking.app").replace(/\/$/, "");
  const checkUrl = `${appBaseUrl}/dashboard?presenceCheck=${encodeURIComponent(requestId)}`;

  let pushSent = 0;
  const { data: privateKey } = await admin.rpc("get_web_push_private_key");
  const publicKey = String(settings?.vapid_public_key ?? "");

  if (publicKey && privateKey) {
    webpush.setVapidDetails("mailto:alerts@rcgclocking.app", publicKey, String(privateKey));

    const { data: subscriptionsData } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("profile_id", session.profile_id)
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
          last_success_at: now,
          last_failure_at: null,
        }).eq("id", subscription.id);
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number }).statusCode ?? 0);
        await admin.from("push_subscriptions").update({
          active: ![404, 410].includes(statusCode),
          last_failure_at: now,
        }).eq("id", subscription.id);
      }
    }
  }

  let emailSent = false;
  if (pushSent === 0) {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("ALERT_FROM_EMAIL") || "RCG Clocking <alerts@rcgclocking.app>";
    if (apiKey && profile.email) {
      emailSent = await sendEmail(
        apiKey,
        from,
        profile.email,
        String(settings?.site_name || "Redcatch Community Garden"),
        profile.full_name,
        checkUrl,
      );
    }
  }

  const channel = pushSent > 0 ? "push" : emailSent ? "email" : "in_app";
  await admin.from("presence_check_requests").update({
    notified_at: now,
    notification_channel: channel,
  }).eq("id", requestId);

  await admin.from("audit_log").insert({
    performed_by_profile_id: actor.id,
    action: "presence_check_requested",
    target_profile_id: session.profile_id,
    target_session_id: session.id,
    metadata: {
      request_id: requestId,
      source: "admin_manual",
      notification_channel: channel,
      push_sent: pushSent,
      email_sent: emailSent,
    },
  });

  return reply({
    success: true,
    request_id: requestId,
    notification_channel: channel,
    push_sent: pushSent,
    email_sent: emailSent,
  });
});
