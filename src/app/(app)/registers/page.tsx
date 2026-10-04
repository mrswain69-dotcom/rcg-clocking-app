import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { isRegisterManager } from "@/lib/registers";
import { formatUkDateTime, londonDateTimeLocalValue } from "@/lib/dates";
import { PageHeader } from "@/components/brand/PageHeader";
import { registerAction } from "./actions";

export default async function RegistersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { supabase, profile } = await requireProfile();
  const manager = isRegisterManager(profile);
  const params = await searchParams;
  const [
    { data: sessions, error },
    { data: clients },
    { data: contacts },
    { data: admins },
    { data: programmes },
  ] = await Promise.all([
    supabase
      .from("register_sessions")
      .select("id,name,starts_at,ends_at,kind,status")
      .order("starts_at", { ascending: false })
      .limit(300),
    manager
      ? supabase
          .from("register_clients")
          .select("id,full_name,display_name,active")
          .order("full_name")
      : Promise.resolve({ data: null }),
    manager
      ? supabase
          .from("register_contacts")
          .select("id,client_id,label,email,active,notify_absence")
          .order("label")
      : Promise.resolve({ data: null }),
    profile.role === "owner"
      ? supabase
          .from("profiles")
          .select("id,full_name,can_manage_registers")
          .eq("profile_type", "account")
          .eq("is_active", true)
          .is("archived_at", null)
      : Promise.resolve({ data: null }),
    supabase
      .from("register_programmes")
      .select("id,name,kind,active,first_date,last_date,interval_weeks")
      .order("name"),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Client attendance"
        title="Session registers"
        description="Private registers for assigned sessions. Saving attendance does not send emails; confirming the register does."
        action={
          <Link className="btn btn-secondary" href="/registers/reports">
            Attendance reports
          </Link>
        }
      />
      {params.error || error ? (
        <p role="alert" className="text-red-800">
          {params.error ??
            "Registers are unavailable. Check that the register migration has been applied."}
        </p>
      ) : null}
      {params.message ? <p role="status">{params.message}</p> : null}
      <section className="card p-5">
        <h2 className="text-2xl font-black">Regular programmes</h2>
        <p className="mt-2">
          Weekly or fortnightly groups and individual bookings, with a reusable
          expected roster.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {programmes?.map((p) => (
            <Link
              className="card p-4"
              key={p.id}
              href={`/registers/programmes/${p.id}`}
            >
              <strong>{p.name}</strong>
              <p>
                {p.kind} · {p.interval_weeks === 2 ? "Fortnightly" : "Weekly"} ·{" "}
                {p.active ? "Active" : "Inactive"}
              </p>
            </Link>
          ))}
        </div>
        {!programmes?.length ? (
          <p className="mt-3">No programmes assigned.</p>
        ) : null}
        {manager ? (
          <Link
            className="btn btn-primary mt-4"
            href="/registers/programmes/new"
          >
            Create programme
          </Link>
        ) : null}
      </section>
      <section className="card p-5">
        <h2 className="text-2xl font-black">
          {manager ? "All sessions" : "Your assigned sessions"}
        </h2>
        <div className="table-wrap mt-4">
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>Scheduled start</th>
                <th>End</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions?.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      className="font-bold underline"
                      href={`/registers/${s.id}`}
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td>{formatUkDateTime(s.starts_at)}</td>
                  <td>{formatUkDateTime(s.ends_at)}</td>
                  <td>{s.kind}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
              {!sessions?.length ? (
                <tr>
                  <td colSpan={5}>No sessions available.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      {manager ? (
        <>
          <section className="card p-5">
            <h2 className="text-2xl font-black">Create a session</h2>
            <form
              action={registerAction}
              className="mt-4 grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="action" value="create_session" />
              <label>
                Session name
                <input
                  className="input"
                  name="name"
                  required
                  minLength={2}
                  maxLength={200}
                />
              </label>
              <label>
                Name used in emails
                <input
                  className="input"
                  name="external_label"
                  defaultValue="RCG session"
                  required
                  maxLength={200}
                />
                <small>
                  Use a neutral description that is suitable to share.
                </small>
              </label>
              <label>
                Start · UK time
                <input
                  className="input"
                  type="datetime-local"
                  name="starts_at"
                  required
                  defaultValue={londonDateTimeLocalValue()}
                />
              </label>
              <label>
                End · UK time
                <input
                  className="input"
                  type="datetime-local"
                  name="ends_at"
                  required
                />
              </label>
              <label>
                Type
                <select className="input" name="kind">
                  <option value="group">Group</option>
                  <option value="individual">Individual</option>
                </select>
              </label>
              <button className="btn btn-primary" type="submit">
                Create session
              </button>
            </form>
          </section>
          <section className="card p-5">
            <h2 className="text-2xl font-black">Client directory</h2>
            <p className="mt-2">
              Full names are visible to register managers. Leads and attendance
              emails use the display name. Client records do not create login
              accounts.
            </p>
            <div className="table-wrap mt-4">
              <table>
                <thead>
                  <tr>
                    <th>Full name</th>
                    <th>Display name</th>
                    <th>Reference</th>
                    <th>Approved contacts</th>
                  </tr>
                </thead>
                <tbody>
                  {clients?.map((c) => (
                    <tr key={c.id}>
                      <td>{c.full_name}</td>
                      <td>{c.display_name}</td>
                      <td>{c.id.slice(0, 8)}</td>
                      <td>
                        {contacts
                          ?.filter((k) => k.client_id === c.id)
                          .map((k) => (
                            <div key={k.id} className="mb-2">
                              {k.label} · {k.email} ·{" "}
                              {k.active ? "Active" : "Disabled"}
                              {k.active ? (
                                <form action={registerAction}>
                                  <input
                                    type="hidden"
                                    name="action"
                                    value="deactivate_contact"
                                  />
                                  <input
                                    type="hidden"
                                    name="contact_id"
                                    value={k.id}
                                  />
                                  <button
                                    className="underline text-sm"
                                    type="submit"
                                  >
                                    Disable contact
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={registerAction} className="mt-5 flex flex-wrap gap-4">
              <input type="hidden" name="action" value="create_client" />
              <label>
                Full name
                <input
                  className="input"
                  name="full_name"
                  required
                  minLength={2}
                  maxLength={200}
                />
              </label>
              <label>
                Display name
                <input
                  className="input"
                  name="display_name"
                  placeholder="Alex B."
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
              <button className="btn btn-primary" type="submit">
                Add client
              </button>
            </form>
          </section>
          <section className="card p-5">
            <h2 className="text-2xl font-black">
              Approve a school or carer contact
            </h2>
            <form
              action={registerAction}
              className="mt-4 grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="action" value="approve_contact" />
              <label>
                Client
                <select className="input" name="client_id" required>
                  <option value="">Choose client</option>
                  {clients?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} · {c.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                School or carer name
                <input
                  className="input"
                  name="label"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
              <label>
                Email
                <input className="input" name="email" type="email" required />
              </label>
              <label>
                Verification and authority reference
                <input
                  className="input"
                  name="reason"
                  required
                  maxLength={500}
                  placeholder="Date and method checked; no sensitive case notes"
                />
              </label>
              <label className="flex gap-2">
                <input type="checkbox" name="address_verified" required />I have
                independently verified this recipient address.
              </label>
              <label className="flex gap-2">
                <input type="checkbox" name="sharing_authorised" required />
                This recipient is authorised to receive this client’s
                attendance.
              </label>
              <label className="flex gap-2">
                <input type="checkbox" name="notify_absence" />
                Also send confirmed absence notifications.
              </label>
              <button className="btn btn-primary" type="submit">
                Approve contact
              </button>
            </form>
          </section>
        </>
      ) : null}
      {profile.role === "owner" && admins?.length ? (
        <section className="card p-5">
          <h2 className="text-2xl font-black">Register manager access</h2>
          <p>
            Any active account can be a register manager without becoming a
            clocking administrator. Developer status does not grant access to
            client records.
          </p>
          {admins.map((a) => (
            <form
              className="mt-4 flex gap-3 items-center"
              action={registerAction}
              key={a.id}
            >
              <input type="hidden" name="action" value="manager_permission" />
              <input type="hidden" name="profile_id" value={a.id} />
              <label>
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={a.can_manage_registers}
                />{" "}
                {a.full_name}
              </label>
              <button className="btn btn-secondary" type="submit">
                Save access
              </button>
            </form>
          ))}
        </section>
      ) : null}
    </div>
  );
}
