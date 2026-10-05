import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireAdminProfile } from "@/lib/auth";
import { registerAction } from "../../../registers/actions";
import { registerAccountTypes } from "@/lib/registers";
import { formatUkDateTime, londonDateTimeLocalValue } from "@/lib/dates";
import {
  arrivalDelayMinutes,
  locationEvidenceDetail,
  locationEvidenceLabel,
  locationEvidenceTone,
} from "@/lib/location-evidence";
import { addSession, closeSession, correctSession } from "./actions";
import { promoteAttendancePerson, setAttendanceCategory } from "../actions";

export const metadata: Metadata = { title: "User attendance" };

export default async function AdminUserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{error?:string;message?:string}> }) {
  const query = await searchParams;
  const { id } = await params;
  const { supabase, profile: actor } = await requireAdminProfile();
  const { data: user } = await supabase.from("profiles").select("id,full_name,email,role,profile_type,attendance_category,organisation,is_active,register_account_type,can_manage_registers").eq("id", id).maybeSingle();
  if (!user) notFound();

  const { data } = await supabase
    .from("sessions")
    .select("id,clock_in_at,clock_out_at,clock_in_method,clock_out_method,notes,clock_in_location_status,clock_in_distance_m,clock_in_accuracy_m,first_on_site_verified_at,first_on_site_verification_method,last_presence_check_at")
    .eq("profile_id", id)
    .order("clock_in_at", { ascending: false })
    .limit(100);
  const sessions = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance administration"
        title={user.full_name}
        description={`${user.profile_type === "attendance_only" ? "Attendance only · no login" : user.email} · ${user.attendance_category.replaceAll("_", " ")} · ${user.is_active ? "Active" : "Archived"}`}
        action={<Link className="btn btn-secondary" href="/admin/users">← Users</Link>}
      />

      {query.error ? <p role="alert" className="text-red-800">{query.error}</p> : null}
      {query.message ? <p role="status">{query.message}</p> : null}
      <section className="card p-5 sm:p-6">
        <div className="mb-5">
          <p className="section-kicker">Person record</p>
          <h2 className="text-2xl font-black">Classification & access</h2>
          <p className="mt-1 text-sm text-[var(--rcg-muted)]">
            Attendance-only people keep their history without a login. A returning volunteer can be promoted to a registered account without creating a second person.
          </p>
        </div>

        <form action={setAttendanceCategory} className="grid gap-4 md:grid-cols-3">
          <input type="hidden" name="profileId" value={id} />
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="person-category">Person type</label>
            <select className="input" id="person-category" name="attendanceCategory" defaultValue={user.attendance_category}>
              {user.profile_type === "account" ? (
                <>
                  <option value="registered">Registered person</option>
                  <option value="employee">Employee</option>
                  <option value="regular_volunteer">Regular volunteer</option>
                  <option value="other">Other registered person</option>
                </>
              ) : (
                <>
                  <option value="one_off_volunteer">One-off volunteer</option>
                  <option value="visitor">Visitor</option>
                  <option value="other">Other attendance-only person</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="person-organisation">Organisation</label>
            <input className="input" id="person-organisation" name="organisation" defaultValue={user.organisation ?? ""} maxLength={160} disabled={user.profile_type === "account"} />
          </div>
          <div className="flex items-end">
            <button className="btn btn-secondary w-full" type="submit">Save person type</button>
          </div>
        </form>

        {user.profile_type === "attendance_only" ? (
          <details className="mt-5 rounded-2xl border border-[var(--rcg-border)] bg-[var(--rcg-green-mist)] p-4">
            <summary className="cursor-pointer font-black text-[var(--rcg-green-dark)]">Promote to registered account…</summary>
            <p className="mt-2 text-sm text-[var(--rcg-muted)]">Use this when a one-off volunteer becomes a regular volunteer or employee. Existing attendance stays attached to this person.</p>
            <form action={promoteAttendancePerson} className="mt-4 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="profileId" value={id} />
              <div><label className="mb-1 block text-sm font-extrabold">Email</label><input className="input" name="email" type="email" required /></div>
              <div><label className="mb-1 block text-sm font-extrabold">Temporary password</label><input className="input" name="password" type="password" minLength={10} required /></div>
              <div><label className="mb-1 block text-sm font-extrabold">Registered type</label><select className="input" name="attendanceCategory" defaultValue="regular_volunteer"><option value="regular_volunteer">Regular volunteer</option><option value="employee">Employee</option><option value="registered">Registered person</option><option value="other">Other</option></select></div>
              <div className="flex items-end"><button className="btn btn-primary w-full" type="submit">Create account & keep history</button></div>
            </form>
          </details>
        ) : null}
      </section>

      {user.profile_type === "account" ? (
        <section className="card p-5">
          <h2 className="text-2xl font-black">
            Professional account & register access
          </h2>
          <p className="mt-2">
            Attendance classification, clocking administration and client
            register access are separate. Standard accounts have no register
            access. Eligible professionals see only explicitly assigned
            programmes or sessions; register managers manage all registers,
            clients and contact routing. Only an owner can change these
            permissions.
          </p>
          <p className="mt-3 font-bold">
            {
              registerAccountTypes[
                user.register_account_type as keyof typeof registerAccountTypes
              ]
            }{" "}
            ·{" "}
            {user.role === "owner"
              ? "Owner: all register permissions"
              : user.can_manage_registers
                ? "Register manager"
                : "Assigned registers only, if eligible"}
          </p>
          {actor.role === "owner" ? (
            <form
              action={registerAction}
              className="mt-4 grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="action" value="account_access" />
              <input type="hidden" name="profile_id" value={id} />
              <input
                type="hidden"
                name="return_path"
                value={`/admin/users/${id}`}
              />
              <label>
                Professional account type
                <select
                  name="register_account_type"
                  className="input"
                  defaultValue={user.register_account_type}
                >
                  {Object.entries(registerAccountTypes).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={user.can_manage_registers}
                />
                Register manager · all programmes, sessions and directories
              </label>
              <p className="text-sm">
                Changing to Standard removes all programme and session grants.
                Owner access is built in.
              </p>
              <button className="btn btn-primary">
                Save account & register access
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      <section className="card p-5 sm:p-6">
        <div className="mb-5">
          <p className="section-kicker">Manual entry</p>
          <h2 className="text-2xl font-black">Add missing session</h2>
          <p className="mt-1 text-sm text-[var(--rcg-muted)]">Choose the actual local date and time. Admin-entered clock-ins are recorded as location not verified.</p>
        </div>
        <form action={addSession} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="profileId" value={id} />
          <div><label className="mb-1 block text-sm font-extrabold">Clock in</label><input className="input" name="clockInAt" type="datetime-local" defaultValue={londonDateTimeLocalValue()} required /></div>
          <div><label className="mb-1 block text-sm font-extrabold">Clock out (blank if still working)</label><input className="input" name="clockOutAt" type="datetime-local" /></div>
          <div className="md:col-span-2"><label className="mb-1 block text-sm font-extrabold">Reason</label><input className="input" name="reason" placeholder="Why is this manual entry needed?" required /></div>
          <div className="md:col-span-2"><button className="btn btn-primary" type="submit">Add session</button></div>
        </form>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="section-kicker">Records</p>
            <h2 className="text-2xl font-black">Attendance & location history</h2>
            <p className="mt-1 text-sm text-[var(--rcg-muted)]">Location evidence shows what the device reported at clock-in and when the app first verified arrival on site. Exact coordinates are not stored here.</p>
          </div>
          <span className="badge">{sessions.length} sessions</span>
        </div>

        <div className="space-y-4">
          {sessions.length ? sessions.map((session) => {
            const tone = locationEvidenceTone(session.clock_in_location_status, session.clock_in_method);
            const evidenceClass =
              tone === "ok"
                ? "border-green-200 bg-green-50 text-green-900"
                : tone === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-950"
                  : "border-slate-200 bg-slate-50 text-slate-800";
            const arrivalDelay = arrivalDelayMinutes(session.clock_in_at, session.first_on_site_verified_at);

            return (
              <article className="rounded-2xl border border-[var(--rcg-border)] bg-white p-4 sm:p-5" key={session.id}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong>{formatUkDateTime(session.clock_in_at)}</strong>{" "}
                    <span className="text-[var(--rcg-muted)]">→</span>{" "}
                    <strong>{formatUkDateTime(session.clock_out_at)}</strong>
                  </div>
                  <span className="badge">{session.clock_in_method}</span>
                </div>

                <div className={`mb-4 rounded-xl border p-3 text-sm ${evidenceClass}`}>
                  <div className="font-extrabold">{locationEvidenceLabel(session.clock_in_location_status, session.clock_in_method)}</div>
                  <div className="mt-1">{locationEvidenceDetail(session)}</div>
                  {session.first_on_site_verified_at ? (
                    <div className="mt-2 border-t border-current/10 pt-2">
                      <strong>First verified on site:</strong> {formatUkDateTime(session.first_on_site_verified_at)}
                      {arrivalDelay !== null ? ` · ${arrivalDelay} min after clock-in` : ""}
                      {session.first_on_site_verification_method ? ` · ${session.first_on_site_verification_method.toUpperCase()}` : ""}
                    </div>
                  ) : (
                    <div className="mt-2 border-t border-current/10 pt-2">
                      <strong>First verified on site:</strong> Not recorded
                    </div>
                  )}
                  {session.last_presence_check_at && session.last_presence_check_at !== session.first_on_site_verified_at ? (
                    <div className="mt-1"><strong>Last background presence check:</strong> {formatUkDateTime(session.last_presence_check_at)}</div>
                  ) : null}
                </div>

                {session.notes ? <p className="mb-4 rounded-xl bg-[var(--rcg-green-mist)] p-3 text-sm text-[var(--rcg-text)]">Note: {session.notes}</p> : null}

                <form action={correctSession} className="grid gap-3 lg:grid-cols-3">
                  <input type="hidden" name="profileId" value={id} />
                  <input type="hidden" name="sessionId" value={session.id} />
                  <div><label className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-[var(--rcg-muted)]">Clock in</label><input className="input !min-h-10" name="clockInAt" type="datetime-local" defaultValue={londonDateTimeLocalValue(new Date(session.clock_in_at))} required /></div>
                  <div><label className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-[var(--rcg-muted)]">Clock out</label><input className="input !min-h-10" name="clockOutAt" type="datetime-local" defaultValue={session.clock_out_at ? londonDateTimeLocalValue(new Date(session.clock_out_at)) : ""} /></div>
                  <div><label className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-[var(--rcg-muted)]">Reason for correction</label><div className="flex gap-2"><input className="input !min-h-10" name="reason" required /><button className="btn btn-soft !min-h-10" type="submit">Save</button></div></div>
                </form>

                {!session.clock_out_at ? (
                  <form action={closeSession} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="profileId" value={id} />
                    <input type="hidden" name="sessionId" value={session.id} />
                    <input className="input !min-h-10" name="clockOutAt" type="datetime-local" defaultValue={londonDateTimeLocalValue()} required />
                    <input className="input !min-h-10" name="reason" placeholder="Reason for manual clock-out" minLength={3} required />
                    <button className="btn btn-danger !min-h-10 whitespace-nowrap" type="submit">Clock out</button>
                  </form>
                ) : null}
              </article>
            );
          }) : (
            <div className="empty-state">
              <img src="/brand/staff-fox.svg" alt="" />
              <h3>No attendance records yet</h3>
              <p>Sessions for this person will appear here.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
