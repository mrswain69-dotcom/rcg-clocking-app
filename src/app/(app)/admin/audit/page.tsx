import type { Metadata } from "next";
import Link from "next/link";
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
      <div><Link className="text-sm font-bold text-[var(--rcg-green)]" href="/admin">← Admin</Link><h1 className="mt-2 text-3xl font-black">Audit log</h1><p className="mt-2 text-[var(--rcg-muted)]">Sensitive administrative and attendance changes, newest first.</p></div>
      <section className="card p-5 sm:p-6"><div className="table-wrap"><table><thead><tr><th>When</th><th>Action</th><th>By</th><th>Target</th><th>Details</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="whitespace-nowrap">{formatUkDateTime(row.created_at)}</td><td className="font-bold">{row.action.replaceAll("_", " ")}</td><td>{row.performed_by_profile_id ? names.get(row.performed_by_profile_id) ?? "Unknown" : "System"}</td><td>{row.target_profile_id ? names.get(row.target_profile_id) ?? "User" : row.target_session_id ? "Session" : "—"}</td><td><code className="text-xs">{row.metadata ? JSON.stringify(row.metadata) : "—"}</code></td></tr>)}</tbody></table></div></section>
    </div>
  );
}
