import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/brand/PageHeader";
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
      <PageHeader
        eyebrow="Site safety"
        title="Who's on site"
        description="People currently recorded as being at Redcatch Community Garden. This list updates automatically as people clock in and out."
      />
      <OnSiteLive initialRows={data ?? []} />
    </div>
  );
}
