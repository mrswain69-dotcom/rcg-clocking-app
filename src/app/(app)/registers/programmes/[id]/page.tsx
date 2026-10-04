import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isRegisterManager } from "@/lib/registers";
import { formatUkDateTime } from "@/lib/dates";
import { registerAction } from "../../actions";
import { ProgrammeForm, type Programme } from "../programme-form";

export default async function ProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, profile } = await requireProfile();
  const manager = isRegisterManager(profile);
  const feedback = await searchParams;
  const { data } = await supabase
    .from("register_programmes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as Programme;
  const { data: cap } = await supabase.rpc("register_capabilities", {
    p_programme: id,
  });
  const manage = Boolean(cap?.manage);
  const [
    { data: roster },
    { data: access },
    { data: accounts },
    { data: clients },
    { data: sessions },
    { data: audit },
  ] = await Promise.all([
    supabase.rpc("programme_roster", { p_programme: id }),
    supabase
      .from("register_programme_access")
      .select("profile_id,access_role")
      .eq("programme_id", id),
    manage
      ? supabase.rpc("register_accounts", { p_programme: id })
      : Promise.resolve({ data: null }),
    manager
      ? supabase
          .from("register_clients")
          .select("id,full_name,display_name")
          .eq("active", true)
          .order("full_name")
      : Promise.resolve({ data: null }),
    supabase
      .from("register_sessions")
      .select("id,name,starts_at,status,programme_date")
      .eq("programme_id", id)
      .order("starts_at"),
    manager
      ? supabase
          .from("register_audit")
          .select("id,action,created_at,detail")
          .contains("detail", { programme_id: id })
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: null }),
  ]);
  const hidden = (
    <>
      <input type="hidden" name="programme_id" value={id} />
      <input type="hidden" name="revision" value={p.revision} />
    </>
  );
  const dates: string[] = [];
  const cursor = new Date(`${p.first_date}T12:00:00Z`);
  const last = new Date(`${p.last_date}T12:00:00Z`);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
  }).format(new Date());
  for (
    ;
    cursor <= last;
    cursor.setUTCDate(cursor.getUTCDate() + 7 * p.interval_weeks)
  ) {
    const d = cursor.toISOString().slice(0, 10);
    if (
      d >= today &&
      !p.excluded_dates.includes(d) &&
      !sessions?.some((s) => s.programme_date === d)
    )
      dates.push(d);
  }
  return (
    <div className="space-y-6">
      <Link href="/registers" className="btn btn-secondary">
        All registers
      </Link>
      <h1 className="text-3xl font-black">{p.name}</h1>
      {feedback.error ? (
        <p role="alert" className="text-red-800">
          {feedback.error}
        </p>
      ) : null}
      {feedback.message ? <p role="status">{feedback.message}</p> : null}
      <p>
        {p.kind} · {p.interval_weeks === 2 ? "Fortnightly" : "Weekly"} ·{" "}
        {p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)} UK time ·{" "}
        {p.active ? "Active" : "Inactive"}
      </p>
      {manage ? (
        <details className="card p-5">
          <summary className="font-bold">
            Schedule and programme settings
          </summary>
          <ProgrammeForm programme={p} />
        </details>
      ) : null}
      <section className="card p-5">
        <h2 className="text-2xl font-black">Regular expected attendees</h2>
        <p className="mt-2">
          Enrolment dates apply to newly created registers. Existing registers
          keep their own roster; refresh an untouched future register explicitly
          to use the updated list.
        </p>
        <div className="table-wrap mt-4">
          <table>
            <thead>
              <tr>
                <th>Attendee</th>
                <th>From</th>
                <th>Until</th>
              </tr>
            </thead>
            <tbody>
              {roster?.map(
                (e: {
                  client_id: string;
                  display_name: string;
                  from_date: string;
                  to_date: string | null;
                }) => (
                  <tr key={e.client_id}>
                    <td>
                      {e.display_name} · {e.client_id.slice(0, 8)}
                    </td>
                    <td>{e.from_date}</td>
                    <td>{e.to_date ?? "Ongoing"}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {manage ? (
          <form
            action={registerAction}
            className="mt-5 grid gap-3 sm:grid-cols-2"
          >
            {hidden}
            <input type="hidden" name="action" value="programme_enrol" />
            <label>
              {manager
                ? "Allocate or update client"
                : "Update allocated attendee"}
              <select className="input" name="client_id" required>
                <option value="">Choose attendee</option>
                {(clients ?? roster)?.map(
                  (c: {
                    id?: string;
                    client_id?: string;
                    full_name?: string;
                    display_name: string;
                  }) => (
                    <option
                      key={c.id ?? c.client_id}
                      value={c.id ?? c.client_id}
                    >
                      {c.full_name ?? c.display_name} ·{" "}
                      {(c.id ?? c.client_id)?.slice(0, 8)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Expected from
              <input
                className="input"
                type="date"
                name="from_date"
                defaultValue={p.first_date}
                required
              />
            </label>
            <label>
              Expected until (optional)
              <input className="input" type="date" name="to_date" />
            </label>
            <button className="btn btn-primary" type="submit">
              Save enrolment dates
            </button>
          </form>
        ) : null}
        {!manager && manage ? (
          <p className="mt-3">
            Ask a register manager to allocate a new client to this programme.
          </p>
        ) : null}
      </section>
      {manager ? (
        <section className="card p-5">
          <h2 className="text-2xl font-black">Programme permissions</h2>
          <p>
            Access applies to this programme and its dated registers. Changing
            it takes effect immediately. An explicit session lead assignment
            remains separate.
          </p>
          <ul className="mt-3">
            {access?.map((a) => (
              <li key={a.profile_id}>
                {accounts?.find(
                  (v: { id: string; full_name: string }) =>
                    v.id === a.profile_id,
                )?.full_name ?? a.profile_id.slice(0, 8)}{" "}
                · {a.access_role}
              </li>
            ))}
          </ul>
          <form action={registerAction} className="mt-4 flex flex-wrap gap-3">
            {hidden}
            <input type="hidden" name="action" value="programme_permission" />
            <label>
              Account
              <select className="input" name="profile_id" required>
                <option value="">Choose account</option>
                {accounts?.map((a: { id: string; full_name: string }) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Access
              <select className="input" name="access_role">
                <option value="coordinator">
                  Coordinator — schedule, roster and attendance
                </option>
                <option value="lead">Lead — take and confirm attendance</option>
                <option value="viewer">Reporting viewer — read only</option>
                <option value="none">Remove programme access</option>
              </select>
            </label>
            <button className="btn btn-primary" type="submit">
              Save programme access
            </button>
          </form>
        </section>
      ) : null}
      {manage ? (
        <section className="card p-5">
          <h2 className="text-2xl font-black">Review missing dates</h2>
          <p>
            {dates.length} new registers, excluding breaks and dates already
            created. UK daylight saving is handled automatically.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {dates.map((d) => (
              <span className="rounded-full border px-3 py-1" key={d}>
                {d}
              </span>
            ))}
          </div>
          <form action={registerAction} className="mt-4">
            {hidden}
            <input type="hidden" name="action" value="generate_sessions" />
            <label className="block mb-3">
              <input type="checkbox" required /> I have checked the schedule and
              expected attendee list.
            </label>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={!dates.length || !p.active}
            >
              Create {dates.length} missing registers
            </button>
          </form>
        </section>
      ) : null}
      <section className="card p-5">
        <h2 className="text-2xl font-black">Dated registers</h2>
        <div className="table-wrap mt-4">
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>Start</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions?.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      className="underline font-bold"
                      href={`/registers/${s.id}`}
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td>{formatUkDateTime(s.starts_at)}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          Changing a schedule leaves existing dates intact. Edit or cancel
          individual future sessions to handle exceptions.
        </p>
      </section>
      {manager ? (
        <details className="card p-5">
          <summary className="font-bold">Programme audit history</summary>
          {audit?.map((a) => (
            <p className="mt-2" key={a.id}>
              {formatUkDateTime(a.created_at)} · {a.action.replaceAll("_", " ")}
            </p>
          ))}
        </details>
      ) : null}
    </div>
  );
}
