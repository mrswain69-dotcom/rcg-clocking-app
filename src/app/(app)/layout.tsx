import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MobileNav } from "@/components/mobile-nav";
import { PresenceAutoVerifier } from "@/components/presence-auto-verifier";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireProfile } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, supabase } = await requireProfile();

  const [{ data: openSession }, { data: settings }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id,clock_in_location_status,current_presence_status,current_presence_source,first_on_site_verified_at,last_presence_accuracy_m,last_presence_check_at")
      .eq("profile_id", profile.id)
      .is("clock_out_at", null)
      .order("clock_in_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("site_location_accuracy_limit_m")
      .limit(1)
      .maybeSingle(),
  ]);
  const adminLike = ["owner", "admin", "developer"].includes(profile.role);
  const developerLike = ["owner", "developer"].includes(profile.role);
  const canViewOnSite = adminLike || profile.can_view_currently_on_site;

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <RealtimeRefresh />

      <header className="app-header">
        <div className="shell app-header-inner">
          <BrandLogo compact />

          <nav className="desktop-nav" aria-label="Main navigation">
            <Link className="nav-link" href="/dashboard">Dashboard</Link>
            <Link className="nav-link" href="/history">History</Link>
            {canViewOnSite ? <Link className="nav-link" href="/on-site">On site</Link> : null}
            <Link className="nav-link" href="/account">Account</Link>
            {adminLike ? <Link className="nav-link" href="/admin">Admin</Link> : null}
            {developerLike ? <Link className="nav-link" href="/developer">Developer</Link> : null}
            <span className="role-pill">{profile.role}</span>
            <form action="/auth/signout" method="post">
              <button className="btn btn-secondary !min-h-10 !px-4" type="submit">Sign out</button>
            </form>
          </nav>
        </div>
      </header>

      <main className="shell app-main">
        {openSession ? (
          <PresenceAutoVerifier
            sessionId={openSession.id}
            clockInLocationStatus={openSession.clock_in_location_status}
            currentPresenceStatus={openSession.current_presence_status}
            currentPresenceSource={openSession.current_presence_source}
            firstOnSiteVerifiedAt={openSession.first_on_site_verified_at}
            lastPresenceAccuracyM={openSession.last_presence_accuracy_m}
            lastPresenceCheckAt={openSession.last_presence_check_at}
            accuracyLimitM={settings?.site_location_accuracy_limit_m ?? 100}
          />
        ) : null}
        {children}
      </main>

      <MobileNav
        canViewOnSite={canViewOnSite}
        adminLike={adminLike}
        developerLike={developerLike}
      />
    </div>
  );
}
