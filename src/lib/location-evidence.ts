export type LocationEvidence = {
  clock_in_location_status?: string | null;
  clock_in_distance_m?: number | null;
  clock_in_accuracy_m?: number | null;
  first_on_site_verified_at?: string | null;
  first_on_site_verification_method?: string | null;
  last_presence_check_at?: string | null;
};

export function formatDistanceMetres(metres?: number | null) {
  if (metres === null || metres === undefined) return null;
  if (metres >= 1000) return `${(metres / 1000).toFixed(metres >= 10000 ? 0 : 1)} km`;
  return `${metres} m`;
}

export function locationEvidenceLabel(status?: string | null) {
  switch (status) {
    case "kiosk_verified":
      return "Verified on site · Kiosk";
    case "on_site_verified":
      return "Verified on site · GPS";
    case "outside_site":
      return "Outside site · GPS";
    case "near_boundary":
      return "Near boundary · Inconclusive";
    case "location_uncertain":
      return "GPS accuracy uncertain";
    case "location_unavailable":
    default:
      return "Location unavailable";
  }
}

export function locationEvidenceTone(status?: string | null) {
  if (status === "kiosk_verified" || status === "on_site_verified") return "ok" as const;
  if (status === "outside_site") return "warn" as const;
  return "neutral" as const;
}

export function locationEvidenceDetail(evidence: LocationEvidence) {
  const distance = formatDistanceMetres(evidence.clock_in_distance_m);
  const accuracy = evidence.clock_in_accuracy_m === null || evidence.clock_in_accuracy_m === undefined
    ? null
    : `GPS accuracy ±${evidence.clock_in_accuracy_m} m`;

  switch (evidence.clock_in_location_status) {
    case "kiosk_verified":
      return "Clock-in at the fixed on-site kiosk.";
    case "on_site_verified":
      return accuracy ?? "Device location placed the clock-in inside the RCG geofence.";
    case "outside_site":
      return [distance ? `${distance} outside the site boundary` : null, accuracy].filter(Boolean).join(" · ");
    case "near_boundary":
      return [distance ? `${distance} outside the boundary` : null, accuracy, "Within the GPS uncertainty range"].filter(Boolean).join(" · ");
    case "location_uncertain":
      return [accuracy, distance ? `Reported point ${distance} outside the boundary` : null].filter(Boolean).join(" · ") || "The GPS reading was not accurate enough to classify reliably.";
    case "location_unavailable":
    default:
      return "The device did not provide a usable location at clock-in. Check browser/app location permission when testing.";
  }
}

export function arrivalDelayMinutes(clockInAt: string, firstVerifiedAt?: string | null) {
  if (!firstVerifiedAt) return null;
  return Math.max(0, Math.round((new Date(firstVerifiedAt).getTime() - new Date(clockInAt).getTime()) / 60000));
}
