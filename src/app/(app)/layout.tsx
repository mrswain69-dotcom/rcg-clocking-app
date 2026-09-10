import Link from "next/link";
import { requireProfile } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  const adminLike = ["owner", "admin", "developer"].includes(profile.role);

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--rcg-border)] bg-white/85 backdrop-blur">
        <div className="shell flex min-h-18 items-center justify-between gap-4 py-3">
          <Link href="/dashboard" className="font-black tracking-tight">
            <span className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--rcg-orange)] text-sm text-white">RCG</span>
            Clocking
          </Link>

          <nav className="flex flex-wrap items-center justify-end gap-2 text-sm font-bold">
            <Link className="rounded-xl px-3 py-2 hover:bg-black/5" href="/dashboard">Dashboard</Link>
            <Link className="rounded-xl px-3 py-2 hover:bg-black/5" href="/history">History</Link>
            <Link className="rounded-xl px-3 py-2 hover:bg-black/5" href="/account">Account</Link>
            {adminLike ? <Link className="rounded-xl px-3 py-2 hover:bg-black/5" href="/admin">Admin</Link> : null}
            <span className="badge hidden sm:inline-flex">{profile.role}</span>
            <form action="/auth/signout" method="post"><button className="btn btn-secondary !min-h-9 !px-3" type="submit">Sign out</button></form>
          </nav>
        </div>
      </header>
      <main className="shell py-7 sm:py-10">{children}</main>
    </div>
  );
}
