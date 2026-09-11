import type { Metadata } from "next";
import Link from "next/link";
import { KioskClient } from "./kiosk-client";

export const metadata: Metadata = { title: "Kiosk" };

export default function KioskPage() {
  return (
    <main className="shell flex min-h-screen items-center justify-center py-8">
      <section className="card w-full max-w-xl p-7 sm:p-10">
        <div className="mb-8 text-center">
          <img className="mx-auto h-24 w-28 object-contain" src="/icon.svg" alt="Redcatch fox wearing a green staff shirt" />
          <div className="brand-name mt-1 text-xl">Redcatch Community Garden</div>
          <p className="section-kicker mt-3">Kiosk mode</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--rcg-green-dark)]">Clock in or out</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">Enter your email or short code and PIN.</p>
        </div>

        <KioskClient />

        <div className="mt-8 text-center">
          <Link href="/login" className="text-sm font-extrabold text-[var(--rcg-green)]">Private-device sign in</Link>
        </div>
      </section>
    </main>
  );
}
