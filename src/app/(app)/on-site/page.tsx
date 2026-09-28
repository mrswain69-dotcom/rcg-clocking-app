import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireProfile } from "@/lib/auth";
import { OnSiteLive } from "../admin/on-site-live";
import { AdminAttendanceControls } from "../admin/admin-attendance-controls";

export const metadata: Metadata = { title: "Currently on site" };

export default async function OnSitePage() {
  const { supabase, profile } = await requireProfile();
  const adminLike = ["owner", "admin", "developer"].includes(profile.role);

  if (!adminLike && !profile.can_view_currently_on_site) {
    redirect("/dashboard");
  }

  const [{ data }, { data: peopleData }] = await Promise.all([
    supabase
      .from("current_on_site_view")
      .select("*")
      .order("clock_in_at", { ascending: true }),
    adminLike
      ? supabase
          .from("profiles")
          .select("id,full_name,profile_type,attendance_category,organisation,is_active,archived_at")
          .eq("is_active", true)
          .is("archived_at", null)
          .order("full_name")
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Site safety"
        title="Who's on site"
        description="People currently recorded as being at Redcatch Community Garden. This list updates automatically as people clock in and out."
      />
      {adminLike ? (
        <AdminAttendanceControls
          people={peopleData ?? []}
          openSessions={(data ?? []).map((row) => ({
            session_id: row.session_id,
            profile_id: row.profile_id,
            full_name: row.full_name,
            clock_in_at: row.clock_in_at,
            profile_type: row.profile_type,
          }))}
        />
      ) : null}
      <OnSiteLive initialRows={data ?? []} canRequestPresenceCheck={adminLike} />
    </div>
  );
}
