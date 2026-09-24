"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { requestPresenceCheck } from "./presence-actions";

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
  current_presence_status: "on_site" | "off_site" | "unverified";
  current_presence_status_at: string | null;
  current_presence_source: string | null;
  presence_state: "verified_on_site" | "outside_site" | "unverified";
  latest_presence_check_id: string | null;
  latest_presence_check_status: string | null;
  latest_presence_check_requested_at: string | null;
  latest_presence_check_escalated_at: string | null;
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

function presenceCopy(row: OnSiteRow) {
  if (row.current_presence_status === "on_site") {
    if (row.current_presence_source === "user_confirmation") {
      return {
        label: "User confirmed on site",
        detail: "User confirmation · GPS was not used for this confirmation",
        tone: "neutral" as const,
      };
    }

    if (row.current_presence_source === "kiosk" || row.clock_in_location_status === "kiosk_verified") {
      return {
        label: "Verified on site",
        detail: "Kiosk verification",
        tone: "ok" as const,
      };
    }

    if (row.first_on_site_verified_at) {
      const delay = minutesBetween(row.clock_in_at, row.first_on_site_verified_at);
      const initialDistance = formatDistance(row.clock_in_distance_m);
      return {
        label: "Verified on site",
        detail: initialDistance && row.clock_in_distance_m
          ? `Clocked in ${initialDistance} outside site · first verified ${delay} min later`
          : row.last_presence_check_at
            ? `GPS presence confirmed at ${formatTime(row.last_presence_check_at)}`
            : "GPS verified",
        tone: "ok" as const,
      };
    }

    return { label: "Recorded on site", detail: "Current site status is on site", tone: "ok" as const };
  }

  if (row.current_presence_status === "off_site") {
    if (row.current_presence_source === "presence_check_gps") {
      return {
        label: "Presence check: off site",
        detail: "The check confirmed the device is not at RCG. Exact location is not shared.",
        tone: "warn" as const,
      };
    }

    if (row.current_presence_source === "user_working_off_site") {
      return {
        label: "Working off site",
        detail: "User confirmed they have left RCG but are still working.",
        tone: "neutral" as const,
      };
    }

    const initialDistance = formatDistance(row.clock_in_distance_m);
    return {
      label: "Currently recorded off site",
      detail: initialDistance && row.clock_in_location_status === "outside_site"
        ? `Clock-in was ${initialDistance} outside the site boundary`
        : "Open work session, but not currently counted as physically on site.",
      tone: "warn" as const,
    };
  }

  if (row.clock_in_location_status === "near_boundary") {
    return {
      label: "Presence unverified",
      detail: "Clock-in was close to the site boundary and GPS was inconclusive.",
      tone: "neutral" as const,
    };
  }

  if (row.clock_in_location_status === "location_uncertain") {
    return {
      label: "Presence unverified",
      detail: row.clock_in_accuracy_m === null ? "GPS accuracy unavailable" : `Clock-in GPS accuracy ±${row.clock_in_accuracy_m} m`,
      tone: "neutral" as const,
    };
  }

  return {
    label: "Presence unverified",
    detail: "No reliable current site confirmation is available.",
    tone: "neutral" as const,
  };
}

function checkCopy(row: OnSiteRow) {
  const status = row.latest_presence_check_status;
  if (!status || !row.latest_presence_check_requested_at) return null;

  if (status === "pending") {
    return {
      label: "Presence check awaiting response",
      detail: `Requested at ${formatTime(row.latest_presence_check_requested_at)}${row.latest_presence_check_escalated_at ? " · escalated to management" : ""}`,
    };
  }

  if (status === "location_unavailable") {
    return {
      label: "Presence check unresolved",
      detail: `Location could not be verified · requested at ${formatTime(row.latest_presence_check_requested_at)}`,
    };
  }

  if (status === "outside_site") {
    return {
      label: "Latest check returned off site",
      detail: "No exact location was shared.",
    };
  }

  if (status === "user_confirmed_on_site") {
    return {
      label: "Latest check: user confirmed on site",
      detail: "This was a user confirmation rather than GPS verification.",
    };
  }

  return null;
}

