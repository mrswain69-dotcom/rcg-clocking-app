import type { Metadata } from "next";
import Link from "next/link";
import { KioskClient } from "./kiosk-client";

export const metadata: Metadata = { title: "Kiosk" };

export default function KioskPage() {
  return (
    <main className="shell flex min-h-screen items-center justify-center py-8">
      <section className="card w-full max-w-xl p-7 sm:p-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--rcg-orange)] text-xl font-black text-white">RCG</div>
          <h1 className="text-3xl font-black">Clock in or out</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">Redcatch Community Garden</p>
        </div>

        <KioskClient />

        <div className="mt-8 text-center">
          <Link href="/login" className="text-sm font-bold text-[var(--rcg-green)]">Private-device sign in</Link>
        </div>
      </section>
    </main>
  );
}
