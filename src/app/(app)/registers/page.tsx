import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { isRegisterManager } from "@/lib/registers";
import { formatUkDateTime, londonDateTimeLocalValue } from "@/lib/dates";
import { PageHeader } from "@/components/brand/PageHeader";
import { registerAction } from "./actions";
import { RegisterTabs } from "./register-tabs";
import { RegisterDirectory } from "./directory";

export default async function RegistersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; tab?: string }>;
}) {
  const { supabase, profile } = await requireProfile();
  const manager = isRegisterManager(profile);
  const params = await searchParams;
  const tab =
    manager && ["clients", "contacts"].includes(params.tab ?? "")
      ? params.tab
      : "sessions";
  const [
    { data: sessions, error },
    { data: clients },
    { data: contacts },
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
          .select(
            "id,client_id,party_id,label,email,active,notify_absence,notify_attendance,notify_departure",
          )
          .order("label")
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
        description="Your authorised programmes and sessions. Status and departure buttons save attendance and queue contact notifications immediately."
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
      <RegisterTabs manager={manager} active={tab ?? "sessions"} />
      {tab !== "sessions" ? (
        <RegisterDirectory
          tab={tab as "clients" | "contacts"}
          clients={clients ?? []}
          contacts={contacts ?? []}
        />
      ) : (
        <>
          <section className="card p-5">
            <h2 className="text-2xl font-black">Regular programmes</h2>
            <p className="mt-2">
              Weekly or fortnightly groups and individual bookings, with a
              reusable expected roster.
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
                    {p.kind} ·{" "}
                    {p.interval_weeks === 2 ? "Fortnightly" : "Weekly"} ·{" "}
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
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
