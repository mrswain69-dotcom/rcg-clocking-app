"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyOnSite, type BrowserLocation } from "@/app/(app)/dashboard/actions";

type Props = {
  sessionId: string;
  clockInLocationStatus: string | null;
  currentPresenceStatus: string | null;
  currentPresenceSource: string | null;
  firstOnSiteVerifiedAt: string | null;
  lastPresenceAccuracyM: number | null;
  lastPresenceCheckAt: string | null;
  accuracyLimitM: number;
};

function formatAccuracy(value: number) {
  if (value >= 1000) return `±${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} km`;
  return `±${Math.round(value)} m`;
}

function getCurrentLocation(): Promise<BrowserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation unavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null,
      }),
      reject,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      },
    );
  });
}

export function PresenceAutoVerifier({
  sessionId,
  clockInLocationStatus,
  currentPresenceStatus,
  currentPresenceSource,
  firstOnSiteVerifiedAt,
  lastPresenceAccuracyM,
  lastPresenceCheckAt,
  accuracyLimitM,
}: Props) {
  const router = useRouter();
  const watchId = useRef<number | null>(null);
  const submitting = useRef(false);
  const lastSubmittedAt = useRef(0);
  const [latestAccuracy, setLatestAccuracy] = useState<number | null>(lastPresenceAccuracyM);
  const [latestStatus, setLatestStatus] = useState<string | null>(clockInLocationStatus);
  const [retrying, setRetrying] = useState(false);
  const [permissionProblem, setPermissionProblem] = useState(
    clockInLocationStatus === "location_unavailable" && !lastPresenceCheckAt,
  );

  const shouldTrack =
    !firstOnSiteVerifiedAt
    && currentPresenceStatus !== "on_site"
    && currentPresenceSource !== "user_working_off_site";

  const stopWatching = useCallback(() => {
    if (watchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const submitLocation = useCallback(async (location: BrowserLocation, force = false) => {
    const now = Date.now();
    if (submitting.current) return;
    if (!force && now - lastSubmittedAt.current < 45000) return;

    submitting.current = true;
    lastSubmittedAt.current = now;
    setLatestAccuracy(location.accuracy);
    setPermissionProblem(false);

    try {
      const result = await verifyOnSite(sessionId, location);
      setLatestStatus(result.locationStatus);
      setLatestAccuracy(result.reportedAccuracyM);

      if (result.verifiedAt) {
        stopWatching();
        router.refresh();
      }
    } catch {
      // The clocking session remains valid even if a background verification call fails.
    } finally {
      submitting.current = false;
    }
  }, [router, sessionId, stopWatching]);

  const retryNow = useCallback(async () => {
    setRetrying(true);
    try {
      const location = await getCurrentLocation();
      await submitLocation(location, true);
    } catch {
      setPermissionProblem(true);
      setLatestStatus("location_unavailable");
    } finally {
      setRetrying(false);
    }
  }, [submitLocation]);

  useEffect(() => {
    if (!shouldTrack || !navigator.geolocation) {
      stopWatching();
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        void submitLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        });
      },
      () => {
        setPermissionProblem(true);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    );

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void retryNow();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopWatching();
    };
  }, [retryNow, shouldTrack, stopWatching, submitLocation]);

  if (!shouldTrack) return null;

  const accuracyTooLow =
    latestAccuracy !== null
    && latestAccuracy > accuracyLimitM;

  const showTechnicalNotice =
    permissionProblem
    || accuracyTooLow
    || latestStatus === "location_uncertain"
    || latestStatus === "location_unavailable";

  if (!showTechnicalNotice) return null;

  return (
    <section className="presence-tech-notice" aria-live="polite">
      <div className="presence-tech-copy">
        <div className="presence-tech-heading">
          <span className="presence-tech-dot" aria-hidden="true">!</span>
          <strong>On-site verification pending</strong>
        </div>
        <p>
          {permissionProblem
            ? "Location is unavailable. Allow Location and Precise location, then retry."
            : `Location is only approximate${latestAccuracy !== null ? ` (${formatAccuracy(latestAccuracy)})` : ""}, so RCG cannot be verified yet. Enable Precise location, then retry.`}
        </p>
      </div>
      <button
        className="btn btn-secondary presence-tech-retry"
        type="button"
        onClick={() => void retryNow()}
        disabled={retrying}
      >
        {retrying ? "Checking…" : "Try again"}
      </button>
    </section>
  );
}
