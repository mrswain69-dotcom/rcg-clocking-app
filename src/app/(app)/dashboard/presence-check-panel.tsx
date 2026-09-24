"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  respondPresenceCheckClockOut,
  respondPresenceCheckLocation,
  respondPresenceCheckUserConfirmedOnSite,
  respondPresenceCheckWorkingOffSite,
  type BrowserLocation,
} from "./actions";

export type PresenceCheckRequest = {
  id: string;
  status: string;
  requested_at: string;
  request_source: string;
};

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function getCurrentLocation(): Promise<BrowserLocation | null> {
  if (!navigator.geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      }),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10_000,
      },
    );
  });
}

export function PresenceCheckPanel({ request }: { request: PresenceCheckRequest }) {
  const router = useRouter();
  const attempted = useRef(false);
  const [status, setStatus] = useState(request.status);
  const [checking, setChecking] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showClockOut, setShowClockOut] = useState(false);
  const [leftAt, setLeftAt] = useState(localDateTimeValue);
  const [error, setError] = useState<string | null>(null);

  async function checkLocation() {
    setChecking(true);
    setError(null);

    try {
      const location = await getCurrentLocation();
      const result = await respondPresenceCheckLocation(request.id, location);
      setStatus(result.status);
      router.refresh();
    } catch {
      setError("We couldn't complete the location check. You can still update your status below.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (request.status !== "pending" || attempted.current) return;
    attempted.current = true;
    void checkLocation();
    // Deliberately only auto-run once for this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, request.status]);

  async function clockOutAtTime() {
    if (!leftAt) return;
    setBusyAction("clockout");
    setError(null);

    try {
      await respondPresenceCheckClockOut(request.id, new Date(leftAt).toISOString());
      router.refresh();
    } catch {
      setError("That clock-out time could not be saved. Check the time and try again.");
    } finally {
      setBusyAction(null);
    }
  }

  async function workingOffSite() {
    setBusyAction("offsite");
    setError(null);

    try {
      await respondPresenceCheckWorkingOffSite(request.id);
      router.refresh();
    } catch {
      setError("Your off-site status could not be saved.");
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmOnSite() {
    setBusyAction("onsite");
    setError(null);

    try {
      await respondPresenceCheckUserConfirmedOnSite(request.id);
      router.refresh();
    } catch {
      setError("Your site status could not be confirmed.");
    } finally {
      setBusyAction(null);
    }
  }

  const offSiteDetected = status === "outside_site";
  const locationUnavailable = status === "location_unavailable";
  const pending = status === "pending";

  return (
    <section className="card overflow-hidden border-2 border-amber-300 bg-amber-50 p-5 sm:p-6" aria-live="polite">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-2xl" aria-hidden="true">
          {checking ? "⌖" : offSiteDetected ? "↗" : "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="section-kicker">RCG presence check</p>
          <h2 className="mt-1 text-2xl font-black text-[var(--rcg-green-deep)]">
            {checking
              ? "Checking whether you're still at RCG…"
              : offSiteDetected
                ? "It looks like you've left RCG"
                : locationUnavailable
                  ? "We couldn't verify your location"
                  : "Are you still at RCG?"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--rcg-muted)]">
            {offSiteDetected
              ? "Management is told only that you appear to be off site. If you forgot to clock out, enter the time you actually left."
              : locationUnavailable
                ? "You can try the location check again, confirm that you're still on site, or correct your clocking record."
                : "This safety check was sent because you're still recorded as being on site. Your exact location is not shared with management."}
          </p>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {(pending || locationUnavailable || offSiteDetected) ? (
          <button className="btn btn-secondary" type="button" onClick={() => void checkLocation()} disabled={checking || busyAction !== null}>
            {checking ? "Checking…" : "Check my location now"}
          </button>
        ) : null}

        {(locationUnavailable || offSiteDetected) ? (
          <button className="btn btn-soft" type="button" onClick={() => void confirmOnSite()} disabled={busyAction !== null || checking}>
            {busyAction === "onsite" ? "Saving…" : "I'm still at RCG"}
          </button>
        ) : null}

        <button className="btn btn-soft" type="button" onClick={() => setShowClockOut((value) => !value)} disabled={busyAction !== null || checking}>
          I already left — clock me out
        </button>

        <button className="btn btn-soft" type="button" onClick={() => void workingOffSite()} disabled={busyAction !== null || checking}>
          {busyAction === "offsite" ? "Saving…" : "I've left RCG but I'm still working"}
        </button>
      </div>

      {showClockOut ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-white p-4">
          <label className="mb-1 block text-sm font-extrabold" htmlFor="actual-left-time">
            What time did you actually leave / finish?
          </label>
          <p className="mb-3 text-xs text-[var(--rcg-muted)]">
            This will replace the end time for this open clocking session.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input
              className="input flex-1"
              id="actual-left-time"
              type="datetime-local"
              value={leftAt}
              onChange={(event) => setLeftAt(event.target.value)}
              max={localDateTimeValue()}
              required
            />
            <button className="btn btn-primary" type="button" onClick={() => void clockOutAtTime()} disabled={!leftAt || busyAction !== null}>
              {busyAction === "clockout" ? "Saving…" : "Clock out at this time"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
