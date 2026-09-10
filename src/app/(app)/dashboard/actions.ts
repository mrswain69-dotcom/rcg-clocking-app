"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";

function refreshAttendanceViews() {
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/admin");
}

export async function clockIn() {
  const { supabase, profile } = await requireProfile();

  const { data: existing } = await supabase
    .from("sessions")
    .select("id")
    .eq("profile_id", profile.id)
    .is("clock_out_at", null)
    .maybeSingle();

  if (existing) {
    refreshAttendanceViews();
    return;
  }

  const { error } = await supabase.from("sessions").insert({
    profile_id: profile.id,
    clock_in_at: new Date().toISOString(),
    clock_in_method: "web",
  });

  if (error && error.code !== "23505") {
    throw new Error("Unable to clock in.");
  }

  refreshAttendanceViews();
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
