"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type OnSiteRow = {
  session_id: string;
  profile_id: string;
  full_name: string;
  role: string;
  clock_in_at: string;
  duration_minutes: number;
};

export function OnSiteLive({ initialRows }: { initialRows: OnSiteRow[] }) {
  const [rows, setRows] = useState(initialRows);

  useEffect(() => {
    const supabase = createClient();

    async function refresh() {
      const { data } = await supabase.from("current_on_site_view").select("*").order("clock_in_at");
      if (data) setRows(data as OnSiteRow[]);
    }

    const channel = supabase
      .channel("rcg-live-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => void refresh())
      .subscribe();

    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-kicker">Live presence</p>
          <h2 className="text-2xl font-black">{rows.length} {rows.length === 1 ? "person" : "people"} on site</h2>
          <p className="mt-1 text-sm text-[var(--rcg-muted)]">Updates automatically when a clocking session changes.</p>
        </div>
        <div className="rounded-full bg-[var(--rcg-green-soft)] px-5 py-3 text-3xl font-black text-[var(--rcg-green-dark)]">{rows.length}</div>
      </div>

      {rows.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article className="rounded-2xl border border-[var(--rcg-border)] bg-white p-5 shadow-sm" key={row.session_id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2"><span className="status-dot active" /><strong className="text-lg">{row.full_name}</strong></div>
                  <span className="badge">{row.role}</span>
                </div>
                <span className="text-2xl" aria-hidden="true">🌿</span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-[var(--rcg-muted)]">Clocked in</dt><dd className="mt-1 font-extrabold">{new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: "Europe/London" }).format(new Date(row.clock_in_at))}</dd></div>
                <div><dt className="text-[var(--rcg-muted)]">On site</dt><dd className="mt-1 font-extrabold">{Math.floor(row.duration_minutes / 60)}h {row.duration_minutes % 60}m</dd></div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <img src="/brand/staff-fox.svg" alt="" />
          <h3>Everyone has clocked out</h3>
          <p>No one is currently recorded as being on site.</p>
        </div>
      )}
    </section>
  );
}
