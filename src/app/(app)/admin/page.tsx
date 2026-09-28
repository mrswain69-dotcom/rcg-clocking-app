import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/brand/PageHeader";
import { requireAdminProfile } from "@/lib/auth";
import { OnSiteLive } from "./on-site-live";
import { AdminAttendanceControls } from "./admin-attendance-controls";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const { supabase, profile } = await requireAdminProfile();
  const [{ data }, { data: peopleData }] = await Promise.all([
    supabase.from("current_on_site_view").select("*").order("clock_in_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id,full_name,profile_type,is_active,archived_at")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("full_name"),
  ]);
  const current = data ?? [];
  const people = peopleData ?? [];
  const developerLike = ["owner", "developer"].includes(profile.role);

  const tools = [
    { href: "/admin/users", icon: "👥", title: "Users", copy: "Create accounts, manage roles, kiosk access and archive status." },
    { href: "/admin/reports", icon: "▤", title: "Reports", copy: "Review attendance, total hours and export CSV reports." },
    { href: "/admin/alerts", icon: "✉", title: "After-hours safety", copy: "Set closing time, recipients and safety email behaviour." },
    { href: "/admin/audit", icon: "✓", title: "Audit log", copy: "Review sensitive administrative and attendance changes." },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Admin dashboard"
        description="Site safety, people management, reporting and operational controls in one place."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tools.map((tool) => (
          <Link key={tool.href} href={tool.href} className="card group block p-5 no-underline transition hover:-translate-y-1 hover:border-[var(--rcg-green)]/40 hover:shadow-lg">
            <div className="mb-4 text-3xl" aria-hidden="true">{tool.icon}</div>
            <h2 className="text-xl font-black text-[var(--rcg-green-dark)]">{tool.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--rcg-muted)]">{tool.copy}</p>
            <p className="mt-4 font-extrabold text-[var(--rcg-green-dark)]">Open →</p>
          </Link>
        ))}
      </section>

      {developerLike ? (
        <Link href="/developer" className="decorative-panel block no-underline">
          <div className="decorative-panel-icon">🛠</div>
          <h2>Developer diagnostics</h2>
          <p className="decorative-panel-copy">System health, configuration, audit activity and kiosk events for maintenance and support.</p>
          <span className="botanical-corner" aria-hidden="true" />
        </Link>
      ) : null}

      <AdminAttendanceControls
        people={people}
        openSessions={current.map((row) => ({
          session_id: row.session_id,
          profile_id: row.profile_id,
          full_name: row.full_name,
          clock_in_at: row.clock_in_at,
          profile_type: row.profile_type,
        }))}
      />

      <OnSiteLive initialRows={current} canRequestPresenceCheck />
    </div>
  );
}
