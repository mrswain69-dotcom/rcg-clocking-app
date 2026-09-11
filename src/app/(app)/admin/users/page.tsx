import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireAdminProfile } from "@/lib/auth";
import { formatUkDateTime } from "@/lib/dates";
import { createUser, deleteUser, resetPin, setKioskAccess, setPresenceVisibility, setUserActive, setUserRole } from "./actions";

export const metadata: Metadata = { title: "Manage users" };

export default async function AdminUsersPage() {
  const { supabase, profile: actor } = await requireAdminProfile();
  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,is_active,can_view_currently_on_site,can_use_kiosk,short_code,archived_at")
    .order("full_name");
  const users = data ?? [];
  const activeCount = users.filter((user) => user.is_active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Manage people"
        description="Create accounts, control site visibility and kiosk access, and manage archived users."
        action={<Link className="btn btn-secondary" href="/admin">← Admin</Link>}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><p className="text-sm font-extrabold text-[var(--rcg-muted)]">People</p><p className="mt-2 text-3xl font-black">{users.length}</p></div>
        <div className="card p-5"><p className="text-sm font-extrabold text-[var(--rcg-muted)]">Active</p><p className="mt-2 text-3xl font-black text-[var(--rcg-green-dark)]">{activeCount}</p></div>
        <div className="card p-5"><p className="text-sm font-extrabold text-[var(--rcg-muted)]">Archived</p><p className="mt-2 text-3xl font-black">{users.length - activeCount}</p></div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="mb-5"><p className="section-kicker">New account</p><h2 className="text-2xl font-black">Create user</h2><p className="mt-1 text-sm text-[var(--rcg-muted)]">Give the user a temporary password; they can change it after signing in.</p></div>
        <form action={createUser} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="fullName">Full name</label><input className="input" id="fullName" name="fullName" required /></div>
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required /></div>
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="password">Temporary password</label><input className="input" id="password" name="password" type="password" minLength={10} required /></div>
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="shortCode">Short code</label><input className="input" id="shortCode" name="shortCode" minLength={3} maxLength={12} /></div>
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="pin">Kiosk PIN</label><input className="input" id="pin" name="pin" inputMode="numeric" pattern="[0-9]{4,6}" type="password" /></div>
          {actor.role === "owner" ? <div><label className="mb-1 block text-sm font-extrabold" htmlFor="role">Role</label><select className="input" id="role" name="role" defaultValue="user"><option value="user">User</option><option value="admin">Admin</option><option value="developer">Developer</option></select></div> : <input type="hidden" name="role" value="user" />}
          <div className="md:col-span-2 xl:col-span-3"><button className="btn btn-primary" type="submit">Create user</button></div>
        </form>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="section-kicker">People</p><h2 className="text-2xl font-black">Accounts & access</h2></div><Link className="btn btn-soft !min-h-10" href="/admin/audit">View audit log →</Link></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Role</th><th>Presence</th><th>Kiosk</th><th>PIN</th><th>Status</th>{actor.role === "owner" ? <th>Owner action</th> : null}</tr></thead>
            <tbody>{users.map((user) => (
              <tr key={user.id}>
                <td><Link className="font-extrabold text-[var(--rcg-green-dark)]" href={`/admin/users/${user.id}`}>{user.full_name}</Link><div className="mt-1 text-xs text-[var(--rcg-muted)]">{user.email}{user.short_code ? ` · ${user.short_code}` : ""}</div></td>
                <td>{actor.role === "owner" && user.role !== "owner" ? <form action={setUserRole} className="flex gap-2"><input type="hidden" name="profileId" value={user.id} /><select className="input !min-h-9 !w-auto !py-1" name="role" defaultValue={user.role}><option value="user">User</option><option value="admin">Admin</option><option value="developer">Developer</option></select><button className="btn btn-soft !min-h-9 !px-3" type="submit">Save</button></form> : <span className="badge">{user.role}</span>}</td>
                <td><form action={setPresenceVisibility} className="flex gap-2"><input type="hidden" name="profileId" value={user.id} /><select className="input !min-h-9 !w-auto !py-1" name="enabled" defaultValue={String(user.can_view_currently_on_site)}><option value="false">No</option><option value="true">Yes</option></select><button className="btn btn-soft !min-h-9 !px-3" type="submit">Save</button></form></td>
                <td><form action={setKioskAccess} className="flex gap-2"><input type="hidden" name="profileId" value={user.id} /><select className="input !min-h-9 !w-auto !py-1" name="enabled" defaultValue={String(user.can_use_kiosk)}><option value="true">Yes</option><option value="false">No</option></select><button className="btn btn-soft !min-h-9 !px-3" type="submit">Save</button></form></td>
                <td><form action={resetPin} className="flex min-w-48 gap-2"><input type="hidden" name="profileId" value={user.id} /><input className="input !min-h-9 !w-24 !py-1" name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" placeholder="4–6 digits" required /><button className="btn btn-soft !min-h-9 !px-3" type="submit">Reset</button></form></td>
                <td><div className="mb-2"><span className={`badge ${user.is_active ? "" : "!bg-slate-100 !text-slate-600"}`}>{user.is_active ? "Active" : "Archived"}</span></div>{!user.is_active && user.archived_at ? <div className="mb-2 text-xs text-[var(--rcg-muted)]">{formatUkDateTime(user.archived_at)}</div> : null}{user.role !== "owner" ? <form action={setUserActive}><input type="hidden" name="profileId" value={user.id} /><input type="hidden" name="active" value={String(!user.is_active)} /><button className={user.is_active ? "btn btn-danger !min-h-9 !px-3" : "btn btn-secondary !min-h-9 !px-3"} type="submit">{user.is_active ? "Archive" : "Reactivate"}</button></form> : <span className="text-xs font-bold text-[var(--rcg-muted)]">Protected owner</span>}</td>
                {actor.role === "owner" ? <td>{user.role === "owner" ? <span className="text-xs font-bold text-[var(--rcg-muted)]">Protected owner</span> : <details className="min-w-60"><summary className="cursor-pointer text-sm font-extrabold text-red-700">Permanently delete…</summary><p className="mt-2 text-xs text-[var(--rcg-muted)]">Archive instead unless permanent deletion is required.</p><form action={deleteUser} className="mt-2 space-y-2"><input type="hidden" name="profileId" value={user.id} /><input className="input !min-h-9 !py-1" name="confirmEmail" type="email" placeholder={`Type ${user.email}`} required /><button className="btn btn-danger !min-h-9 !px-3" type="submit">Delete permanently</button></form></details>}</td> : null}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
