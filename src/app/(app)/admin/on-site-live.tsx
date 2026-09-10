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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => void refresh(),
      )
      .subscribe();

    const timer = window.setInterval(refresh, 60_000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black">Currently on site</h2>
          <p className="text-sm text-[var(--rcg-muted)]">Updates automatically when sessions change.</p>
        </div>
        <div className="rounded-2xl bg-[#edf3ee] px-4 py-2 text-2xl font-black text-[var(--rcg-green)]">
          {rows.length}
        </div>
      </div>

      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Clocked in</th><th>On site</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.session_id}>
                  <td className="font-bold">{row.full_name}</td>
                  <td><span className="badge">{row.role}</span></td>
                  <td>{new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: "Europe/London" }).format(new Date(row.clock_in_at))}</td>
                  <td>{Math.floor(row.duration_minutes / 60)}h {row.duration_minutes % 60}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl bg-[#f5f5f0] p-5 text-[var(--rcg-muted)]">Nobody is currently clocked in.</p>
      )}
    </section>
  );
}
