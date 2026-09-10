import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { OnSiteLive } from "../admin/on-site-live";

export const metadata: Metadata = { title: "Currently on site" };

export default async function OnSitePage() {
  const { supabase, profile } = await requireProfile();
  const adminLike = ["owner", "admin", "developer"].includes(profile.role);

  if (!adminLike && !profile.can_view_currently_on_site) {
    redirect("/dashboard");
  }

  const { data } = await supabase
    .from("current_on_site_view")
    .select("*")
    .order("clock_in_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.12em] text-[var(--rcg-orange)]">Site safety</p>
        <h1 className="mt-1 text-3xl font-black">Currently on site</h1>
        <p className="mt-2 text-[var(--rcg-muted)]">
          Live attendance for people currently recorded as at Redcatch Community Garden.
        </p>
      </div>

      <OnSiteLive initialRows={data ?? []} />
    </div>
  );
}
