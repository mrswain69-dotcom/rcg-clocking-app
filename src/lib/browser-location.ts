import type { BrowserLocation } from "@/app/(app)/dashboard/actions";

export function getBrowserLocation(): Promise<BrowserLocation | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: Number.isFinite(p.coords.accuracy)
            ? p.coords.accuracy
            : null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    ),
  );
}
