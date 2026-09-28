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
    <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-amber-950">On-site verification pending</p>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            {permissionProblem
              ? "The app cannot currently get a usable location from this device. Check that Location and Precise location are allowed, then retry."
              : `Your phone is currently providing approximate location${latestAccuracy !== null ? ` (${formatAccuracy(latestAccuracy)})` : ""}, so the app cannot reliably confirm that you're at RCG. Enable Precise location, then retry.`}
          </p>
        </div>
        <button
          className="btn btn-secondary shrink-0"
          type="button"
          onClick={() => void retryNow()}
          disabled={retrying}
        >
          {retrying ? "Checking…" : "Try location again"}
        </button>
      </div>
    </section>
  );
}
