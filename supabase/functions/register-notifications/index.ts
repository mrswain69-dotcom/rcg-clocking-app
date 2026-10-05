import { createClient } from "@supabase/supabase-js";
import {
  registerEmail,
  type AttendanceEmailPayload,
} from "../_shared/register-email.ts";

const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return reply({ error: "POST required" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = request.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: identity, error: authError } =
      await userClient.auth.getUser(token);
    if (authError || !identity.user)
      return reply({ error: "Authentication required" }, 401);
    const body = await request.json();
    const sessionId = String(body.session_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(sessionId))
      return reply({ error: "Invalid session" }, 400);
    const { data: visibleSession, error: accessError } = await userClient
      .from("register_sessions")
      .select("id,status")
      .eq("id", sessionId)
      .maybeSingle();
    if (accessError || !visibleSession)
      return reply({ error: "Register access denied" }, 403);
    const { data: capabilities, error: capabilityError } = await userClient.rpc(
      "register_capabilities",
      { p_session: sessionId },
    );
    if (capabilityError || !capabilities?.take)
      return reply({ error: "Attendance permission required" }, 403);
    if (visibleSession.status !== "confirmed")
      return reply({ error: "Confirm the register first" }, 409);
    const admin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: deliverySettings, error: settingsError } = await admin
      .from("settings")
      .select("register_email_enabled")
      .eq("id", 1)
      .maybeSingle();
    if (settingsError || deliverySettings?.register_email_enabled !== true)
      return reply(
        {
          error:
            "Attendance email sending is paused. Attendance remains saved and notifications remain queued.",
        },
        503,
      );
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("REGISTER_FROM_EMAIL");
    if (Deno.env.get("REGISTER_EMAIL_ENABLED") !== "true" || !apiKey || !from)
      return reply(
        {
          error:
            "Register email delivery is not enabled or configured. Attendance remains saved and notifications remain queued.",
        },
        503,
      );
    const { data: jobs, error: claimError } = await admin.rpc(
      "claim_register_notifications",
      { p_session: sessionId },
    );
    if (claimError) return reply({ error: "Unable to process queue" }, 500);
    let sent = 0,
      failed = 0;
    for (const job of jobs ?? []) {
      // Recheck approved routing immediately before sending, including a disabled contact or corrected draft.
      const [{ data: contact }, { data: session }, { data: current }] =
        await Promise.all([
          admin
            .from("register_contacts")
            .select(
              "email,active,client_id,party_id,notify_attendance,notify_departure,notify_absence",
            )
            .eq("id", job.contact_id)
            .maybeSingle(),
          admin
            .from("register_sessions")
            .select("status")
            .eq("id", job.session_id)
            .maybeSingle(),
          admin
            .from("register_notifications")
            .select("status")
            .eq("id", job.id)
            .maybeSingle(),
        ]);
      const [{ data: party }, { data: client }] = await Promise.all([
        contact?.party_id
          ? admin
              .from("register_parties")
              .select("active,email")
              .eq("id", contact.party_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        admin
          .from("register_clients")
          .select("active")
          .eq("id", job.client_id)
          .maybeSingle(),
      ]);
      if (
        !contact?.active ||
        !client?.active ||
        (contact.party_id &&
          (!party?.active || party.email !== job.recipient)) ||
        (job.event === "departure"
          ? !contact.notify_departure
          : !contact.notify_attendance ||
            (job.payload.status === "absent" && !contact.notify_absence)) ||
        contact.email !== job.recipient ||
        contact.client_id !== job.client_id ||
        session?.status !== "confirmed" ||
        current?.status !== "sending"
      ) {
        await admin
          .from("register_notifications")
          .update({
            status: "blocked",
            error: "Recipient or register changed; manager review required",
          })
          .eq("id", job.id)
          .eq("status", "sending");
        continue;
      }
      const email = registerEmail(job.payload as AttendanceEmailPayload);
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `rcg-register-${job.id}`,
          },
          body: JSON.stringify({ from, to: [job.recipient], ...email }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.id) {
          const { data: logged, error } = await admin
            .from("register_notifications")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              provider_id: result.id,
              error: null,
            })
            .eq("id", job.id)
            .eq("status", "sending")
            .select("id")
            .maybeSingle();
          if (error || !logged)
            throw new Error(
              "Provider accepted message but send log could not be saved",
            );
          sent++;
        } else {
          const retryable = response.status === 429 || response.status >= 500;
          await admin
            .from("register_notifications")
            .update({
              status: retryable ? "failed" : "blocked",
              error: `Email provider returned ${response.status}; ${retryable ? "retry available" : "configuration review required"}`,
            })
            .eq("id", job.id)
            .eq("status", "sending");
          failed++;
        }
      } catch {
        await admin
          .from("register_notifications")
          .update({
            status: "failed",
            error:
              "Send outcome uncertain. Retry uses the same provider idempotency key.",
          })
          .eq("id", job.id)
          .eq("status", "sending");
        failed++;
      }
    }
    return reply({ success: true, sent, failed, processed: jobs?.length ?? 0 });
  } catch {
    return reply({ error: "Unable to process attendance notifications" }, 500);
  }
});
