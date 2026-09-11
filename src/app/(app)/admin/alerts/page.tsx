import type { Metadata } from "next";
import Link from "next/link";
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
      .select("id,site_name,timezone,closing_time,alert_enabled,alert_grace_minutes,alert_repeat_minutes,last_alert_sent_at")
      .limit(1)
      .single(),
    supabase.from("alert_recipients").select("id,email,active,created_at").order("email"),
  ]);

  const recipients = recipientsData ?? [];
  const closingTime = String(settings?.closing_time ?? "18:00").slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.12em] text-[var(--rcg-orange)]">Site safety</p>
          <h1 className="mt-1 text-3xl font-black">After-hours alerts</h1>
          <p className="mt-2 max-w-2xl text-[var(--rcg-muted)]">
            Manage the site name and email selected people when someone remains clocked in after the normal closing time and grace period.
          </p>
        </div>
        <Link className="btn btn-secondary" href="/admin">Back to admin</Link>
      </div>

      <section className="card p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Operational settings</h2>
            <p className="mt-1 text-sm text-[var(--rcg-muted)]">
              Status: <strong>{settings?.alert_enabled ? "Enabled" : "Disabled"}</strong>
              {settings?.last_alert_sent_at ? ` · Last sent ${formatUkDateTime(settings.last_alert_sent_at)}` : " · No alert sent yet"}
            </p>
          </div>
        </div>

        <form action={updateAlertSettings} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-bold" htmlFor="siteName">Site name</label>
            <input className="input" id="siteName" name="siteName" maxLength={120} defaultValue={settings?.site_name ?? "Redcatch Community Garden"} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold" htmlFor="timezone">Timezone</label>
            <input className="input" id="timezone" name="timezone" defaultValue={settings?.timezone ?? "Europe/London"} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold" htmlFor="closingTime">Normal closing time</label>
            <input className="input" id="closingTime" name="closingTime" type="time" defaultValue={closingTime} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold" htmlFor="graceMinutes">Grace period (minutes)</label>
            <input className="input" id="graceMinutes" name="graceMinutes" type="number" min="0" max="240" defaultValue={settings?.alert_grace_minutes ?? 15} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold" htmlFor="repeatMinutes">Repeat interval (minutes)</label>
            <input className="input" id="repeatMinutes" name="repeatMinutes" type="number" min="15" max="1440" defaultValue={settings?.alert_repeat_minutes ?? 60} required />
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-[var(--rcg-border)] bg-white p-4 sm:col-span-2">
            <input name="alertEnabled" type="checkbox" defaultChecked={settings?.alert_enabled ?? false} className="h-5 w-5" />
            <span><strong>Enable after-hours safety alerts</strong><span className="mt-1 block text-sm text-[var(--rcg-muted)]">Only enable this after recipients and email delivery have been tested.</span></span>
          </label>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" type="submit">Save operational settings</button>
          </div>
        </form>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-xl font-black">Alert recipients</h2>
        <p className="mt-1 text-sm text-[var(--rcg-muted)]">Each active recipient receives an individual safety email; addresses are not exposed to other recipients.</p>

        <form action={addAlertRecipient} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input className="input flex-1" name="email" type="email" placeholder="name@example.com" aria-label="Recipient email" required />
          <button className="btn btn-secondary" type="submit">Add recipient</button>
        </form>

        <div className="mt-5 table-wrap">
          <table>
            <thead><tr><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {recipients.length ? recipients.map((recipient) => (
                <tr key={recipient.id}>
                  <td className="font-bold">{recipient.email}</td>
                  <td>{recipient.active ? "Active" : "Paused"}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <form action={setAlertRecipientActive}>
                        <input type="hidden" name="recipientId" value={recipient.id} />
                        <input type="hidden" name="active" value={String(!recipient.active)} />
                        <button className="btn btn-secondary !min-h-9 !px-3" type="submit">{recipient.active ? "Pause" : "Activate"}</button>
                      </form>
                      <form action={removeAlertRecipient}>
                        <input type="hidden" name="recipientId" value={recipient.id} />
                        <button className="btn btn-secondary !min-h-9 !px-3" type="submit">Remove</button>
                      </form>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="text-[var(--rcg-muted)]">No alert recipients configured yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-xl font-black">Email delivery test</h2>
        <p className="mt-2 text-sm text-[var(--rcg-muted)]">
          The implementation uses Resend for transactional email. A verified sending domain and the Supabase Edge Function secret <code>RESEND_API_KEY</code> are required before this test can succeed.
        </p>
        <form action={sendAlertTest} className="mt-4">
          <button className="btn btn-secondary" type="submit" disabled={!recipients.some((recipient) => recipient.active)}>Send test to active recipients</button>
        </form>
      </section>
    </div>
  );
}
