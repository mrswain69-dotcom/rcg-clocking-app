import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MobileNav } from "@/components/mobile-nav";
import { PresenceAutoVerifier } from "@/components/presence-auto-verifier";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireProfile } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, supabase } = await requireProfile();

  const [{ data: openSession }, { data: settings }] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        "id,clock_in_location_status,current_presence_status,current_presence_source,first_on_site_verified_at,last_presence_accuracy_m,last_presence_check_at,clock_out_at,first_off_site_verified_at",
      )
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
  const { data: departureSession } = !openSession
    ? await supabase
        .from("sessions")
        .select(
          "id,clock_out_at,clock_out_method,first_off_site_verified_at,first_on_site_verified_at,last_presence_check_at,current_presence_source",
        )
        .eq("profile_id", profile.id)
        .eq("clock_out_method", "web")
        .is("first_off_site_verified_at", null)
        .gte("clock_out_at", new Date(Date.now() - 15 * 60000).toISOString())
        .order("clock_out_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const trackingSession = openSession ?? departureSession;
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
            <Link className="nav-link" href="/dashboard">
              Dashboard
            </Link>
            <Link className="nav-link" href="/history">
              History
            </Link>
            {profile.role === "owner" ||
            profile.register_account_type !== "standard" ? (
              <Link className="nav-link" href="/registers">
                Registers
              </Link>
            ) : null}
            {canViewOnSite ? (
              <Link className="nav-link" href="/on-site">
                On site
              </Link>
            ) : null}
            <Link className="nav-link" href="/account">
              Account
            </Link>
            {adminLike ? (
              <Link className="nav-link" href="/admin">
                Admin
              </Link>
            ) : null}
            {developerLike ? (
              <Link className="nav-link" href="/developer">
                Developer
              </Link>
            ) : null}
            <span className="role-pill">{profile.role}</span>
            <form action="/auth/signout" method="post">
              <button
                className="btn btn-secondary !min-h-10 !px-4"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="shell app-main">
        {trackingSession ? (
          <PresenceAutoVerifier
            session={trackingSession}
            periodicEnabled={profile.periodic_location_checks}
          />
        ) : null}
        {children}
      </main>

      <MobileNav
        canAccessRegisters={
          profile.role === "owner" ||
          profile.register_account_type !== "standard"
        }
        canViewOnSite={canViewOnSite}
        adminLike={adminLike}
        developerLike={developerLike}
      />
    </div>
  );
}
