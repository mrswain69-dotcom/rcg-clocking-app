import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireAdminProfile } from "@/lib/auth";
import { formatUkDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  const { supabase } = await requireAdminProfile();
  const { data } = await supabase.from("audit_log").select("id,action,created_at,performed_by_profile_id,target_profile_id,target_session_id,metadata").order("created_at", { ascending: false }).limit(200);
  const rows = data ?? [];

  const ids = [...new Set(rows.flatMap((row) => [row.performed_by_profile_id, row.target_profile_id]).filter(Boolean))] as string[];
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] as { id: string; full_name: string }[] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Sensitive administrative and attendance changes, newest first."
        action={<Link className="btn btn-secondary" href="/admin">← Admin</Link>}
      />

      <section className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><div><p className="section-kicker">Activity</p><h2 className="text-2xl font-black">Recent changes</h2></div><span className="badge">{rows.length} events</span></div>
        <div className="table-wrap"><table><thead><tr><th>When</th><th>Action</th><th>By</th><th>Target</th><th>Details</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td className="whitespace-nowrap">{formatUkDateTime(row.created_at)}</td><td className="font-extrabold capitalize">{row.action.replaceAll("_", " ")}</td><td>{row.performed_by_profile_id ? names.get(row.performed_by_profile_id) ?? "Unknown" : "System"}</td><td>{row.target_profile_id ? names.get(row.target_profile_id) ?? "User" : row.target_session_id ? "Session" : "—"}</td><td><code className="text-xs text-[var(--rcg-muted)]">{row.metadata ? JSON.stringify(row.metadata) : "—"}</code></td></tr>) : <tr><td colSpan={5} className="text-[var(--rcg-muted)]">No audit events yet.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
