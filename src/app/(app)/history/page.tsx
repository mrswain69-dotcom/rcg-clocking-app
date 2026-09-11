import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { durationHours, formatUkDateTime } from "@/lib/dates";
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
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ? params.from! : dateValue(monthStart);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? params.to! : dateValue(today);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.12em] text-[var(--rcg-orange)]">Your records</p>
          <h1 className="mt-1 text-3xl font-black">Attendance history</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">
            {sessions.length} visits · {totalHours.toFixed(2)} recorded hours
          </p>
        </div>
        <HistoryExport sessions={sessions} from={from} to={to} />
      </div>

      <section className="card p-5 sm:p-6">
        <form className="grid gap-4 sm:grid-cols-3" method="get">
          <div><label className="mb-1 block text-sm font-bold" htmlFor="from">From</label><input className="input" id="from" name="from" type="date" defaultValue={from} required /></div>
          <div><label className="mb-1 block text-sm font-bold" htmlFor="to">To</label><input className="input" id="to" name="to" type="date" defaultValue={to} required /></div>
          <div className="flex items-end"><button className="btn btn-primary w-full" type="submit">Apply dates</button></div>
        </form>
      </section>

      <section className="card p-5 sm:p-6">
        {sessions.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Clock in</th><th>Clock out</th><th>Hours</th><th>Method</th></tr></thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>{formatUkDateTime(session.clock_in_at)}</td>
                    <td>{formatUkDateTime(session.clock_out_at)}</td>
                    <td>{durationHours(session.clock_in_at, session.clock_out_at).toFixed(2)}</td>
                    <td className="capitalize">{session.clock_in_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[var(--rcg-muted)]">No attendance records in this date range.</p>
        )}
      </section>
    </div>
  );
}
