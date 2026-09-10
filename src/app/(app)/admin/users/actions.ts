"use server";

import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";

async function invoke(body: Record<string, unknown>) {
  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.functions.invoke("admin-user", { body });
  if (error || !data?.success) throw new Error(data?.error || "Unable to complete the administrator action.");
  revalidatePath("/admin/users");
}

export async function createUser(formData: FormData) {
  await invoke({
    action: "create_user",
    full_name: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    role: String(formData.get("role") ?? "user"),
    short_code: String(formData.get("shortCode") ?? ""),
    pin: String(formData.get("pin") ?? ""),
  });
}

export async function setUserActive(formData: FormData) {
  await invoke({ action: "set_active", profile_id: String(formData.get("profileId") ?? ""), active: String(formData.get("active")) === "true" });
}

export async function setUserRole(formData: FormData) {
  await invoke({ action: "set_role", profile_id: String(formData.get("profileId") ?? ""), role: String(formData.get("role") ?? "user") });
}

export async function setPresenceVisibility(formData: FormData) {
  await invoke({ action: "set_presence_visibility", profile_id: String(formData.get("profileId") ?? ""), enabled: String(formData.get("enabled")) === "true" });
}

export async function setKioskAccess(formData: FormData) {
  await invoke({ action: "set_kiosk_access", profile_id: String(formData.get("profileId") ?? ""), enabled: String(formData.get("enabled")) === "true" });
}

export async function resetPin(formData: FormData) {
  await invoke({ action: "reset_pin", profile_id: String(formData.get("profileId") ?? ""), pin: String(formData.get("pin") ?? "") });
}
