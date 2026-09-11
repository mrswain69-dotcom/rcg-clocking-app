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

      <main className="shell app-main">{children}</main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <Link href="/dashboard"><span className="mobile-nav-icon">⌂</span><span>Home</span></Link>
        <Link href="/history"><span className="mobile-nav-icon">▤</span><span>History</span></Link>
        {canViewOnSite ? (
          <Link href="/on-site"><span className="mobile-nav-icon">⌖</span><span>On Site</span></Link>
        ) : (
          <Link href="/account"><span className="mobile-nav-icon">◎</span><span>Account</span></Link>
        )}

        <details className="mobile-more">
          <summary><span className="mobile-nav-icon">•••</span><span>More</span></summary>
          <div className="mobile-more-menu">
            {canViewOnSite ? <Link href="/account">◎ <span>Account</span></Link> : null}
            {adminLike ? (
              <>
                <div className="mobile-more-heading">Admin</div>
                <Link href="/admin">⚙ <span>Admin dashboard</span></Link>
                <Link href="/admin/users">♟ <span>Users</span></Link>
                <Link href="/admin/reports">▤ <span>Reports</span></Link>
                <Link href="/admin/alerts">⚠ <span>After-hours safety</span></Link>
                <Link href="/admin/audit">≡ <span>Audit log</span></Link>
              </>
            ) : null}
            {developerLike ? (
              <>
                <div className="mobile-more-heading">Technical</div>
                <Link href="/developer">⌘ <span>Developer diagnostics</span></Link>
              </>
            ) : null}
          </div>
        </details>
      </nav>
    </div>
  );
}