export function OnSiteLive({
  initialRows,
  canRequestPresenceCheck = false,
}: {
  initialRows: OnSiteRow[];
  canRequestPresenceCheck?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);

  useEffect(() => {
    const supabase = createClient();

    async function refresh() {
      const { data } = await supabase.from("current_on_site_view").select("*").order("clock_in_at");
      if (data) setRows(data as OnSiteRow[]);
    }

    const channel = supabase
      .channel("rcg-live-presence")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "presence_check_requests" }, () => void refresh())
      .subscribe();

    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  const verifiedCount = useMemo(
    () => rows.filter((row) => row.current_presence_status === "on_site").length,
    [rows],
  );
  const offSiteCount = useMemo(
    () => rows.filter((row) => row.current_presence_status === "off_site").length,
    [rows],
  );
  const unresolvedCount = useMemo(
    () => rows.filter((row) =>
      row.current_presence_status === "unverified"
      || row.latest_presence_check_status === "pending"
      || row.latest_presence_check_status === "location_unavailable"
    ).length,
    [rows],
  );

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-kicker">Live presence</p>
          <h2 className="text-2xl font-black">
            {verifiedCount} {verifiedCount === 1 ? "person" : "people"} currently recorded on site
          </h2>
          <p className="mt-1 text-sm text-[var(--rcg-muted)]">
            {rows.length} clocked in
            {offSiteCount ? ` · ${offSiteCount} off site` : ""}
            {unresolvedCount ? ` · ${unresolvedCount} unresolved` : ""}
          </p>
        </div>
        <div className="rounded-full bg-[var(--rcg-green-soft)] px-5 py-3 text-3xl font-black text-[var(--rcg-green-dark)]">
          {verifiedCount}
        </div>
      </div>

      {rows.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const presence = presenceCopy(row);
            const check = checkCopy(row);
            const badgeClass =
              presence.tone === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : presence.tone === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-slate-50 text-slate-700";
            const checkPending = ["pending", "location_unavailable"].includes(row.latest_presence_check_status ?? "");

            return (
              <article className="rounded-2xl border border-[var(--rcg-border)] bg-white p-5 shadow-sm" key={row.session_id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`status-dot ${row.current_presence_status === "on_site" ? "active" : ""}`} />
                      <strong className="text-lg">{row.full_name}</strong>
                    </div>
                    <span className="badge">{row.role}</span>
                  </div>
                  <span className="text-2xl" aria-hidden="true">
                    {row.current_presence_status === "on_site" ? "🌿" : row.current_presence_status === "off_site" ? "↗" : "?"}
                  </span>
                </div>

                <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${badgeClass}`}>
                  <div className="font-extrabold">{presence.label}</div>
                  {presence.detail ? <div className="mt-1">{presence.detail}</div> : null}
                </div>

                {check ? (
                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                    <div className="font-extrabold">{check.label}</div>
                    <div className="mt-1">{check.detail}</div>
                  </div>
                ) : null}

                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[var(--rcg-muted)]">Clocked in</dt>
                    <dd className="mt-1 font-extrabold">{formatTime(row.clock_in_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--rcg-muted)]">Work duration</dt>
                    <dd className="mt-1 font-extrabold">
                      {Math.floor(row.duration_minutes / 60)}h {row.duration_minutes % 60}m
                    </dd>
                  </div>
                  {row.current_presence_status_at ? (
                    <div className="col-span-2">
                      <dt className="text-[var(--rcg-muted)]">Current presence last updated</dt>
                      <dd className="mt-1 font-extrabold">{formatTime(row.current_presence_status_at)}</dd>
                    </div>
                  ) : null}
                </dl>

                {canRequestPresenceCheck ? (
                  <form action={requestPresenceCheck} className="mt-5">
                    <input type="hidden" name="sessionId" value={row.session_id} />
                    <button className="btn btn-secondary w-full" type="submit">
                      {checkPending ? "Send presence check again" : "Request presence check"}
                    </button>
                  </form>
                ) : null}
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
