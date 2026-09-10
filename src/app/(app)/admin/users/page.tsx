import type { Metadata } from "next";
import { requireAdminProfile } from "@/lib/auth";
import { formatUkDateTime } from "@/lib/dates";
import { setUserActive } from "./actions";

export const metadata: Metadata = { title: "Manage users" };

export default async function AdminUsersPage() {
  const { supabase } = await requireAdminProfile();
  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,is_active,can_view_currently_on_site,can_use_kiosk,archived_at")
    .order("full_name");
  const users = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.12em] text-[var(--rcg-orange)]">Administration</p>
        <h1 className="mt-1 text-3xl font-black">Users</h1>
        <p className="mt-2 text-[var(--rcg-muted)]">
          Archive or reactivate accounts. Role changes and PIN resets will use the privileged admin endpoint in the next build stage.
        </p>
      </div>

      <section className="card p-5 sm:p-6">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Kiosk</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-bold">{user.full_name}</td>
                  <td><span className="badge">{user.role}</span></td>
                  <td>{user.email}</td>
                  <td>{user.can_use_kiosk ? "Yes" : "No"}</td>
                  <td>{user.is_active ? "Active" : `Archived ${formatUkDateTime(user.archived_at)}`}</td>
                  <td>
                    <form action={setUserActive}>
                      <input type="hidden" name="profileId" value={user.id} />
                      <input type="hidden" name="active" value={String(!user.is_active)} />
                      <button className={user.is_active ? "btn-danger !min-h-9 !px-3" : "btn-secondary !min-h-9 !px-3"} type="submit">
                        {user.is_active ? "Archive" : "Reactivate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
