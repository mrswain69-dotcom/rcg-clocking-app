"use server";

import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";
import { londonLocalInputToIso } from "@/lib/dates";

async function invoke(body: Record<string, unknown>, profileId: string) {
  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.functions.invoke("admin-session", { body });
  if (error || !data?.success) throw new Error(data?.error || "Unable to update attendance.");
  revalidatePath(`/admin/users/${profileId}`);
  revalidatePath("/admin");
}

export async function addSession(formData: FormData) {
  const profileId = String(formData.get("profileId") ?? "");
  const clockInAt = londonLocalInputToIso(String(formData.get("clockInAt") ?? ""));
  const clockOutRaw = String(formData.get("clockOutAt") ?? "");
  await invoke({ action: "add_session", profile_id: profileId, clock_in_at: clockInAt, clock_out_at: clockOutRaw ? londonLocalInputToIso(clockOutRaw) : null, reason: String(formData.get("reason") ?? "") }, profileId);
}

export async function correctSession(formData: FormData) {
  const profileId = String(formData.get("profileId") ?? "");
  const clockInAt = londonLocalInputToIso(String(formData.get("clockInAt") ?? ""));
  const clockOutRaw = String(formData.get("clockOutAt") ?? "");
  await invoke({ action: "correct_session", session_id: String(formData.get("sessionId") ?? ""), clock_in_at: clockInAt, clock_out_at: clockOutRaw ? londonLocalInputToIso(clockOutRaw) : null, reason: String(formData.get("reason") ?? "") }, profileId);
}

export async function closeSession(formData: FormData) {
  const profileId = String(formData.get("profileId") ?? "");
  await invoke({ action: "close_session", session_id: String(formData.get("sessionId") ?? ""), clock_out_at: londonLocalInputToIso(String(formData.get("clockOutAt") ?? "")), reason: String(formData.get("reason") ?? "") }, profileId);
}
