import type { Metadata } from "next";
import Link from "next/link";
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

  const cards = [
    ["Profiles", profilesResult.count ?? 0],
    ["Sessions", sessionsResult.count ?? 0],
    ["Open sessions", openResult.count ?? 0],
    ["Alert scheduler", settings?.alert_enabled ? "Enabled" : "Disabled"],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.12em] text-[var(--rcg-orange)]">Technical support</p>
          <h1 className="mt-1 text-3xl font-black">Developer diagnostics</h1>
          <p className="mt-2 max-w-2xl text-[var(--rcg-muted)]">Operational health, recent audit activity and kiosk events. Access is limited to owner and developer roles.</p>
        </div>
        <Link className="btn btn-secondary" href="/admin">Admin dashboard</Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div className="card p-5" key={String(label)}>
            <p className="text-sm font-bold text-[var(--rcg-muted)]">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </div>
        ))}
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-xl font-black">Runtime configuration</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <p><strong>Site:</strong> {settings?.site_name ?? "—"}</p>
          <p><strong>Timezone:</strong> {settings?.timezone ?? "—"}</p>
          <p><strong>Closing time:</strong> {String(settings?.closing_time ?? "—").slice(0, 5)}</p>
          <p><strong>Grace:</strong> {settings?.alert_grace_minutes ?? "—"} min</p>
          <p><strong>Repeat:</strong> {settings?.alert_repeat_minutes ?? "—"} min</p>
          <p><strong>Last alert:</strong> {formatUkDateTime(settings?.last_alert_sent_at)}</p>
        </div>
        <div className="mt-5 rounded-xl border border-[var(--rcg-border)] bg-white p-4 text-sm">
          <strong>Feature state</strong>
          <p className="mt-2 text-[var(--rcg-muted)]">MVP features are fixed in code. Offline attendance queueing, QR check-in, richer charts, Google Drive export, activity tags and volunteer milestones remain deliberately deferred by the approved architecture.</p>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-xl font-black">Recent audit events</h2>
        <div className="mt-4 table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Action</th><th>Metadata</th></tr></thead>
            <tbody>{audit.length ? audit.map((row) => (
              <tr key={row.id}><td>{formatUkDateTime(row.created_at)}</td><td className="font-bold">{row.action}</td><td className="max-w-xl break-words text-xs">{row.metadata ? JSON.stringify(row.metadata) : "—"}</td></tr>
            )) : <tr><td colSpan={3} className="text-[var(--rcg-muted)]">No audit events yet.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-xl font-black">Recent kiosk events</h2>
        <div className="mt-4 table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Event</th><th>Identifier</th><th>Device</th></tr></thead>
            <tbody>{kiosk.length ? kiosk.map((row) => (
              <tr key={row.id}><td>{formatUkDateTime(row.created_at)}</td><td className="font-bold">{row.event_type}</td><td>{row.entered_identifier ?? "—"}</td><td>{row.device_label ?? "—"}</td></tr>
            )) : <tr><td colSpan={4} className="text-[var(--rcg-muted)]">No kiosk events yet.</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
