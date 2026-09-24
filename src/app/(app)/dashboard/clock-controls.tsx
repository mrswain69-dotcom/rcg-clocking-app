"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clockIn,
  clockOut,
  verifyOnSite,
  type BrowserLocation,
} from "./actions";

type Props = {
  isIn: boolean;
  openSessionId?: string | null;
  clockInLocationStatus?: string | null;
  firstOnSiteVerifiedAt?: string | null;
};

function getCurrentLocation(): Promise<BrowserLocation | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 8000,
      },
    );
  });
}

function needsArrivalVerification(status?: string | null, verifiedAt?: string | null) {
  if (verifiedAt) return false;
  return ["outside_site", "near_boundary", "location_uncertain"].includes(status ?? "");
}

export function ClockControls({
  isIn,
  openSessionId,
  clockInLocationStatus,
  firstOnSiteVerifiedAt,
}: Props) {
  const router = useRouter();
  const watchId = useRef<number | null>(null);
  const checking = useRef(false);
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopWatching = useCallback(() => {
    if (watchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const startWatching = useCallback((sessionId: string) => {
    if (!navigator.geolocation || watchId.current !== null) return;

    watchId.current = navigator.geolocation.watchPosition(
      async (position) => {
        if (checking.current) return;
        checking.current = true;

        try {
          const result = await verifyOnSite(sessionId, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : null,
          });

          if (result.verifiedAt) {
            stopWatching();
            router.refresh();
          }
        } catch {
          // Presence verification is deliberately silent for the user.
          // Admins see the latest reliable verification state instead.
        } finally {
          checking.current = false;
        }
      },
      () => {
        // Keep normal clocking working even if location becomes unavailable.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 15000,
      },
    );
  }, [router, stopWatching]);

  useEffect(() => {
    if (
      isIn
      && openSessionId
      && needsArrivalVerification(clockInLocationStatus, firstOnSiteVerifiedAt)
    ) {
      startWatching(openSessionId);
    } else {
      stopWatching();
    }

    return stopWatching;
  }, [
    clockInLocationStatus,
    firstOnSiteVerifiedAt,
    isIn,
    openSessionId,
    startWatching,
    stopWatching,
  ]);

  async function handleClockIn() {
    setBusy("in");
    setError(null);

    try {
      const location = await getCurrentLocation();
      const result = await clockIn(location);

      if (needsArrivalVerification(result.locationStatus, result.firstOnSiteVerifiedAt)) {
        startWatching(result.sessionId);
      }

      router.refresh();
    } catch {
      setError("Unable to clock in. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleClockOut() {
    setBusy("out");
    setError(null);

    try {
      stopWatching();
      await clockOut();
      router.refresh();
    } catch {
      setError("Unable to clock out. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="clock-actions">
      <button
        className="clock-btn clock-in"
        type="button"
        disabled={isIn || busy !== null}
        onClick={() => void handleClockIn()}
      >
        <span>{busy === "in" ? "Checking…" : "→ Clock In"}</span>
        <small>I&apos;m on site now</small>
      </button>

      <button
        className="clock-btn clock-out"
        type="button"
        disabled={!isIn || busy !== null}
        onClick={() => void handleClockOut()}
      >
        <span>{busy === "out" ? "Clocking out…" : "↪ Clock Out"}</span>
        <small>I&apos;m leaving site</small>
      </button>

      {error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
