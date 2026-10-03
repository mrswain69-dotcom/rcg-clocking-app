"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  clockIn,
  clockOut,
  recordSessionLocation,
  type BrowserLocation,
} from "./actions";

type Props = {
  isIn: boolean;
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

export function ClockControls({ isIn }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClockIn() {
    setBusy("in");
    setError(null);

    try {
      const location = await getCurrentLocation();
      await clockIn(location);
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
      const result = await clockOut();
      setMessage("Clock-out saved. Checking departure location…");
      router.refresh();
      if (result) {
        try {
          const location = await getCurrentLocation();
          const evidence = await recordSessionLocation(
            result.sessionId,
            "clock_out",
            location,
          );
          setMessage(
            evidence.verified_at
              ? "Clock-out saved · off-site departure verified."
              : "Clock-out saved · departure verification pending while the app is active, for up to 15 minutes.",
          );
        } catch {
          setMessage(
            "Clock-out saved. Location verification is currently unavailable.",
          );
        }
        router.refresh();
      }
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

      {message ? (
        <p className="text-sm font-bold" role="status">
          {message}
        </p>
      ) : null}
      {error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
