import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="shell flex min-h-screen items-center justify-center py-10">
      <section className="card max-w-lg p-7 text-center sm:p-9">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--rcg-orange)] text-xl font-black text-white">RCG</div>
        <h1 className="text-3xl font-black">You are offline</h1>
        <p className="mt-3 text-[var(--rcg-muted)]">
          Clocking actions need a connection so the database remains the source of truth. Reconnect to the internet, then try again.
        </p>
      </section>
    </main>
  );
}
