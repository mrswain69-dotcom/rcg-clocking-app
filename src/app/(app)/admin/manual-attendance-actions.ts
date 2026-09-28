"use server";

import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";
import { londonLocalInputToIso } from "@/lib/dates";

function refreshAttendance(profileId?: string) {
  revalidatePath("/admin");
  revalidatePath("/on-site");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/audit");
  revalidatePath("/admin/users");
  if (profileId) revalidatePath(`/admin/users/${profileId}`);
}

async function invokeSession(body: Record<string, unknown>, profileId?: string) {
  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.functions.invoke("admin-session", { body });
  if (error || !data?.success) {
    throw new Error(data?.error || "Unable to update attendance.");
  }
  refreshAttendance(profileId);
  return data as { success: true; session_id?: string };
}

async function invokeUser(body: Record<string, unknown>) {
  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.functions.invoke("admin-user", { body });
  if (error || !data?.success) {
    throw new Error(data?.error || "Unable to create the attendance-only person.");
  }
  refreshAttendance();
  return data as { success: true; profile_id?: string };
}

export async function adminAddSession(formData: FormData) {
  const profileId = String(formData.get("profileId") ?? "");
  const clockInLocal = String(formData.get("clockInAt") ?? "");
  const clockOutLocal = String(formData.get("clockOutAt") ?? "");
  const reason = String(formData.get("reason") ?? "");

  await invokeSession({
    action: "add_session",
    profile_id: profileId,
    clock_in_at: londonLocalInputToIso(clockInLocal),
    clock_out_at: clockOutLocal ? londonLocalInputToIso(clockOutLocal) : null,
    reason,
  }, profileId);
}

export async function adminCreateAttendancePersonSession(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const clockInLocal = String(formData.get("clockInAt") ?? "");
  const clockOutLocal = String(formData.get("clockOutAt") ?? "");
  const reason = String(formData.get("reason") ?? "");

  const person = await invokeUser({
    action: "create_attendance_person",
    full_name: fullName,
  });

  if (!person.profile_id) throw new Error("The attendance-only person was created but no profile ID was returned.");

  await invokeSession({
    action: "add_session",
    profile_id: person.profile_id,
    clock_in_at: londonLocalInputToIso(clockInLocal),
    clock_out_at: clockOutLocal ? londonLocalInputToIso(clockOutLocal) : null,
    reason,
  }, person.profile_id);
}

export async function adminClockOutSession(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const clockOutLocal = String(formData.get("clockOutAt") ?? "");
  const reason = String(formData.get("reason") ?? "");

  await invokeSession({
    action: "close_session",
    session_id: sessionId,
    clock_out_at: londonLocalInputToIso(clockOutLocal),
    reason,
  }, profileId);
}
