"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recordSessionLocation } from "@/app/(app)/dashboard/actions";
import { getBrowserLocation } from "@/lib/browser-location";
import { nextLocationCheck } from "@/lib/verification";

export type AutoVerificationSession = {
  id: string;
  clock_out_at: string | null;
  first_on_site_verified_at: string | null;
  first_off_site_verified_at: string | null;
  last_presence_check_at: string | null;
  current_presence_source: string | null;
};

export function PresenceAutoVerifier({
  session,
  periodicEnabled,
}: {
  session: AutoVerificationSession;
  periodicEnabled: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    let attemptedAt = session.last_presence_check_at
      ? Date.parse(session.last_presence_check_at)
      : 0;
    let arrivalVerified = Boolean(session.first_on_site_verified_at);
    let departureVerified = Boolean(session.first_off_site_verified_at);
    async function check() {
      if (busy || cancelled || document.visibilityState !== "visible") return;
      const now = Date.now();
      const phase = nextLocationCheck(
        {
          ...session,
          first_on_site_verified_at: arrivalVerified ? "verified" : null,
          first_off_site_verified_at: departureVerified ? "verified" : null,
        },
        periodicEnabled,
        now,
        attemptedAt,
      );
      if (!phase) return;
      busy = true;
      attemptedAt = now;
      const location = await getBrowserLocation();
      if (cancelled || document.visibilityState !== "visible") {
        busy = false;
        return;
      }
      try {
        const result = await recordSessionLocation(session.id, phase, location);
        if (cancelled) return;
        if (phase === "departure")
          departureVerified = Boolean(result.verified_at);
        else arrivalVerified = Boolean(result.verified_at);
        setNotice(
          result.location_status === "location_unavailable"
            ? "Location unavailable. Attendance is saved; allow location access to verify it."
            : ["near_boundary", "location_uncertain"].includes(
                  result.location_status,
                )
              ? "Location accuracy is uncertain. Attendance is saved; verification remains pending."
              : null,
        );
        router.refresh();
      } catch {
        if (!cancelled)
          setNotice(
            "Location check could not be saved. Your attendance record is unaffected.",
          );
      } finally {
        busy = false;
      }
    }
    void check();
    const timer = window.setInterval(() => void check(), 15000);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [
    session.id,
    session.clock_out_at,
    session.first_on_site_verified_at,
    session.first_off_site_verified_at,
    session.last_presence_check_at,
    session.current_presence_source,
    periodicEnabled,
    router,
  ]);
  return notice ? (
    <p className="presence-tech-notice" role="status">
      {notice}
    </p>
  ) : null;
}
