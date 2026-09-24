"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";

export type BrowserLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export type ClockInResult = {
  sessionId: string;
  locationStatus: string;
  distanceOutsideM: number | null;
  reportedAccuracyM: number | null;
  firstOnSiteVerifiedAt: string | null;
};

export type PresenceCheckResult = {
  locationStatus: string;
  distanceOutsideM: number | null;
  reportedAccuracyM: number | null;
  verifiedAt: string | null;
};

function refreshAttendanceViews() {
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/admin");
  revalidatePath("/on-site");
}

function locationArgs(location?: BrowserLocation | null) {
  return {
    p_latitude: location?.latitude ?? null,
    p_longitude: location?.longitude ?? null,
    p_accuracy_m: location?.accuracy ?? null,
  };
}

export async function clockIn(location?: BrowserLocation | null): Promise<ClockInResult> {
  const { supabase } = await requireProfile();

  const { data, error } = await supabase
    .rpc("clock_in_with_location", locationArgs(location))
    .single();

  if (error || !data) {
    throw new Error("Unable to clock in.");
  }

  refreshAttendanceViews();

  return {
    sessionId: data.session_id,
    locationStatus: data.location_status,
    distanceOutsideM: data.distance_outside_m,
    reportedAccuracyM: data.reported_accuracy_m,
    firstOnSiteVerifiedAt: data.first_on_site_verified_at,
  };
}

export async function verifyOnSite(
  sessionId: string,
  location: BrowserLocation,
): Promise<PresenceCheckResult> {
  const { supabase } = await requireProfile();

  const { data, error } = await supabase
    .rpc("record_presence_check", {
      p_session_id: sessionId,
      ...locationArgs(location),
    })
    .single();

  if (error || !data) {
    throw new Error("Unable to verify site presence.");
  }

  refreshAttendanceViews();

  return {
    locationStatus: data.location_status,
    distanceOutsideM: data.distance_outside_m,
    reportedAccuracyM: data.reported_accuracy_m,
    verifiedAt: data.verified_at,
  };
}

export async function clockOut() {
  const { supabase, profile } = await requireProfile();

  const { data: openSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("profile_id", profile.id)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!openSession) {
    refreshAttendanceViews();
    return;
  }

  const { error } = await supabase
    .from("sessions")
    .update({
      clock_out_at: new Date().toISOString(),
      clock_out_method: "web",
    })
    .eq("id", openSession.id)
    .eq("profile_id", profile.id)
    .is("clock_out_at", null);

  if (error) throw new Error("Unable to clock out.");
  refreshAttendanceViews();
}
