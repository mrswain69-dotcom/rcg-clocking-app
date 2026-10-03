import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  isRegisterManager,
  type RegisterSession,
  type RosterRow,
} from "@/lib/registers";
import { formatUkDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/brand/PageHeader";
import { RegisterWorkspace } from "../register-workspace";
import { registerAction, retryRegisterNotifications } from "../actions";

export default async function RegisterPage({
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
  const query = await searchParams;
  const { data: sessionData } = await supabase
    .from("register_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!sessionData) notFound();
  const session = sessionData as RegisterSession;
  const [
    { data: roster },
    { data: recipients },
    { data: notifications },
    { data: clients },
    { data: accounts },
    { data: leads },
    { data: audit },
  ] = await Promise.all([
    supabase.rpc("register_roster", { p_session: id }),
    supabase.rpc("register_recipient_preview", { p_session: id }),
    supabase
      .from("register_notifications")
      .select("id,recipient,payload,status,attempts,sent_at,error")
      .eq("session_id", id)
      .order("created_at", { ascending: false }),
    manager
      ? supabase
          .from("register_clients")
          .select("id,full_name,display_name")
          .eq("active", true)
          .order("full_name")
      : Promise.resolve({ data: null }),
    manager
      ? supabase
          .from("profiles")
          .select("id,full_name")
          .eq("is_active", true)
          .eq("profile_type", "account")
          .order("full_name")
      : Promise.resolve({ data: null }),
    supabase.from("register_leads").select("profile_id").eq("session_id", id),
    supabase
      .from("register_audit")
      .select("id,action,created_at,detail")
      .eq("session_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const rows = (roster ?? []) as RosterRow[];
  const hidden = (
    <>
      <input type="hidden" name="session_id" value={id} />
      <input type="hidden" name="revision" value={session.revision} />
    </>
  );
  const recipientRows = (recipients ?? []) as {
    client_id: string;
    display_name: string;
    contact_label: string;
    email: string;
    attendance_status: string;
  }[];
  const missingContacts = rows.filter(
    (r) =>
      ["present", "late"].includes(r.status) &&
      !recipientRows.some((k) => k.client_id === r.client_id),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Private register"
        title={session.name}
        description={`${formatUkDateTime(session.starts_at)} to ${formatUkDateTime(session.ends_at)} · ${session.kind} · ${session.status}`}
        action={
          <Link href="/registers" className="btn btn-secondary">
            All registers
          </Link>
        }
      />
      {query.error ? (
        <p className="text-red-800" role="alert">
          {query.error}
        </p>
      ) : null}
      {query.message ? <p role="status">{query.message}</p> : null}
      {manager && session.status !== "cancelled" ? (
        <section className="card p-5">
          <h2 className="text-xl font-black">Session setup</h2>
          <p className="mt-2">
            Assigned leads:{" "}
            {leads
              ?.map(
                (l) =>
                  accounts?.find((p) => p.id === l.profile_id)?.full_name ??
                  l.profile_id.slice(0, 8),
              )
              .join(", ") || "None"}
          </p>
          <form className="mt-4 flex flex-wrap gap-3" action={registerAction}>
            {hidden}
            <input type="hidden" name="action" value="assign_lead" />
            <label>
              Assign lead
              <select className="input" name="profile_id" required>
                <option value="">Choose account</option>
                {accounts?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-secondary" type="submit">
              Assign lead
            </button>
          </form>
          {session.status === "draft" ? (
            <form className="mt-4 flex flex-wrap gap-3" action={registerAction}>
              {hidden}
              <input type="hidden" name="action" value="enrol" />
              <label>
                Add expected attendee
                <select className="input" name="client_id" required>
                  <option value="">Choose client</option>
                  {clients
                    ?.filter((c) => !rows.some((row) => row.client_id === c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} · {c.id.slice(0, 8)}
                      </option>
                    ))}
                </select>
              </label>
              <button className="btn btn-secondary" type="submit">
                Add to register
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
      <RegisterWorkspace
        key={id}
        sessionId={id}
        revision={session.revision}
        rows={rows}
        confirmed={Boolean(session.confirmed_at)}
        canEdit={
          session.status !== "cancelled" && (!session.confirmed_at || manager)
        }
      >
        {session.status === "draft" ? (
          <section className="card p-5">
            <h2 className="text-2xl font-black">Review notifications</h2>
            <p className="mt-2">
              Emails use “{session.external_label}”, display names and saved
              attendance. Each contact receives only their linked client’s
              record. No case notes are included.
            </p>
            <div className="table-wrap mt-4">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Recipient</th>
                    <th>Address</th>
                    <th>Saved status</th>
                  </tr>
                </thead>
                <tbody>
                  {recipientRows.map((k) => (
                    <tr key={`${k.client_id}-${k.email}`}>
                      <td>{k.display_name}</td>
                      <td>{k.contact_label}</td>
                      <td>{k.email}</td>
                      <td>{k.attendance_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!recipientRows.length ? (
              <p className="mt-3">
                No emails will be sent for the currently saved attendance.
              </p>
            ) : null}
            {missingContacts.length ? (
              <p className="mt-3 text-amber-900">
                No approved contact for:{" "}
                {missingContacts.map((r) => r.display_name).join(", ")}. These
                attendees will be recorded without an email.
              </p>
            ) : null}
            <form action={registerAction} className="mt-4 space-y-3">
              {hidden}
              <input type="hidden" name="action" value="confirm" />
              <label className="flex gap-2">
                <input type="checkbox" required />I have saved the attendance
                and checked the recipients above.
              </label>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={
                  !rows.length || rows.some((r) => r.status === "unmarked")
                }
              >
                Confirm attendance and notify
              </button>
            </form>
          </section>
        ) : null}
      </RegisterWorkspace>
      <section className="card p-5">
        <h2 className="text-2xl font-black">Notification history</h2>
        <p>
          Sent means accepted by the email provider; it does not prove delivery
          or that the recipient has read it.
        </p>
        <div className="table-wrap mt-4">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {notifications?.map((n) => (
                <tr key={n.id}>
                  <td>{n.payload.display_name}</td>
                  <td>{n.recipient}</td>
                  <td>{n.status}</td>
                  <td>{formatUkDateTime(n.sent_at)}</td>
                  <td>{n.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {session.status === "confirmed" ? (
          <form action={retryRegisterNotifications} className="mt-4">
            <input type="hidden" name="session_id" value={id} />
            <button className="btn btn-secondary" type="submit">
              Process pending or failed notifications
            </button>
          </form>
        ) : null}
      </section>
      {manager && session.status !== "cancelled" ? (
        <details className="card p-5">
          <summary className="font-bold">Cancel session</summary>
          <p>
            Cancelled sessions are excluded from attendance totals. Previously
            sent emails cannot be recalled.
          </p>
          <form action={registerAction} className="mt-4 flex gap-3">
            {hidden}
            <input type="hidden" name="action" value="cancel" />
            <input
              className="input"
              name="reason"
              required
              placeholder="Cancellation reason"
            />
            <button className="btn btn-secondary" type="submit">
              Cancel session
            </button>
          </form>
        </details>
      ) : null}
      <details className="card p-5">
        <summary className="font-bold">Register audit history</summary>
        {audit?.map((a) => (
          <p className="mt-2" key={a.id}>
            {formatUkDateTime(a.created_at)} · {a.action.replaceAll("_", " ")}
            {a.detail?.reason ? ` · ${a.detail.reason}` : ""}
          </p>
        ))}
      </details>
    </div>
  );
}
