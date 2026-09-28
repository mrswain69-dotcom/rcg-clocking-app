import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard } from "@/components/brand/MetricCard";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireAdminProfile } from "@/lib/auth";
import { durationHours, formatHoursMinutes, formatUkDateTime } from "@/lib/dates";
import {
  arrivalDelayMinutes,
  locationEvidenceDetail,
  locationEvidenceLabel,
  locationEvidenceTone,
} from "@/lib/location-evidence";
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
    .select("id,full_name,email,profile_type,attendance_category,organisation,is_active")
    .order("full_name");
  const profiles = profilesData ?? [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  let query = supabase
    .from("sessions")
    .select("id,profile_id,clock_in_at,clock_out_at,clock_in_method,clock_out_method,notes,clock_in_location_status,clock_in_distance_m,clock_in_accuracy_m,first_on_site_verified_at,first_on_site_verification_method,last_presence_check_at")
    .gte("clock_in_at", `${from}T00:00:00.000Z`)
    .lte("clock_in_at", `${to}T23:59:59.999Z`)
    .order("clock_in_at", { ascending: false })
    .limit(5000);

  if (selectedProfile !== "all") query = query.eq("profile_id", selectedProfile);
  const { data: sessionsData } = await query;
  const sessions = sessionsData ?? [];

  const rows = sessions.map((session) => {
    const profile = profileById.get(session.profile_id);
    const arrivalDelay = arrivalDelayMinutes(session.clock_in_at, session.first_on_site_verified_at);

    return {
      id: session.id,
      profile_id: session.profile_id,
      full_name: profile?.full_name ?? "Unknown user",
      email: profile?.email ?? "",
      profile_type: profile?.profile_type ?? "account",
      attendance_category: profile?.attendance_category ?? "registered",
      organisation: profile?.organisation ?? "",
      clock_in_at: session.clock_in_at,
      clock_out_at: session.clock_out_at,
      clock_in_method: session.clock_in_method,
      clock_out_method: session.clock_out_method,
      notes: session.notes,
      hours: durationHours(session.clock_in_at, session.clock_out_at),
      clock_in_location_status: session.clock_in_location_status,
      clock_in_distance_m: session.clock_in_distance_m,
      clock_in_accuracy_m: session.clock_in_accuracy_m,
      first_on_site_verified_at: session.first_on_site_verified_at,
      first_on_site_verification_method: session.first_on_site_verification_method,
      last_presence_check_at: session.last_presence_check_at,
      location_label: locationEvidenceLabel(session.clock_in_location_status, session.clock_in_method),
      location_detail: locationEvidenceDetail(session),
      arrival_delay_minutes: arrivalDelay,
    };
  });

  const summaryMap = new Map<string, { profile_id: string; full_name: string; email: string; profile_type: string; attendance_category: string; organisation: string; visits: number; hours: number }>();
  for (const row of rows) {
    const current = summaryMap.get(row.profile_id) ?? {
      profile_id: row.profile_id,
      full_name: row.full_name,
      email: row.email,
      profile_type: row.profile_type,
      attendance_category: row.attendance_category,
      organisation: row.organisation,
      visits: 0,
      hours: 0,
    };
    current.visits += 1;
    current.hours += row.hours;
    summaryMap.set(row.profile_id, current);
  }

  const summary = [...summaryMap.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const volunteerHours = rows
    .filter((row) => ["regular_volunteer", "one_off_volunteer"].includes(row.attendance_category))
    .reduce((sum, row) => sum + row.hours, 0);
  const visitorVisits = rows.filter((row) => row.attendance_category === "visitor").length;
  const outsideCount = rows.filter((row) => row.clock_in_location_status === "outside_site").length;
  const unavailableCount = rows.filter((row) => ["location_unavailable", "location_uncertain", "near_boundary"].includes(row.clock_in_location_status ?? "")).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Attendance reports"
        description="Filter by date and person, review hours and location verification evidence, and export detailed records."
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon="▤" label="Visits" value={String(rows.length)} detail="Sessions in range" tone="orange" />
        <MetricCard icon="◷" label="Recorded hours" value={formatHoursMinutes(totalHours)} detail={`${from} to ${to}`} tone="neutral" />
        <MetricCard icon="♣" label="Volunteer hours" value={formatHoursMinutes(volunteerHours)} detail="Regular + one-off volunteers" />
        <MetricCard icon="◎" label="Visitor visits" value={String(visitorVisits)} detail="Presence only · excluded from volunteer hours" tone="neutral" />
        <MetricCard icon="↗" label="Outside-site clock-ins" value={String(outsideCount)} detail="GPS clearly outside RCG" tone={outsideCount ? "orange" : "neutral"} />
        <MetricCard icon="?" label="Unverified / uncertain" value={String(unavailableCount)} detail="No reliable clock-in location" tone="neutral" />
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><p className="section-kicker">Summary</p><h2 className="text-2xl font-black">People & hours</h2></div>
          <ReportExports rows={rows} summary={summary} from={from} to={to} />
        </div>
        <div className="mt-4 table-wrap"><table><thead><tr><th>Person</th><th>Type</th><th>Visits</th><th>Hours</th></tr></thead><tbody>{summary.length ? summary.map((row) => <tr key={row.profile_id}><td><strong>{row.full_name}</strong><div className="text-xs text-[var(--rcg-muted)]">{row.profile_type === "attendance_only" ? "Attendance only · no login" : row.email}{row.organisation ? " · " + row.organisation : ""}</div></td><td><span className="badge">{row.attendance_category.replaceAll("_", " ")}</span></td><td>{row.visits}</td><td className="font-extrabold">{formatHoursMinutes(row.hours)}</td></tr>) : <tr><td colSpan={4} className="text-[var(--rcg-muted)]">No attendance in this date range.</td></tr>}</tbody></table></div>
      </section>

      <section className="card p-5 sm:p-6">
        <div>
          <p className="section-kicker">Detail</p>
          <h2 className="text-2xl font-black">Session & location records</h2>
          <p className="mt-1 text-sm text-[var(--rcg-muted)]">GPS distance is measured outside the configured RCG boundary. Exact coordinates are not shown or stored in this report.</p>
        </div>

        <div className="mt-4 table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Type</th>
                <th>Clock in</th>
                <th>Clock out</th>
                <th>Duration</th>
                <th>Method</th>
                <th>Clock-in location</th>
                <th>First verified on site</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => {
                const tone = locationEvidenceTone(row.clock_in_location_status, row.clock_in_method);
                const badgeClass =
                  tone === "ok"
                    ? "!bg-green-100 !text-green-800"
                    : tone === "warn"
                      ? "!bg-amber-100 !text-amber-900"
                      : "!bg-slate-100 !text-slate-700";

                return (
                  <tr key={row.id}>
                    <td><strong>{row.full_name}</strong>{row.organisation ? <div className="text-xs text-[var(--rcg-muted)]">{row.organisation}</div> : null}</td>
                    <td><span className="badge">{row.attendance_category.replaceAll("_", " ")}</span></td>
                    <td>{formatUkDateTime(row.clock_in_at)}</td>
                    <td>{formatUkDateTime(row.clock_out_at)}</td>
                    <td className="font-extrabold">{formatHoursMinutes(row.hours)}</td>
                    <td><span className="badge">{row.clock_in_method}</span></td>
                    <td className="min-w-64">
                      <span className={`badge ${badgeClass}`}>{row.location_label}</span>
                      <div className="mt-1 text-xs text-[var(--rcg-muted)]">{row.location_detail}</div>
                    </td>
                    <td className="min-w-48">
                      {row.first_on_site_verified_at ? (
                        <>
                          <strong>{formatUkDateTime(row.first_on_site_verified_at)}</strong>
                          <div className="mt-1 text-xs text-[var(--rcg-muted)]">
                            {row.arrival_delay_minutes !== null ? `${row.arrival_delay_minutes} min after clock-in` : ""}
                            {row.first_on_site_verification_method ? ` · ${row.first_on_site_verification_method.toUpperCase()}` : ""}
                          </div>
                        </>
                      ) : "Not recorded"}
                    </td>
                    <td>{row.notes ?? "—"}</td>
                  </tr>
                );
              }) : <tr><td colSpan={9} className="text-[var(--rcg-muted)]">No records found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
