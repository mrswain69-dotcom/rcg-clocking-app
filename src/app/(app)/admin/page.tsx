import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminProfile } from "@/lib/auth";
import { OnSiteLive } from "./on-site-live";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const { supabase } = await requireAdminProfile();
  const { data: current = [] } = await supabase
    .from("current_on_site_view")
    .select("*")
    .order("clock_in_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.12em] text-[var(--rcg-orange)]">Site safety</p>
          <h1 className="mt-1 text-3xl font-black">Admin dashboard</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">Live presence and operational controls.</p>
        </div>
        <Link className="btn-secondary inline-flex items-center" href="/admin/users">Manage users</Link>
      </div>

      <OnSiteLive initialRows={current} />
    </div>
  );
}
