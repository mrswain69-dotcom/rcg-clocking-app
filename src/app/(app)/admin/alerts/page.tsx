import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireAdminProfile } from "@/lib/auth";
import { formatUkDateTime } from "@/lib/dates";
import {
  addAlertRecipient,
  removeAlertRecipient,
  sendAlertTest,
  setAlertRecipientActive,
  updateAlertSettings,
} from "./actions";

export const metadata: Metadata = { title: "After-hours alerts" };

export default async function AdminAlertsPage() {
  const { supabase } = await requireAdminProfile();
  const [{ data: settings }, { data: recipientsData }] = await Promise.all([
    supabase
      .from("settings")
      .select("id,site_name,timezone,closing_time,alert_enabled,alert_grace_minutes,alert_repeat_minutes,last_alert_sent_at,presence_check_enabled,presence_check_escalation_minutes")
      .limit(1)
      .single(),
    supabase.from("alert_recipients").select("id,email,active,created_at").order("email"),
  ]);

  const recipients = recipientsData ?? [];
  const closingTime = String(settings?.closing_time ?? "18:00").slice(0, 5);
  const enabled = settings?.alert_enabled ?? false;
  const presenceCheckEnabled = settings?.presence_check_enabled ?? true;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Site safety"
        title="After-hours safety"
        description="Ask people to confirm their status first, then escalate unresolved cases to management."
        action={<Link className="btn btn-secondary" href="/admin">← Admin</Link>}
      />

      <section className={`card p-5 sm:p-6 ${enabled ? "ring-2 ring-[var(--rcg-green)]/20" : ""}`}>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Operational settings</p>
            <h2 className="text-2xl font-black">Closing-time rules</h2>
            <p className="mt-2 text-sm text-[var(--rcg-muted)]">
              Last management escalation: {settings?.last_alert_sent_at ? formatUkDateTime(settings.last_alert_sent_at) : "None sent yet"}
            </p>
          </div>
          <span className={`badge ${enabled ? "" : "!bg-slate-100 !text-slate-600"}`}>{enabled ? "Enabled" : "Disabled"}</span>
        </div>

        <form action={updateAlertSettings} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="siteName">Site name</label>
            <input className="input" id="siteName" name="siteName" maxLength={120} defaultValue={settings?.site_name ?? "Redcatch Community Garden"} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="timezone">Timezone</label>
            <input className="input" id="timezone" name="timezone" defaultValue={settings?.timezone ?? "Europe/London"} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="closingTime">Normal closing time</label>
            <input className="input" id="closingTime" name="closingTime" type="time" defaultValue={closingTime} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="graceMinutes">Grace period before self-check (minutes)</label>
            <input className="input" id="graceMinutes" name="graceMinutes" type="number" min="0" max="240" defaultValue={settings?.alert_grace_minutes ?? 15} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="presenceCheckEscalationMinutes">Wait for user response (minutes)</label>
            <input
              className="input"
              id="presenceCheckEscalationMinutes"
              name="presenceCheckEscalationMinutes"
              type="number"
              min="1"
              max="120"
              defaultValue={settings?.presence_check_escalation_minutes ?? 10}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="repeatMinutes">Management repeat interval (minutes)</label>
            <input className="input" id="repeatMinutes" name="repeatMinutes" type="number" min="15" max="1440" defaultValue={settings?.alert_repeat_minutes ?? 60} required />
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-[var(--rcg-border)] bg-[var(--rcg-green-mist)] p-4 sm:col-span-2">
            <input name="presenceCheckEnabled" type="checkbox" defaultChecked={presenceCheckEnabled} className="h-5 w-5 accent-[var(--rcg-green)]" />
            <span>
              <strong>Ask the user first</strong>
              <span className="mt-1 block text-sm text-[var(--rcg-muted)]">
                After closing + grace, send a presence check to the person. If they do not resolve it within the response window, escalate to management.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-[var(--rcg-border)] bg-[var(--rcg-green-mist)] p-4 sm:col-span-2">
            <input name="alertEnabled" type="checkbox" defaultChecked={enabled} className="h-5 w-5 accent-[var(--rcg-green)]" />
            <span>
              <strong>Enable after-hours safety workflow</strong>
              <span className="mt-1 block text-sm text-[var(--rcg-muted)]">
                When enabled, the five-minute safety checker can send user presence checks and unresolved management escalations.
              </span>
            </span>
          </label>

          <div className="sm:col-span-2">
            <button className="btn btn-primary" type="submit">Save safety settings</button>
          </div>
        </form>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
        <article className="card p-5 sm:p-6">
          <p className="section-kicker">Escalation recipients</p>
          <h2 className="text-2xl font-black">Safety email team</h2>
          <p className="mt-2 text-sm text-[var(--rcg-muted)]">These addresses are contacted when a user presence check remains unresolved.</p>

          <form action={addAlertRecipient} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input className="input flex-1" name="email" type="email" placeholder="name@example.com" aria-label="Recipient email" required />
            <button className="btn btn-secondary" type="submit">Add recipient</button>
          </form>

          <div className="mt-5 space-y-3">
            {recipients.length ? recipients.map((recipient) => (
              <div key={recipient.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-[var(--rcg-border)] bg-white p-4 sm:flex-row sm:items-center">
                <div>
                  <strong>{recipient.email}</strong>
                  <div className="mt-1"><span className="badge">{recipient.active ? "Active" : "Paused"}</span></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={setAlertRecipientActive}>
                    <input type="hidden" name="recipientId" value={recipient.id} />
                    <input type="hidden" name="active" value={String(!recipient.active)} />
                    <button className="btn btn-soft !min-h-9 !px-3" type="submit">{recipient.active ? "Pause" : "Activate"}</button>
                  </form>
                  <form action={removeAlertRecipient}>
                    <input type="hidden" name="recipientId" value={recipient.id} />
                    <button className="btn btn-secondary !min-h-9 !px-3" type="submit">Remove</button>
                  </form>
                </div>
              </div>
            )) : (
              <div className="empty-state">
                <h3>No recipients yet</h3>
                <p>Add the people who should receive unresolved after-hours escalations.</p>
              </div>
            )}
          </div>
        </article>

        <aside className="decorative-panel">
          <div className="decorative-panel-icon">✉</div>
          <h2>Test management email</h2>
          <p className="decorative-panel-copy">Send a test through the real Supabase → Resend path before relying on after-hours escalation.</p>
          <form action={sendAlertTest} className="relative z-10 mt-5">
            <button className="btn btn-secondary w-full" type="submit" disabled={!recipients.some((recipient) => recipient.active)}>
              Send test email
            </button>
          </form>
          <span className="botanical-corner" aria-hidden="true" />
        </aside>
      </section>
    </div>
  );
}
