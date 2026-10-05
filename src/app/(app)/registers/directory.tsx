import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { registerAction } from "./actions";
export type Client = {
  id: string;
  full_name: string;
  display_name: string;
  active: boolean;
};
export type Party = {
  id: string;
  label: string;
  email: string;
  kind: string;
  phone: string;
  active: boolean;
};
export type Contact = {
  id: string;
  client_id: string;
  party_id: string | null;
  label: string;
  email: string;
  active: boolean;
  notify_attendance: boolean;
  notify_departure: boolean;
  notify_absence: boolean;
};
export function VerificationFields({
  authority = false,
}: {
  authority?: boolean;
}) {
  return (
    <>
      <label>
        Verification reference
        <input
          className="input"
          name="reason"
          maxLength={500}
          placeholder="Date and method checked; no case notes"
          required
        />
      </label>
      <label className="flex gap-2 items-center">
        <input type="checkbox" name="address_verified" required />I have
        verified this email address.
      </label>
      {authority ? (
        <label className="flex gap-2 items-center">
          <input type="checkbox" name="sharing_authorised" required />
          This contact is authorised to receive this client’s attendance.
        </label>
      ) : null}
    </>
  );
}
export function PartyFields({ party }: { party?: Party }) {
  return (
    <>
      <label>
        Name
        <input
          name="label"
          className="input"
          minLength={2}
          maxLength={120}
          required
          defaultValue={party?.label}
        />
      </label>
      <label>
        Type
        <select
          name="kind"
          className="input"
          defaultValue={party?.kind ?? "carer"}
        >
          <option value="school">School</option>
          <option value="carer">Carer</option>
        </select>
      </label>
      <label>
        Email
        <input
          type="email"
          name="email"
          className="input"
          required
          defaultValue={party?.email}
        />
      </label>
      <label>
        Phone
        <input
          name="phone"
          className="input"
          maxLength={80}
          defaultValue={party?.phone}
        />
      </label>
      <label>
        <input
          type="checkbox"
          name="active"
          defaultChecked={party?.active ?? true}
        />{" "}
        Active
      </label>
      <VerificationFields />
    </>
  );
}
export function ContactLinkForm({
  client,
  party,
  contacts,
  clients,
  parties,
  returnPath,
  link,
}: {
  client?: Client;
  party?: Party;
  contacts?: Contact[];
  clients?: Client[];
  parties?: Party[];
  returnPath: string;
  link?: Contact;
}) {
  return (
    <form action={registerAction} className="mt-4 grid gap-3 sm:grid-cols-2">
      <input
        type="hidden"
        name="action"
        value={link ? "update_contact" : "link_contact"}
      />
      <input type="hidden" name="return_path" value={returnPath} />
      {link ? (
        <input type="hidden" name="contact_id" value={link.id} />
      ) : (
        <>
          {client ? (
            <input type="hidden" name="client_id" value={client.id} />
          ) : (
            <label>
              Client
              <select className="input" name="client_id" required>
                <option value="">Choose client</option>
                {clients
                  ?.filter(
                    (c) =>
                      c.active && !contacts?.some((k) => k.client_id === c.id),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} · {c.id.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {party ? (
            <input type="hidden" name="party_id" value={party.id} />
          ) : (
            <label>
              School / carer
              <select className="input" name="party_id" required>
                <option value="">Choose contact</option>
                {parties
                  ?.filter(
                    (p) =>
                      p.active && !contacts?.some((k) => k.party_id === p.id),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} · {p.email}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </>
      )}
      <label>
        <input
          type="checkbox"
          name="active"
          defaultChecked={link?.active ?? true}
        />{" "}
        Link active (uncheck to remove notifications)
      </label>
      <label>
        <input
          type="checkbox"
          name="notify_attendance"
          defaultChecked={link?.notify_attendance ?? true}
        />{" "}
        Arrival / attendance notifications
      </label>
      <label>
        <input
          type="checkbox"
          name="notify_absence"
          defaultChecked={link?.notify_absence ?? true}
        />{" "}
        Include absence notifications
      </label>
      <label>
        <input
          type="checkbox"
          name="notify_departure"
          defaultChecked={link?.notify_departure ?? false}
        />{" "}
        Departure notifications
      </label>
      <VerificationFields authority />
      <button className="btn btn-primary">
        {link ? "Save contact link" : "Add approved contact link"}
      </button>
    </form>
  );
}
export async function RegisterDirectory({
  tab,
  clients,
  contacts,
}: {
  tab: "clients" | "contacts";
  clients: Client[];
  contacts: Contact[];
}) {
  const { supabase } = await requireProfile();
  const { data } = await supabase
    .from("register_parties")
    .select("*")
    .order("label");
  const parties = (data ?? []) as Party[];
  return tab === "clients" ? (
    <section className="card p-5">
      <h2 className="text-2xl font-black">Client directory</h2>
      <p className="mt-2">
        Internal full names stay in this restricted directory. Registers and
        emails use the display name. Each client can have several approved
        contacts.
      </p>
      <div className="table-wrap mt-4">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Display name</th>
              <th>Contacts</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link
                    className="underline font-bold"
                    href={`/registers/clients/${c.id}`}
                  >
                    {c.full_name}
                  </Link>
                </td>
                <td>{c.display_name}</td>
                <td>
                  {
                    contacts.filter((k) => k.client_id === c.id && k.active)
                      .length
                  }
                </td>
                <td>{c.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={registerAction} className="mt-5 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="action" value="create_client" />
        <input
          type="hidden"
          name="return_path"
          value="/registers?tab=clients"
        />
        <label>
          Full name
          <input
            className="input"
            name="full_name"
            minLength={2}
            maxLength={200}
            required
          />
        </label>
        <label>
          Display name
          <input
            className="input"
            name="display_name"
            minLength={2}
            maxLength={80}
            placeholder="Alex B."
            required
          />
        </label>
        <button className="btn btn-primary">Add client</button>
      </form>
    </section>
  ) : (
    <section className="card p-5">
      <h2 className="text-2xl font-black">School / carer directory</h2>
      <p className="mt-2">
        Manage shared contact details, linked clients and each client’s
        notification preferences.
      </p>
      <div className="table-wrap mt-4">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Email</th>
              <th>Clients</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {parties.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link
                    className="font-bold underline"
                    href={`/registers/contacts/${p.id}`}
                  >
                    {p.label}
                  </Link>
                </td>
                <td>{p.kind}</td>
                <td>{p.email}</td>
                <td>
                  {
                    contacts.filter((k) => k.party_id === p.id && k.active)
                      .length
                  }
                </td>
                <td>{p.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mt-6 font-bold">Add school or carer</h3>
      <form action={registerAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="action" value="create_party" />
        <input
          type="hidden"
          name="return_path"
          value="/registers?tab=contacts"
        />
        <PartyFields />
        <button className="btn btn-primary">Add school / carer</button>
      </form>
    </section>
  );
}
