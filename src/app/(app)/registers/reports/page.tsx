import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import {
  summariseRegisterAttendance,
  type RegisterReportRow,
} from "@/lib/registers";
import {
  formatUkDateTime,
  londonLocalInputToIso,
  londonDateTimeLocalValue,
} from "@/lib/dates";
import { PageHeader } from "@/components/brand/PageHeader";
import { RegisterExport } from "./register-export";
export default async function RegisterReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    client?: string;
    q?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const today = londonDateTimeLocalValue().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "")
    ? params.from!
    : `${today.slice(0, 7)}-01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? params.to! : today;
  const nextDay = new Date(`${to}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const { supabase } = await requireProfile();
  const { data, error } = await supabase.rpc("register_report", {
    p_from: londonLocalInputToIso(`${from}T00:00`),
    p_to: londonLocalInputToIso(`${nextDay.toISOString().slice(0, 10)}T00:00`),
  });
  const allRows = (data ?? []) as RegisterReportRow[];
  const query = (params.q ?? "").toLowerCase();
  const matching = allRows.filter(
    (r) =>
      (!params.client || r.client_id === params.client) &&
      (!query ||
        `${r.display_name} ${r.session_name}`.toLowerCase().includes(query)),
  );
  const rows = matching.filter(
    (r) => !params.status || r.attendance_status === params.status,
  );
  const summary = summariseRegisterAttendance(matching);
  const people = [
    ...new Map(allRows.map((r) => [r.client_id, r.display_name])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Client attendance"
        title="Register reports"
        description="Search saved attendance by person, session and date. Totals use confirmed sessions; cancelled sessions are excluded and excused absences are shown separately."
        action={
          <Link href="/registers" className="btn btn-secondary">
            Registers
          </Link>
        }
      />
      {error ? <p role="alert">Register reports are unavailable.</p> : null}
      <form className="card p-5 grid gap-4 sm:grid-cols-3" method="get">
        <label>
          From
          <input
            className="input"
            name="from"
            type="date"
            defaultValue={from}
            required
          />
        </label>
        <label>
          To
          <input
            className="input"
            name="to"
            type="date"
            defaultValue={to}
            required
          />
        </label>
        <label>
          Person
          <select
            className="input"
            name="client"
            defaultValue={params.client ?? ""}
          >
            <option value="">All authorised clients</option>
            {people.map(([id, name]) => (
              <option key={id} value={id}>
                {name} · {id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search person or session
          <input className="input" name="q" defaultValue={params.q} />
        </label>
        <label>
          Record status
          <select
            className="input"
            name="status"
            defaultValue={params.status ?? ""}
          >
            <option value="">All statuses</option>
            {["present", "late", "absent", "excused", "unmarked"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          Run report
        </button>
      </form>
      {allRows.length >= 5000 ? (
        <p role="status">
          The report reached its 5,000-record limit. Narrow the date range for
          complete results.
        </p>
      ) : null}
      <section className="card p-5">
        <h2 className="text-2xl font-black">Attendance totals</h2>
        <p>
          Totals include all statuses for the selected person or search.
          Attendance percentage is attended ÷ (attended + missed).
        </p>
        <div className="table-wrap mt-4">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Attended</th>
                <th>Missed</th>
                <th>Excused</th>
                <th>Pending</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.client_id}>
                  <td>
                    {s.display_name} · {s.client_id.slice(0, 8)}
                  </td>
                  <td>{s.attended}</td>
                  <td>{s.missed}</td>
                  <td>{s.excused}</td>
                  <td>{s.pending}</td>
                  <td>
                    {s.attended + s.missed
                      ? `${Math.round((100 * s.attended) / (s.attended + s.missed))}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card p-5">
        <div className="flex flex-wrap gap-4 justify-between">
          <h2 className="text-2xl font-black">Attendance records</h2>
          <RegisterExport rows={rows} from={from} to={to} />
        </div>
        <div className="table-wrap mt-4">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Session</th>
                <th>Scheduled start</th>
                <th>End</th>
                <th>Register</th>
                <th>Attendance</th>
                <th>Observed arrival</th>
                <th>Observed departure</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.session_id}-${r.client_id}`}>
                  <td>
                    {r.display_name} · {r.client_id.slice(0, 8)}
                  </td>
                  <td>
                    <Link
                      className="underline"
                      href={`/registers/${r.session_id}`}
                    >
                      {r.session_name}
                    </Link>
                  </td>
                  <td>{formatUkDateTime(r.starts_at)}</td>
                  <td>{formatUkDateTime(r.ends_at)}</td>
                  <td>{r.session_status}</td>
                  <td>{r.attendance_status}</td>
                  <td>{formatUkDateTime(r.arrived_at)}</td>
                  <td>{formatUkDateTime(r.departed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
