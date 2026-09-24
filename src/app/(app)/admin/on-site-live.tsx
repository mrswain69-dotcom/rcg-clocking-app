"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type OnSiteRow = {
  session_id: string;
  profile_id: string;
  full_name: string;
  role: string;
  clock_in_at: string;
  duration_minutes: number;
  clock_in_location_status: string;
  clock_in_distance_m: number | null;
  clock_in_accuracy_m: number | null;
  first_on_site_verified_at: string | null;
  first_on_site_verification_method: string | null;
  last_presence_check_at: string | null;
  last_presence_distance_m: number | null;
  last_presence_accuracy_m: number | null;
  presence_state: "verified_on_site" | "outside_site" | "unverified";
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function formatDistance(metres: number | null) {
  if (metres === null) return null;
  if (metres >= 1000) return `${(metres / 1000).toFixed(metres >= 10000 ? 0 : 1)} km`;
  return `${metres} m`;
}

function minutesBetween(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function verificationCopy(row: OnSiteRow) {
  if (row.clock_in_location_status === "kiosk_verified") {
    return { label: "Verified on site", detail: "Kiosk clock-in", tone: "ok" as const };
  }

  if (row.first_on_site_verified_at) {
    const delay = minutesBetween(row.clock_in_at, row.first_on_site_verified_at);
    const initialDistance = formatDistance(row.clock_in_distance_m);
    return {
      label: "Verified on site",
      detail: initialDistance
        ? `Clocked in ${initialDistance} outside site · first verified ${delay} min later`
        : `First verified on site ${delay} min after clock-in`,
      tone: "ok" as const,
    };
  }

  if (row.clock_in_location_status === "outside_site") {
    const distance = formatDistance(row.clock_in_distance_m);
    const accuracy = row.clock_in_accuracy_m === null ? null : `±${row.clock_in_accuracy_m} m accuracy`;
    return {
      label: "Clocked in outside site",
      detail: [distance ? `${distance} from site boundary` : null, accuracy].filter(Boolean).join(" · "),
      tone: "warn" as const,
    };
  }

  if (row.clock_in_location_status === "near_boundary") {
    return {
      label: "Near site boundary",
      detail: [
        formatDistance(row.clock_in_distance_m),
        row.clock_in_accuracy_m === null ? null : `±${row.clock_in_accuracy_m} m accuracy`,
      ].filter(Boolean).join(" · "),
      tone: "neutral" as const,
    };
  }

  if (row.clock_in_location_status === "location_uncertain") {
    return {
      label: "Location uncertain",
      detail: row.clock_in_accuracy_m === null ? "GPS accuracy unavailable" : `GPS accuracy ±${row.clock_in_accuracy_m} m`,
      tone: "neutral" as const,
    };
  }

  return {
    label: "Location unverified",
    detail: "No reliable clock-in location was available",
    tone: "neutral" as const,
  };
}

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

  const verifiedCount = useMemo(
    () => rows.filter((row) => row.presence_state === "verified_on_site").length,
    [rows],
  );
  const exceptionCount = rows.length - verifiedCount;

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-kicker">Live presence</p>
          <h2 className="text-2xl font-black">
            {verifiedCount} {verifiedCount === 1 ? "person" : "people"} verified on site
          </h2>
          <p className="mt-1 text-sm text-[var(--rcg-muted)]">
            {rows.length} currently clocked in
            {exceptionCount ? ` · ${exceptionCount} need${exceptionCount === 1 ? "s" : ""} location review` : ""}
          </p>
        </div>
        <div className="rounded-full bg-[var(--rcg-green-soft)] px-5 py-3 text-3xl font-black text-[var(--rcg-green-dark)]">
          {verifiedCount}
        </div>
      </div>

      {rows.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const verification = verificationCopy(row);
            const badgeClass =
              verification.tone === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : verification.tone === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-slate-50 text-slate-700";

            return (
              <article className="rounded-2xl border border-[var(--rcg-border)] bg-white p-5 shadow-sm" key={row.session_id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`status-dot ${row.presence_state === "verified_on_site" ? "active" : ""}`} />
                      <strong className="text-lg">{row.full_name}</strong>
                    </div>
                    <span className="badge">{row.role}</span>
                  </div>
                  <span className="text-2xl" aria-hidden="true">
                    {row.presence_state === "verified_on_site" ? "🌿" : "⚠"}
                  </span>
                </div>

                <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${badgeClass}`}>
                  <div className="font-extrabold">{verification.label}</div>
                  {verification.detail ? <div className="mt-1">{verification.detail}</div> : null}
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[var(--rcg-muted)]">Clocked in</dt>
                    <dd className="mt-1 font-extrabold">{formatTime(row.clock_in_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--rcg-muted)]">Clocked duration</dt>
                    <dd className="mt-1 font-extrabold">
                      {Math.floor(row.duration_minutes / 60)}h {row.duration_minutes % 60}m
                    </dd>
                  </div>
                  {row.first_on_site_verified_at ? (
                    <div className="col-span-2">
                      <dt className="text-[var(--rcg-muted)]">First verified on site</dt>
                      <dd className="mt-1 font-extrabold">
                        {formatTime(row.first_on_site_verified_at)}
                        {row.first_on_site_verification_method ? ` · ${row.first_on_site_verification_method.toUpperCase()}` : ""}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <img src="/brand/staff-fox.svg" alt="" />
          <h3>Everyone has clocked out</h3>
          <p>No one is currently recorded as clocked in.</p>
        </div>
      )}
    </section>
  );
}
