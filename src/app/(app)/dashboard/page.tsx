import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { formatUkDateTime, durationHours } from "@/lib/dates";
import { clockIn, clockOut } from "./actions";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { supabase, profile } = await requireProfile();

  const [{ data: openSession }, { data: recentSessions }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id,clock_in_at")
      .eq("profile_id", profile.id)
      .is("clock_out_at", null)
      .maybeSingle(),
    supabase
      .from("sessions")
      .select("id,clock_in_at,clock_out_at")
      .eq("profile_id", profile.id)
      .order("clock_in_at", { ascending: false })
      .limit(5),
  ]);

  const isIn = Boolean(openSession);

  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.12em] text-[var(--rcg-orange)]">Welcome</p>
        <h1 className="mt-1 text-3xl font-black sm:text-4xl">{profile.full_name}</h1>
        <p className="mt-2 text-[var(--rcg-muted)]">Record your attendance and check your recent hours.</p>
      </div>

      <section className="card p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.12em] text-[var(--rcg-muted)]">Current status</p>
            <div className="mt-2 flex items-center gap-3">
              <span className={`h-3.5 w-3.5 rounded-full ${isIn ? "bg-emerald-500" : "bg-slate-400"}`} />
              <h2 className="text-3xl font-black">{isIn ? "Clocked in" : "Clocked out"}</h2>
            </div>
            {openSession ? (
              <p className="mt-2 text-sm text-[var(--rcg-muted)]">
                Since {formatUkDateTime(openSession.clock_in_at)}
              </p>
            ) : (
              <p className="mt-2 text-sm text-[var(--rcg-muted)]">You are not currently recorded as on site.</p>
            )}
          </div>

          <form action={isIn ? clockOut : clockIn}>
            <button className="btn-primary min-w-48 text-lg" type="submit">
              {isIn ? "Clock out" : "Clock in"}
            </button>
          </form>
        </div>
      </section>

      <section className="card p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-black">Recent visits</h2>
          <Link className="text-sm font-bold text-[var(--rcg-green)]" href="/history">View full history →</Link>
        </div>
        {recentSessions?.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Clock in</th><th>Clock out</th><th>Hours</th></tr></thead>
              <tbody>
                {recentSessions.map((session) => (
                  <tr key={session.id}>
                    <td>{formatUkDateTime(session.clock_in_at)}</td>
                    <td>{formatUkDateTime(session.clock_out_at)}</td>
                    <td>{durationHours(session.clock_in_at, session.clock_out_at).toFixed(2)}</td>
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
