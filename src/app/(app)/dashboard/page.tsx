import type { Metadata } from "next";
import Link from "next/link";
import { DecorativePanel } from "@/components/brand/DecorativePanel";
import { MetricCard } from "@/components/brand/MetricCard";
import { requireProfile } from "@/lib/auth";
import { durationHours, formatHoursMinutes, formatUkTime } from "@/lib/dates";
import { clockIn, clockOut } from "./actions";

export const metadata: Metadata = { title: "Dashboard" };

function londonDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function weekStartKey(todayKey: string) {
  const [year, month, day] = todayKey.split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (current.getUTCDay() + 6) % 7;
  current.setUTCDate(current.getUTCDate() - mondayOffset);
  return current.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const { supabase, profile } = await requireProfile();
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: openSession }, { data: sessionsData }] = await Promise.all([
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
      .gte("clock_in_at", cutoff)
      .order("clock_in_at", { ascending: false })
      .limit(1000),
  ]);

  const sessions = sessionsData ?? [];
  const isIn = Boolean(openSession);
  const firstName = profile.full_name.trim().split(/\s+/)[0] || profile.full_name;
  const todayKey = londonDateKey(new Date());
  const monthStart = `${todayKey.slice(0, 7)}-01`;
  const weekStart = weekStartKey(todayKey);

  const totals = (from: string) => {
    const matching = sessions.filter((session) => londonDateKey(new Date(session.clock_in_at)) >= from);
    const hours = matching.reduce((sum, session) => sum + durationHours(session.clock_in_at, session.clock_out_at), 0);
    return { count: matching.length, hours };
  };

  const todaySessions = sessions.filter((session) => londonDateKey(new Date(session.clock_in_at)) === todayKey);
  const todayHours = todaySessions.reduce((sum, session) => sum + durationHours(session.clock_in_at, session.clock_out_at), 0);
  const week = totals(weekStart);
  const month = totals(monthStart);
  const recentSessions = sessions.slice(0, 5);
  const fullDate = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <section className="dashboard-hero" aria-label="People, plants and community at Redcatch Community Garden" />

      <div className="dashboard-greeting">
        <div>
          <p className="section-kicker">Welcome to Redcatch</p>
          <h1>Hello {firstName}!</h1>
          <p className="page-description">Good to see you. Here&apos;s your clocking status for today.</p>
        </div>
        <p className="dashboard-date">{fullDate} ☀</p>
      </div>

      <section className="status-card">
        <div className="status-grid">
          <div>
            <p className="status-label">You are currently</p>
            <div className="status-row">
              <span className={`status-dot ${isIn ? "active" : ""}`} />
              <h2 className="status-title">{isIn ? "On site" : "Off site"}</h2>
            </div>
            <p className="status-copy">
              {openSession
                ? `Clocked in at ${formatUkTime(openSession.clock_in_at)}. Remember to clock out when you leave.`
                : "Clock in when you arrive on site so the team knows you're here."}
            </p>
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

      <section className="metrics-grid" aria-label="Your attendance summary">
        <MetricCard icon="▣" label="Today" value={formatHoursMinutes(todayHours)} detail={todaySessions.length ? `${todaySessions.length} session${todaySessions.length === 1 ? "" : "s"}` : "No sessions yet"} tone="orange" />
        <MetricCard icon="◷" label="This Week" value={formatHoursMinutes(week.hours)} detail={`${week.count} session${week.count === 1 ? "" : "s"}`} tone="orange" />
        <MetricCard icon="♧" label="This Month" value={formatHoursMinutes(month.hours)} detail={`${month.count} session${month.count === 1 ? "" : "s"}`} />
      </section>

      <section className="dashboard-lower">
        <div className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="section-kicker">Your time</p>
              <h2 className="text-2xl font-black">Recent Sessions</h2>
            </div>
            <Link className="font-extrabold text-[var(--rcg-green-dark)]" href="/history">View all →</Link>
          </div>

          {recentSessions.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Time in</th><th>Time out</th><th>Duration</th></tr></thead>
                <tbody>
                  {recentSessions.map((session) => (
                    <tr key={session.id}>
                      <td>{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" }).format(new Date(session.clock_in_at))}</td>
                      <td>{formatUkTime(session.clock_in_at)}</td>
                      <td>{formatUkTime(session.clock_out_at)}</td>
                      <td className="font-extrabold">{formatHoursMinutes(durationHours(session.clock_in_at, session.clock_out_at))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <img src="/brand/staff-fox.svg" alt="" />
              <h3>No visits yet</h3>
              <p>Your first clock-in will appear here.</p>
            </div>
          )}
        </div>

        <DecorativePanel
          icon="🌱"
          title="Thank you!"
          copy="Your time helps keep Redcatch Community Garden growing and everyone on site accounted for."
          quote="People · Plants · Community"
        />
      </section>
    </div>
  );
}
