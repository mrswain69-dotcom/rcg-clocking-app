import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { durationHours, formatUkDateTime } from "@/lib/dates";
import { HistoryExport } from "./history-client";

export const metadata: Metadata = { title: "Attendance history" };

export default async function HistoryPage() {
  const { supabase, profile } = await requireProfile();
  const { data } = await supabase
    .from("sessions")
    .select("id,clock_in_at,clock_out_at,clock_in_method,clock_out_method")
    .eq("profile_id", profile.id)
    .order("clock_in_at", { ascending: false })
    .limit(500);
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
        <HistoryExport sessions={sessions} />
      </div>

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
          <p className="text-[var(--rcg-muted)]">No attendance records yet.</p>
        )}
      </section>
    </div>
  );
}
