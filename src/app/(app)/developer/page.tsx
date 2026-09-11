import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard } from "@/components/brand/MetricCard";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireDeveloperProfile } from "@/lib/auth";
import { formatUkDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Developer diagnostics" };

export default async function DeveloperPage() {
  const { supabase } = await requireDeveloperProfile();

  const [profilesResult, sessionsResult, openResult, auditResult, kioskResult, settingsResult] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("sessions").select("id", { count: "exact", head: true }),
    supabase.from("sessions").select("id", { count: "exact", head: true }).is("clock_out_at", null),
    supabase.from("audit_log").select("id,action,created_at,metadata").order("created_at", { ascending: false }).limit(20),
    supabase.from("kiosk_events").select("id,event_type,entered_identifier,device_label,created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("settings").select("site_name,timezone,closing_time,alert_enabled,alert_grace_minutes,alert_repeat_minutes,last_alert_sent_at").limit(1).maybeSingle(),
  ]);

  const settings = settingsResult.data;
  const audit = auditResult.data ?? [];
  const kiosk = kioskResult.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Technical support"
        title="Developer diagnostics"
        description="Operational health, runtime configuration, audit activity and kiosk events for maintenance and support."
        action={<Link className="btn btn-secondary" href="/admin">← Admin</Link>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon="👥" label="Profiles" value={String(profilesResult.count ?? 0)} detail="All account profiles" />
        <MetricCard icon="▤" label="Sessions" value={String(sessionsResult.count ?? 0)} detail="All attendance records" tone="orange" />
        <MetricCard icon="●" label="Open sessions" value={String(openResult.count ?? 0)} detail="Currently clocked in" />
        <MetricCard icon="✉" label="Alert scheduler" value={settings?.alert_enabled ? "Enabled" : "Disabled"} detail="After-hours safety" tone="neutral" />
      </section>

      <section className="card p-5 sm:p-6">
        <div className="mb-4"><p className="section-kicker">Configuration</p><h2 className="text-2xl font-black">Runtime settings</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <p className="rounded-xl bg-[var(--rcg-green-mist)] p-3"><strong>Site</strong><br />{settings?.site_name ?? "—"}</p>
          <p className="rounded-xl bg-white p-3 ring-1 ring-[var(--rcg-border)]"><strong>Timezone</strong><br />{settings?.timezone ?? "—"}</p>
          <p className="rounded-xl bg-white p-3 ring-1 ring-[var(--rcg-border)]"><strong>Closing time</strong><br />{String(settings?.closing_time ?? "—").slice(0, 5)}</p>
          <p className="rounded-xl bg-white p-3 ring-1 ring-[var(--rcg-border)]"><strong>Grace</strong><br />{settings?.alert_grace_minutes ?? "—"} min</p>
          <p className="rounded-xl bg-white p-3 ring-1 ring-[var(--rcg-border)]"><strong>Repeat</strong><br />{settings?.alert_repeat_minutes ?? "—"} min</p>
          <p className="rounded-xl bg-white p-3 ring-1 ring-[var(--rcg-border)]"><strong>Last alert</strong><br />{formatUkDateTime(settings?.last_alert_sent_at)}</p>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="mb-4"><p className="section-kicker">System activity</p><h2 className="text-2xl font-black">Recent audit events</h2></div>
        <div className="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Metadata</th></tr></thead><tbody>{audit.length ? audit.map((row) => <tr key={row.id}><td>{formatUkDateTime(row.created_at)}</td><td className="font-extrabold">{row.action}</td><td className="max-w-xl break-words text-xs text-[var(--rcg-muted)]">{row.metadata ? JSON.stringify(row.metadata) : "—"}</td></tr>) : <tr><td colSpan={3} className="text-[var(--rcg-muted)]">No audit events yet.</td></tr>}</tbody></table></div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="mb-4"><p className="section-kicker">Kiosk</p><h2 className="text-2xl font-black">Recent kiosk events</h2></div>
        <div className="table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Identifier</th><th>Device</th></tr></thead><tbody>{kiosk.length ? kiosk.map((row) => <tr key={row.id}><td>{formatUkDateTime(row.created_at)}</td><td><span className="badge">{row.event_type}</span></td><td>{row.entered_identifier ?? "—"}</td><td>{row.device_label ?? "—"}</td></tr>) : <tr><td colSpan={4} className="text-[var(--rcg-muted)]">No kiosk events yet.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
