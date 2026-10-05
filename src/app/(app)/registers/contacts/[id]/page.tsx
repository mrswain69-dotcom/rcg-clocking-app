import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isRegisterManager } from "@/lib/registers";
import { PageHeader } from "@/components/brand/PageHeader";
import { RegisterTabs } from "../../register-tabs";
import {
  ContactLinkForm,
  PartyFields,
  type Client,
  type Party,
  type Contact,
} from "../../directory";
import { registerAction } from "../../actions";
export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, profile } = await requireProfile();
  if (!isRegisterManager(profile)) redirect("/registers");
  const [{ data: p }, { data: k }, { data: c }] = await Promise.all([
    supabase.from("register_parties").select("*").eq("id", id).maybeSingle(),
    supabase.from("register_contacts").select("*").eq("party_id", id),
    supabase.from("register_clients").select("*").order("full_name"),
  ]);
  if (!p) notFound();
  const party = p as Party;
  const contacts = (k ?? []) as Contact[];
  const clients = (c ?? []) as Client[];
  const q = await searchParams;
  const path = `/registers/contacts/${id}`;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="School / carer directory"
        title={party.label}
        description="Shared contact details and authorised client links."
      />
      <RegisterTabs manager active="contacts" />
      {q.error ? (
        <p role="alert" className="text-red-800">
          {q.error}
        </p>
      ) : null}
      {q.message ? <p role="status">{q.message}</p> : null}
      <section className="card p-5">
        <h2 className="text-xl font-bold">Contact details</h2>
        <p>
          Changing an email blocks unsent messages to the old address. Review
          the linked clients, then regenerate any notifications needed.
        </p>
        <form
          action={registerAction}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="action" value="update_party" />
          <input type="hidden" name="party_id" value={id} />
          <input type="hidden" name="return_path" value={path} />
          <PartyFields party={party} />
          <button className="btn btn-primary">Save school / carer</button>
        </form>
      </section>
      <section className="card p-5">
        <h2 className="text-xl font-bold">Associated clients</h2>
        {contacts.map((link) => (
          <details key={link.id} className="mt-3 rounded-xl border p-4">
            <summary className="font-bold">
              {clients.find((c) => c.id === link.client_id)?.full_name} ·{" "}
              {link.active ? "Active" : "Disabled"}
            </summary>
            <Link
              className="mt-3 block underline"
              href={`/registers/clients/${link.client_id}`}
            >
              Edit client details
            </Link>
            <ContactLinkForm link={link} returnPath={path} />
          </details>
        ))}
        <h3 className="mt-6 font-bold">Link another client</h3>
        <ContactLinkForm
          party={party}
          clients={clients}
          contacts={contacts}
          returnPath={path}
        />
      </section>
    </div>
  );
}
