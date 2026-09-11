import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand/BrandLogo";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -bottom-16 -left-12 h-80 w-80 bg-[url('/brand/leaves.svg')] bg-contain bg-no-repeat opacity-20" />
      <section className="card relative z-10 max-w-lg p-7 text-center sm:p-9">
        <BrandLogo href="" className="justify-center" />
        <div className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--rcg-orange-soft)] text-3xl">⌁</div>
        <h1 className="mt-5 text-3xl font-black text-[var(--rcg-green-deep)]">You are offline</h1>
        <p className="mt-3 text-[var(--rcg-muted)]">Clocking actions need a connection so the database remains the source of truth. Reconnect to the internet, then try again.</p>
      </section>
    </main>
  );
}
