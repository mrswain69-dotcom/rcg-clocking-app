import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminProfile } from "@/lib/auth";
import { durationHours, formatUkDateTime } from "@/lib/dates";
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
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.12em] text-[var(--rcg-orange)]">Administration</p>
          <h1 className="mt-1 text-3xl font-black">Attendance reports</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">Filter by date and user, then export detailed records or summary totals as CSV.</p>
        </div>
        <Link className="btn btn-secondary" href="/admin">Back to admin</Link>
      </div>

      <section className="card p-5 sm:p-6">
        <form className="grid gap-4 md:grid-cols-4" method="get">
          <div><label className="mb-1 block text-sm font-bold" htmlFor="from">From</label><input className="input" id="from" name="from" type="date" defaultValue={from} required /></div>
          <div><label className="mb-1 block text-sm font-bold" htmlFor="to">To</label><input className="input" id="to" name="to" type="date" defaultValue={to} required /></div>
          <div><label className="mb-1 block text-sm font-bold" htmlFor="profile">User</label><select className="input" id="profile" name="profile" defaultValue={selectedProfile}><option value="all">All users</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}{profile.is_active ? "" : " (archived)"}</option>)}</select></div>
          <div className="flex items-end"><button className="btn btn-primary w-full" type="submit">Run report</button></div>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><p className="text-sm font-bold text-[var(--rcg-muted)]">Visits</p><p className="mt-2 text-3xl font-black">{rows.length}</p></div>
        <div className="card p-5"><p className="text-sm font-bold text-[var(--rcg-muted)]">People</p><p className="mt-2 text-3xl font-black">{summary.length}</p></div>
        <div className="card p-5"><p className="text-sm font-bold text-[var(--rcg-muted)]">Recorded hours</p><p className="mt-2 text-3xl font-black">{totalHours.toFixed(2)}</p></div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h2 className="text-xl font-black">Summary</h2>
          <ReportExports rows={rows} summary={summary} from={from} to={to} />
        </div>
        <div className="mt-4 table-wrap"><table><thead><tr><th>User</th><th>Visits</th><th>Hours</th></tr></thead><tbody>{summary.length ? summary.map((row) => <tr key={row.email}><td><strong>{row.full_name}</strong><div className="text-xs text-[var(--rcg-muted)]">{row.email}</div></td><td>{row.visits}</td><td>{row.hours.toFixed(2)}</td></tr>) : <tr><td colSpan={3} className="text-[var(--rcg-muted)]">No attendance in this date range.</td></tr>}</tbody></table></div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-xl font-black">Detailed records</h2>
        <div className="mt-4 table-wrap"><table><thead><tr><th>User</th><th>Clock in</th><th>Clock out</th><th>Hours</th><th>Method</th><th>Notes</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td className="font-bold">{row.full_name}</td><td>{formatUkDateTime(row.clock_in_at)}</td><td>{formatUkDateTime(row.clock_out_at)}</td><td>{row.hours.toFixed(2)}</td><td className="capitalize">{row.clock_in_method}</td><td>{row.notes ?? "—"}</td></tr>) : <tr><td colSpan={6} className="text-[var(--rcg-muted)]">No records found.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
