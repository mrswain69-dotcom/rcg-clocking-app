import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireProfile } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  const adminLike = ["owner", "admin", "developer"].includes(profile.role);
  const developerLike = ["owner", "developer"].includes(profile.role);
  const canViewOnSite = adminLike || profile.can_view_currently_on_site;

  return (
    <div className="min-h-screen">
      <RealtimeRefresh />
      <header className="app-header">
        <div className="shell app-header-inner">
          <BrandLogo />

          <nav className="desktop-nav" aria-label="Main navigation">
            <Link className="nav-link" href="/dashboard">Dashboard</Link>
            <Link className="nav-link" href="/history">History</Link>
            {canViewOnSite ? <Link className="nav-link" href="/on-site">On site</Link> : null}
            <Link className="nav-link" href="/account">Account</Link>
            {adminLike ? <Link className="nav-link" href="/admin">Admin</Link> : null}
            {developerLike ? <Link className="nav-link" href="/developer">Developer</Link> : null}
            <span className="role-pill">{profile.role}</span>
            <form action="/auth/signout" method="post">
              <button className="btn btn-secondary !min-h-10 !px-3" type="submit">Sign out</button>
            </form>
          </nav>
        </div>
      </header>

      <main className="shell app-main">{children}</main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <Link href="/dashboard"><span className="mobile-nav-icon">⌂</span><span>Home</span></Link>
        <Link href="/history"><span className="mobile-nav-icon">▤</span><span>History</span></Link>
        {canViewOnSite ? (
          <Link href="/on-site"><span className="mobile-nav-icon">◎</span><span>On Site</span></Link>
        ) : (
          <Link href="/account"><span className="mobile-nav-icon">○</span><span>Account</span></Link>
        )}
        <Link href={adminLike ? "/admin" : "/account"}><span className="mobile-nav-icon">•••</span><span>More</span></Link>
      </nav>
    </div>
  );
}
