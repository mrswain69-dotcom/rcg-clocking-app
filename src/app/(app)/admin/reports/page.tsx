import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard } from "@/components/brand/MetricCard";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireAdminProfile } from "@/lib/auth";
import { durationHours, formatHoursMinutes, formatUkDateTime } from "@/lib/dates";
import { ReportExports } from "./report-export";

export const metadata: Metadata = { title: "Attendance reports" };

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; profile?: string }>;
};

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ? params.from! : dateInputValue(monthStart);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? params.to! : dateInputValue(today);
  const selectedProfile = params.profile ?? "all";

  const { supabase } = await requireAdminProfile();
  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id,full_name,email,is_active")
    .order("full_name");
  const profiles = profilesData ?? [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  let query = supabase
    .from("sessions")
    .select("id,profile_id,clock_in_at,clock_out_at,clock_in_method,clock_out_method,notes")
    .gte("clock_in_at", `${from}T00:00:00.000Z`)
    .lte("clock_in_at", `${to}T23:59:59.999Z`)
    .order("clock_in_at", { ascending: false })
    .limit(5000);

  if (selectedProfile !== "all") query = query.eq("profile_id", selectedProfile);
  const { data: sessionsData } = await query;
  const sessions = sessionsData ?? [];

  const rows = sessions.map((session) => {
    const profile = profileById.get(session.profile_id);
    return {
      id: session.id,
      full_name: profile?.full_name ?? "Unknown user",
      email: profile?.email ?? "",
      clock_in_at: session.clock_in_at,
      clock_out_at: session.clock_out_at,
      clock_in_method: session.clock_in_method,
      clock_out_method: session.clock_out_method,
      notes: session.notes,
      hours: durationHours(session.clock_in_at, session.clock_out_at),
    };
  });

  const summaryMap = new Map<string, { full_name: string; email: string; visits: number; hours: number }>();
  for (const row of rows) {
    const current = summaryMap.get(row.email) ?? { full_name: row.full_name, email: row.email, visits: 0, hours: 0 };
    current.visits += 1;
    current.hours += row.hours;
    summaryMap.set(row.email, current);
  }
  const summary = [...summaryMap.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Attendance reports"
        description="Filter by date and person, review totals and export detailed or summary records."
        action={<Link className="btn btn-secondary" href="/admin">← Admin</Link>}
      />

      <section className="card p-5 sm:p-6">
        <div className="mb-5"><p className="section-kicker">Report filters</p><h2 className="text-2xl font-black">Choose what to include</h2></div>
        <form className="grid gap-4 md:grid-cols-4" method="get">
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="from">From</label><input className="input" id="from" name="from" type="date" defaultValue={from} required /></div>
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="to">To</label><input className="input" id="to" name="to" type="date" defaultValue={to} required /></div>
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="profile">User</label><select className="input" id="profile" name="profile" defaultValue={selectedProfile}><option value="all">All users</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}{profile.is_active ? "" : " (archived)"}</option>)}</select></div>
          <div className="flex items-end"><button className="btn btn-primary w-full" type="submit">Run report</button></div>
        </form>
      </section>

      <section className="metrics-grid">
        <MetricCard icon="▤" label="Visits" value={String(rows.length)} detail="Sessions in range" tone="orange" />
        <MetricCard icon="👥" label="People" value={String(summary.length)} detail="People represented" />
        <MetricCard icon="◷" label="Recorded hours" value={formatHoursMinutes(totalHours)} detail={`${from} to ${to}`} tone="neutral" />
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><p className="section-kicker">Summary</p><h2 className="text-2xl font-black">People & hours</h2></div>
          <ReportExports rows={rows} summary={summary} from={from} to={to} />
        </div>
        <div className="mt-4 table-wrap"><table><thead><tr><th>User</th><th>Visits</th><th>Hours</th></tr></thead><tbody>{summary.length ? summary.map((row) => <tr key={row.email}><td><strong>{row.full_name}</strong><div className="text-xs text-[var(--rcg-muted)]">{row.email}</div></td><td>{row.visits}</td><td className="font-extrabold">{formatHoursMinutes(row.hours)}</td></tr>) : <tr><td colSpan={3} className="text-[var(--rcg-muted)]">No attendance in this date range.</td></tr>}</tbody></table></div>
      </section>

      <section className="card p-5 sm:p-6">
        <div><p className="section-kicker">Detail</p><h2 className="text-2xl font-black">Session records</h2></div>
        <div className="mt-4 table-wrap"><table><thead><tr><th>User</th><th>Clock in</th><th>Clock out</th><th>Duration</th><th>Method</th><th>Notes</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td className="font-extrabold">{row.full_name}</td><td>{formatUkDateTime(row.clock_in_at)}</td><td>{formatUkDateTime(row.clock_out_at)}</td><td className="font-extrabold">{formatHoursMinutes(row.hours)}</td><td><span className="badge">{row.clock_in_method}</span></td><td>{row.notes ?? "—"}</td></tr>) : <tr><td colSpan={6} className="text-[var(--rcg-muted)]">No records found.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
