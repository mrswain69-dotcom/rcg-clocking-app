import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isRegisterManager } from "@/lib/registers";
import { PageHeader } from "@/components/brand/PageHeader";
import { RegisterTabs } from "../../register-tabs";
import {
  ContactLinkForm,
  type Client,
  type Party,
  type Contact,
} from "../../directory";
import { registerAction } from "../../actions";
export default async function ClientPage({
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
  const [{ data: c }, { data: k }, { data: p }] = await Promise.all([
    supabase.from("register_clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("register_contacts").select("*").eq("client_id", id),
    supabase.from("register_parties").select("*").order("label"),
  ]);
  if (!c) notFound();
  const client = c as Client;
  const contacts = (k ?? []) as Contact[];
  const parties = (p ?? []) as Party[];
  const q = await searchParams;
  const path = `/registers/clients/${id}`;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Client directory"
        title={client.full_name}
        description="Edit internal details and approved contact links."
      />
      <RegisterTabs manager active="clients" />
      {q.error ? (
        <p role="alert" className="text-red-800">
          {q.error}
        </p>
      ) : null}
      {q.message ? <p role="status">{q.message}</p> : null}
      <section className="card p-5">
        <h2 className="text-xl font-bold">Client details</h2>
        <form
          action={registerAction}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="action" value="update_client" />
          <input type="hidden" name="client_id" value={id} />
          <input type="hidden" name="return_path" value={path} />
          <label>
            Full name
            <input
              className="input"
              name="full_name"
              minLength={2}
              maxLength={200}
              defaultValue={client.full_name}
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
              defaultValue={client.display_name}
              required
            />
          </label>
          <label>
            <input
              type="checkbox"
              name="active"
              defaultChecked={client.active}
            />
            Active client
          </label>
          <button className="btn btn-primary">Save client</button>
        </form>
      </section>
      <section className="card p-5">
        <h2 className="text-xl font-bold">Approved contacts</h2>
        {contacts.map((link) => (
          <details key={link.id} className="mt-3 rounded-xl border p-4">
            <summary className="font-bold">
              {link.label} · {link.email} ·{" "}
              {link.active ? "Active" : "Disabled"}
            </summary>
            <Link
              className="mt-3 block underline"
              href={`/registers/contacts/${link.party_id}`}
            >
              Edit school / carer details
            </Link>
            <ContactLinkForm link={link} returnPath={path} />
          </details>
        ))}
        <h3 className="mt-6 font-bold">Add another contact</h3>
        <ContactLinkForm
          client={client}
          parties={parties}
          contacts={contacts}
          returnPath={path}
        />
      </section>
    </div>
  );
}
