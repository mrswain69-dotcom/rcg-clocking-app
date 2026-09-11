import Link from "next/link";
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
      <header className="border-b border-[var(--rcg-border)] bg-[#fffefb]/95 backdrop-blur">
        <div className="shell flex min-h-20 flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center">
          <Link href="/dashboard" className="brand-lockup" aria-label="Redcatch Community Garden clocking dashboard">
            <img className="brand-fox" src="/icon.svg" alt="Redcatch fox wearing a green staff shirt" />
            <span>
              <span className="brand-name block">Redcatch<br />Community Garden</span>
              <span className="brand-subtitle block">Clocking app</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-1 text-sm font-extrabold sm:justify-end">
            <Link className="rounded-xl px-3 py-2 hover:bg-[var(--rcg-green-soft)] hover:text-[var(--rcg-green-dark)]" href="/dashboard">Dashboard</Link>
            <Link className="rounded-xl px-3 py-2 hover:bg-[var(--rcg-green-soft)] hover:text-[var(--rcg-green-dark)]" href="/history">History</Link>
            {canViewOnSite ? <Link className="rounded-xl px-3 py-2 hover:bg-[var(--rcg-green-soft)] hover:text-[var(--rcg-green-dark)]" href="/on-site">On site</Link> : null}
            <Link className="rounded-xl px-3 py-2 hover:bg-[var(--rcg-green-soft)] hover:text-[var(--rcg-green-dark)]" href="/account">Account</Link>
            {adminLike ? <Link className="rounded-xl px-3 py-2 hover:bg-[var(--rcg-green-soft)] hover:text-[var(--rcg-green-dark)]" href="/admin">Admin</Link> : null}
            {developerLike ? <Link className="rounded-xl px-3 py-2 hover:bg-[var(--rcg-green-soft)] hover:text-[var(--rcg-green-dark)]" href="/developer">Developer</Link> : null}
            <span className="badge hidden md:inline-flex">{profile.role}</span>
            <form action="/auth/signout" method="post"><button className="btn btn-secondary !min-h-9 !px-3" type="submit">Sign out</button></form>
          </nav>
        </div>
      </header>
      <main className="shell py-7 sm:py-10">{children}</main>
    </div>
  );
}
