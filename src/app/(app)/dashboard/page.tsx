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
  const firstName = profile.full_name.trim().split(/\s+/)[0] || profile.full_name;

  return (
    <div className="space-y-7">
      <div>
        <p className="section-kicker">Welcome to Redcatch</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--rcg-green-dark)] sm:text-4xl">Hello {firstName}!</h1>
        <p className="mt-2 text-[var(--rcg-muted)]">Good to see you. Here&apos;s your clocking status for today.</p>
      </div>

      <section className="card p-6 sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(30rem,1.35fr)] lg:items-center">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[.12em] text-[var(--rcg-muted)]">You are currently</p>
            <div className="mt-2 flex items-center gap-3">
              <span className={`h-4 w-4 rounded-full ${isIn ? "bg-[var(--rcg-green)]" : "bg-slate-300"}`} />
              <h2 className="text-3xl font-black tracking-tight">{isIn ? "On site" : "Off site"}</h2>
            </div>
            {openSession ? (
              <p className="mt-2 text-sm text-[var(--rcg-muted)]">
                Clocked in since {formatUkDateTime(openSession.clock_in_at)}.
              </p>
            ) : (
              <p className="mt-2 max-w-sm text-sm text-[var(--rcg-muted)]">Clock in when you arrive so the team knows you&apos;re on site.</p>
            )}
          </div>

          <div className="clock-actions">
            <form action={clockIn}>
              <button className="clock-btn clock-in" type="submit" disabled={isIn}>
                <span>→ Clock In</span>
                <small>I&apos;m on site now</small>
              </button>
            </form>
            <form action={clockOut}>
              <button className="clock-btn clock-out" type="submit" disabled={!isIn}>
                <span>↪ Clock Out</span>
                <small>I&apos;m leaving site</small>
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_17rem]">
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-xl font-black">Recent visits</h2>
            <Link className="text-sm font-extrabold text-[var(--rcg-green)]" href="/history">View full history →</Link>
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
        </div>

        <aside className="card border-[var(--rcg-green)]/20 bg-[var(--rcg-green-soft)] p-6">
          <div className="text-3xl">🌱</div>
          <h2 className="mt-3 text-xl font-black text-[var(--rcg-green-dark)]">Thank you!</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--rcg-green-dark)]">Your time helps keep Redcatch Community Garden growing and everyone on site accounted for.</p>
        </aside>
      </section>
    </div>
  );
}
