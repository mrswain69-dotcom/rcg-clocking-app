import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard } from "@/components/brand/MetricCard";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireProfile } from "@/lib/auth";
import { durationHours, formatHoursMinutes, formatUkDateTime } from "@/lib/dates";
import { HistoryExport } from "./history-client";

export const metadata: Metadata = { title: "Attendance history" };

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function HistoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const weekStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - mondayOffset));
  const todayValue = dateValue(today);
  const monthStartValue = dateValue(monthStart);
  const weekStartValue = dateValue(weekStart);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ? params.from! : monthStartValue;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? params.to! : todayValue;

  const { supabase, profile } = await requireProfile();
  const { data } = await supabase
    .from("sessions")
    .select("id,clock_in_at,clock_out_at,clock_in_method,clock_out_method")
    .eq("profile_id", profile.id)
    .gte("clock_in_at", `${from}T00:00:00.000Z`)
    .lte("clock_in_at", `${to}T23:59:59.999Z`)
    .order("clock_in_at", { ascending: false })
    .limit(1000);
  const sessions = data ?? [];

  const totalHours = sessions.reduce(
    (sum, session) => sum + durationHours(session.clock_in_at, session.clock_out_at),
    0,
  );
  const averageHours = sessions.length ? totalHours / sessions.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your time at Redcatch"
        title="Your history"
        description="See the time you've spent helping at Redcatch Community Garden, filter by date and export your records."
        action={<HistoryExport sessions={sessions} from={from} to={to} />}
      />

      <section className="metrics-grid">
        <MetricCard icon="▤" label="Visits in range" value={String(sessions.length)} detail={`${from} to ${to}`} tone="orange" />
        <MetricCard icon="◷" label="Hours in range" value={formatHoursMinutes(totalHours)} detail="Recorded attendance" />
        <MetricCard icon="↗" label="Average visit" value={formatHoursMinutes(averageHours)} detail={sessions.length ? "Per session" : "No sessions yet"} tone="neutral" />
      </section>

      <section className="card p-5 sm:p-6">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="section-kicker">Choose dates</p>
            <h2 className="text-2xl font-black">Filter your visits</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-soft !min-h-10 !px-4" href={`/history?from=${weekStartValue}&to=${todayValue}`}>This week</Link>
            <Link className="btn btn-soft !min-h-10 !px-4" href={`/history?from=${monthStartValue}&to=${todayValue}`}>This month</Link>
          </div>
        </div>

        <form className="grid gap-4 sm:grid-cols-3" method="get">
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="from">From</label><input className="input" id="from" name="from" type="date" defaultValue={from} required /></div>
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="to">To</label><input className="input" id="to" name="to" type="date" defaultValue={to} required /></div>
          <div className="flex items-end"><button className="btn btn-primary w-full" type="submit">Apply dates</button></div>
        </form>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="mb-4">
          <p className="section-kicker">Attendance</p>
          <h2 className="text-2xl font-black">Session records</h2>
        </div>
        {sessions.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Clock in</th><th>Clock out</th><th>Duration</th><th>Method</th></tr></thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>{formatUkDateTime(session.clock_in_at)}</td>
                    <td>{formatUkDateTime(session.clock_out_at)}</td>
                    <td className="font-extrabold">{formatHoursMinutes(durationHours(session.clock_in_at, session.clock_out_at))}</td>
                    <td><span className="badge">{session.clock_in_method}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <img src="/brand/staff-fox.svg" alt="" />
            <h3>No attendance in this range</h3>
            <p>Try a wider date range or clock in on your next visit.</p>
          </div>
        )}
      </section>
    </div>
  );
}
