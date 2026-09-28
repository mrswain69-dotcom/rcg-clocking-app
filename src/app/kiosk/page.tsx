import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { KioskClient } from "./kiosk-client";

export const metadata: Metadata = { title: "RCG Kiosk" };

export default function KioskPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute -bottom-12 -left-10 h-72 w-72 bg-[url('/brand/leaves.svg')] bg-contain bg-no-repeat opacity-20" />
      <div className="pointer-events-none absolute -bottom-20 -right-14 h-80 w-80 rotate-[-14deg] bg-[url('/brand/leaves.svg')] bg-contain bg-no-repeat opacity-16" />

      <section className="card relative z-10 w-full max-w-2xl p-6 sm:p-9">
        <div className="mb-7 text-center">
          <BrandLogo href="" className="justify-center" />
        </div>
        <KioskClient />
      </section>
    </main>
  );
}
