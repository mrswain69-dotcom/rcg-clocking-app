import {
  adminAddSession,
  adminClockOutSession,
  adminCreateAttendancePersonSession,
} from "./manual-attendance-actions";
import { londonDateTimeLocalValue } from "@/lib/dates";

type PersonOption = {
  id: string;
  full_name: string;
  profile_type: string;
};

type OpenSessionOption = {
  session_id: string;
  profile_id: string;
  full_name: string;
  clock_in_at: string;
  profile_type: string;
};

export function AdminAttendanceControls({
  people,
  openSessions,
}: {
  people: PersonOption[];
  openSessions: OpenSessionOption[];
}) {
  const nowLocal = londonDateTimeLocalValue();

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5">
        <p className="section-kicker">Admin attendance</p>
        <h2 className="text-2xl font-black">Clock people in or out</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--rcg-muted)]">
          Use this when someone cannot use the app/kiosk, forgot to clock, or attendance came through the old WhatsApp process.
          Admin-entered attendance is fully audited and is shown as <strong>location not verified</strong>.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <details className="rounded-2xl border border-[var(--rcg-border)] bg-white p-4" open>
          <summary className="cursor-pointer font-black text-[var(--rcg-green-dark)]">Existing person</summary>
          <p className="mt-2 text-sm text-[var(--rcg-muted)]">
            Add an open clock-in, or enter both times to backfill a complete session.
          </p>
          <form action={adminAddSession} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-extrabold" htmlFor="manual-profile">Person</label>
              <select className="input" id="manual-profile" name="profileId" required defaultValue="">
                <option value="" disabled>Select person…</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name}{person.profile_type === "attendance_only" ? " · attendance only" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold" htmlFor="manual-in">Clock in</label>
              <input className="input" id="manual-in" name="clockInAt" type="datetime-local" defaultValue={nowLocal} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold" htmlFor="manual-out">Clock out <span className="font-normal text-[var(--rcg-muted)]">(optional)</span></label>
              <input className="input" id="manual-out" name="clockOutAt" type="datetime-local" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold" htmlFor="manual-reason">Reason / source</label>
              <input className="input" id="manual-reason" name="reason" placeholder="e.g. WhatsApp check-in / kiosk unavailable" minLength={3} required />
            </div>
            <button className="btn btn-primary w-full" type="submit">Save attendance</button>
          </form>
        </details>

        <details className="rounded-2xl border border-[var(--rcg-border)] bg-white p-4">
          <summary className="cursor-pointer font-black text-[var(--rcg-green-dark)]">New visitor / one-off volunteer</summary>
          <p className="mt-2 text-sm text-[var(--rcg-muted)]">
            Creates an attendance-only person with no sign-in. Volunteer records count toward volunteer hours; visitors are presence-only.
          </p>
          <form action={adminCreateAttendancePersonSession} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-extrabold" htmlFor="visitor-name">Name</label>
              <input className="input" id="visitor-name" name="fullName" maxLength={120} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold" htmlFor="visitor-type">Type</label>
              <select className="input" id="visitor-type" name="attendanceCategory" defaultValue="visitor">
                <option value="visitor">Visitor / meeting / media / contractor</option>
                <option value="one_off_volunteer">One-off / corporate / course volunteer</option>
                <option value="other">Other attendance-only person</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold" htmlFor="visitor-organisation">Organisation <span className="font-normal text-[var(--rcg-muted)]">(optional)</span></label>
              <input className="input" id="visitor-organisation" name="organisation" maxLength={160} placeholder="Company, course or organisation" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold" htmlFor="visitor-in">Clock in</label>
              <input className="input" id="visitor-in" name="clockInAt" type="datetime-local" defaultValue={nowLocal} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold" htmlFor="visitor-out">Clock out <span className="font-normal text-[var(--rcg-muted)]">(optional)</span></label>
              <input className="input" id="visitor-out" name="clockOutAt" type="datetime-local" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold" htmlFor="visitor-reason">Reason / source</label>
              <input className="input" id="visitor-reason" name="reason" placeholder="e.g. Visitor recorded via WhatsApp" minLength={3} required />
            </div>
            <button className="btn btn-primary w-full" type="submit">Create & save attendance</button>
          </form>
        </details>

        <details className="rounded-2xl border border-[var(--rcg-border)] bg-white p-4" open={openSessions.length > 0}>
          <summary className="cursor-pointer font-black text-[var(--rcg-green-dark)]">Clock someone out</summary>
          <p className="mt-2 text-sm text-[var(--rcg-muted)]">
            Set the actual date/time they left. This does not require GPS verification.
          </p>
          {openSessions.length ? (
            <form action={adminClockOutSession} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-extrabold" htmlFor="manual-open-session">Open session</label>
                <select className="input" id="manual-open-session" name="sessionId" required defaultValue="">
                  <option value="" disabled>Select person…</option>
                  {openSessions.map((session) => (
                    <option key={session.session_id} value={session.session_id}>
                      {session.full_name}{session.profile_type === "attendance_only" ? " · attendance only" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-extrabold" htmlFor="manual-clock-out">Clock out</label>
                <input className="input" id="manual-clock-out" name="clockOutAt" type="datetime-local" defaultValue={nowLocal} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-extrabold" htmlFor="manual-out-reason">Reason</label>
                <input className="input" id="manual-out-reason" name="reason" placeholder="e.g. Forgot to clock out" minLength={3} required />
              </div>
              <button className="btn btn-danger w-full" type="submit">Clock out at this time</button>
            </form>
          ) : (
            <p className="mt-4 rounded-xl bg-[var(--rcg-green-mist)] p-3 text-sm text-[var(--rcg-muted)]">Nobody currently has an open session.</p>
          )}
        </details>
      </div>
    </section>
  );
}
