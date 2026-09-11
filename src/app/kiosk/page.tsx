import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { KioskClient } from "./kiosk-client";

export const metadata: Metadata = { title: "Kiosk" };

export default function KioskPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute -bottom-12 -left-10 h-72 w-72 bg-[url('/brand/leaves.svg')] bg-contain bg-no-repeat opacity-20" />
      <div className="pointer-events-none absolute -bottom-20 -right-14 h-80 w-80 rotate-[-14deg] bg-[url('/brand/leaves.svg')] bg-contain bg-no-repeat opacity-16" />

      <section className="card relative z-10 w-full max-w-xl p-7 sm:p-10">
        <div className="mb-8 text-center">
          <BrandLogo href="" className="justify-center" />
          <p className="section-kicker mt-5">Kiosk mode</p>
          <h1 className="mt-2 text-4xl font-black text-[var(--rcg-green-deep)]">Clock in or out</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">Enter your email or short code and your PIN.</p>
        </div>

        <KioskClient />

        <div className="mt-8 border-t border-[var(--rcg-border)] pt-5 text-center">
          <Link href="/login" className="text-sm font-extrabold text-[var(--rcg-green-dark)]">Private-device sign in →</Link>
        </div>
      </section>
    </main>
  );
}
