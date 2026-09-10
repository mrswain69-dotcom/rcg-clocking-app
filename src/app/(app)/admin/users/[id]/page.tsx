import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth";
import { formatUkDateTime } from "@/lib/dates";
import { addSession, closeSession, correctSession } from "./actions";

export const metadata: Metadata = { title: "User attendance" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdminProfile();
  const { data: user } = await supabase.from("profiles").select("id,full_name,email,role,is_active").eq("id", id).maybeSingle();
  if (!user) notFound();
  const { data } = await supabase.from("sessions").select("id,clock_in_at,clock_out_at,clock_in_method,clock_out_method,notes").eq("profile_id", id).order("clock_in_at", { ascending: false }).limit(100);
  const sessions = data ?? [];

  return (
    <div className="space-y-6">
      <div><Link className="text-sm font-bold text-[var(--rcg-green)]" href="/admin/users">← Users</Link><h1 className="mt-2 text-3xl font-black">{user.full_name}</h1><p className="mt-1 text-[var(--rcg-muted)]">{user.email} · {user.role} · {user.is_active ? "Active" : "Archived"}</p></div>

      <section className="card p-5 sm:p-6">
        <h2 className="text-xl font-black">Add missing session</h2>
        <p className="mt-1 text-sm text-[var(--rcg-muted)]">Use ISO timestamps including the timezone offset, e.g. 2026-09-10T09:00:00+01:00.</p>
        <form action={addSession} className="mt-4 grid gap-3 md:grid-cols-2"><input type="hidden" name="profileId" value={id} /><div><label className="mb-1 block text-sm font-bold">Clock in</label><input className="input" name="clockInAt" placeholder="2026-09-10T09:00:00+01:00" required /></div><div><label className="mb-1 block text-sm font-bold">Clock out (blank if still on site)</label><input className="input" name="clockOutAt" placeholder="2026-09-10T13:30:00+01:00" /></div><div className="md:col-span-2"><label className="mb-1 block text-sm font-bold">Reason</label><input className="input" name="reason" placeholder="Why is this manual entry needed?" required /></div><div className="md:col-span-2"><button className="btn btn-primary" type="submit">Add session</button></div></form>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-xl font-black">Attendance records</h2>
        <div className="mt-4 space-y-4">
          {sessions.length ? sessions.map((session) => (
            <article className="rounded-xl border border-[var(--rcg-border)] bg-white p-4" key={session.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><strong>{formatUkDateTime(session.clock_in_at)}</strong> → <strong>{formatUkDateTime(session.clock_out_at)}</strong></div><span className="badge">{session.clock_in_method}</span></div>
              {session.notes ? <p className="mb-3 text-sm text-[var(--rcg-muted)]">Note: {session.notes}</p> : null}
              <form action={correctSession} className="grid gap-3 lg:grid-cols-3"><input type="hidden" name="profileId" value={id} /><input type="hidden" name="sessionId" value={session.id} /><div><label className="mb-1 block text-xs font-bold uppercase text-[var(--rcg-muted)]">Clock in ISO</label><input className="input !min-h-10" name="clockInAt" defaultValue={session.clock_in_at} required /></div><div><label className="mb-1 block text-xs font-bold uppercase text-[var(--rcg-muted)]">Clock out ISO</label><input className="input !min-h-10" name="clockOutAt" defaultValue={session.clock_out_at ?? ""} /></div><div><label className="mb-1 block text-xs font-bold uppercase text-[var(--rcg-muted)]">Reason for correction</label><div className="flex gap-2"><input className="input !min-h-10" name="reason" required /><button className="btn btn-secondary !min-h-10" type="submit">Save</button></div></div></form>
              {!session.clock_out_at ? <form action={closeSession} className="mt-3 flex gap-2"><input type="hidden" name="profileId" value={id} /><input type="hidden" name="sessionId" value={session.id} /><input className="input !min-h-10" name="reason" placeholder="Reason for manual clock-out" required /><button className="btn btn-danger !min-h-10 whitespace-nowrap" type="submit">Clock out now</button></form> : null}
            </article>
          )) : <p className="text-[var(--rcg-muted)]">No attendance records yet.</p>}
        </div>
      </section>
    </div>
  );
}
