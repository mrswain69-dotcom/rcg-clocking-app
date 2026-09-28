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

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

type ClockInRpcRow = {
  session_id: string;
  location_status: string;
  distance_outside_m: number | null;
  reported_accuracy_m: number | null;
  first_on_site_verified_at: string | null;
};

type PresenceCheckRpcRow = {
  location_status: string;
  distance_outside_m: number | null;
  reported_accuracy_m: number | null;
  verified_at: string | null;
};

function refreshAttendanceViews() {
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/admin");
  revalidatePath("/on-site");
  revalidatePath("/admin/audit");
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

  const row = data as ClockInRpcRow;
  refreshAttendanceViews();

  return {
    sessionId: row.session_id,
    locationStatus: row.location_status,
    distanceOutsideM: row.distance_outside_m,
    reportedAccuracyM: row.reported_accuracy_m,
    firstOnSiteVerifiedAt: row.first_on_site_verified_at,
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

  const row = data as PresenceCheckRpcRow;
  refreshAttendanceViews();

  return {
    locationStatus: row.location_status,
    distanceOutsideM: row.distance_outside_m,
    reportedAccuracyM: row.reported_accuracy_m,
    verifiedAt: row.verified_at,
  };
}

export async function savePushSubscription(input: PushSubscriptionInput) {
  const { supabase } = await requireProfile();

  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_user_agent: input.userAgent ?? null,
  });

  if (error) throw new Error("Unable to save notification subscription.");
  return { success: true };
}

export async function disablePushSubscription(endpoint: string) {
  const { supabase } = await requireProfile();
  const { error } = await supabase.rpc("disable_push_subscription", {
    p_endpoint: endpoint,
  });
  if (error) throw new Error("Unable to disable notification subscription.");
  return { success: true };
}

export async function respondPresenceCheckLocation(
  requestId: string,
  location: BrowserLocation | null,
): Promise<{ status: string }> {
  const { supabase } = await requireProfile();

  const { data, error } = await supabase.rpc("resolve_presence_check_location", {
    p_request_id: requestId,
    ...locationArgs(location),
  });

  if (error) throw new Error("Unable to complete the presence check.");
  refreshAttendanceViews();
  return { status: String(data ?? "location_unavailable") };
}

export async function respondPresenceCheckClockOut(
  requestId: string,
  clockOutAt: string,
): Promise<{ clockOutAt: string }> {
  const { supabase } = await requireProfile();
  const parsed = new Date(clockOutAt);
  if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid time.");

  const { data, error } = await supabase.rpc("resolve_presence_check_clock_out", {
    p_request_id: requestId,
    p_clock_out_at: parsed.toISOString(),
  });

  if (error) throw new Error("Unable to correct the clock-out time.");
  refreshAttendanceViews();
  return { clockOutAt: String(data) };
}

export async function respondPresenceCheckWorkingOffSite(requestId: string) {
  const { supabase } = await requireProfile();
  const { error } = await supabase.rpc("resolve_presence_check_working_off_site", {
    p_request_id: requestId,
  });

  if (error) throw new Error("Unable to update your site status.");
  refreshAttendanceViews();
  return { success: true };
}

export async function respondPresenceCheckUserConfirmedOnSite(requestId: string) {
  const { supabase } = await requireProfile();
  const { error } = await supabase.rpc("resolve_presence_check_user_confirmed_on_site", {
    p_request_id: requestId,
  });

  if (error) throw new Error("Unable to confirm your site status.");
  refreshAttendanceViews();
  return { success: true };
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
