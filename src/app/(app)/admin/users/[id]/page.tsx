import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireAdminProfile } from "@/lib/auth";
import { formatUkDateTime, londonDateTimeLocalValue } from "@/lib/dates";
import {
  arrivalDelayMinutes,
  locationEvidenceDetail,
  locationEvidenceLabel,
  locationEvidenceTone,
} from "@/lib/location-evidence";
import { addSession, closeSession, correctSession } from "./actions";

export const metadata: Metadata = { title: "User attendance" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdminProfile();
  const { data: user } = await supabase.from("profiles").select("id,full_name,email,role,profile_type,is_active").eq("id", id).maybeSingle();
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
        description={`${user.profile_type === "attendance_only" ? "Attendance only · no login" : user.email} · ${user.role} · ${user.is_active ? "Active" : "Archived"}`}
        action={<Link className="btn btn-secondary" href="/admin/users">← Users</Link>}
      />

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
