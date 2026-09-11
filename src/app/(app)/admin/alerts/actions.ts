"use server";

import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";

async function invoke(body: Record<string, unknown>) {
  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.functions.invoke("admin-alerts", { body });
  if (error || !data?.success) {
    throw new Error(data?.error || "Unable to update after-hours alerts.");
  }
  revalidatePath("/admin/alerts");
  revalidatePath("/admin/audit");
  revalidatePath("/developer");
}

export async function updateAlertSettings(formData: FormData) {
  await invoke({
    action: "update_settings",
    site_name: String(formData.get("siteName") ?? "Redcatch Community Garden"),
    timezone: String(formData.get("timezone") ?? "Europe/London"),
    closing_time: String(formData.get("closingTime") ?? "18:00"),
    alert_enabled: formData.get("alertEnabled") === "on",
    alert_grace_minutes: Number(formData.get("graceMinutes") ?? 15),
    alert_repeat_minutes: Number(formData.get("repeatMinutes") ?? 60),
  });
}

export async function addAlertRecipient(formData: FormData) {
  await invoke({
    action: "add_recipient",
    email: String(formData.get("email") ?? ""),
  });
}

export async function setAlertRecipientActive(formData: FormData) {
  await invoke({
    action: "set_recipient_active",
    recipient_id: String(formData.get("recipientId") ?? ""),
    active: String(formData.get("active")) === "true",
  });
}

export async function removeAlertRecipient(formData: FormData) {
  await invoke({
    action: "remove_recipient",
    recipient_id: String(formData.get("recipientId") ?? ""),
  });
}

export async function sendAlertTest() {
  await invoke({ action: "send_test" });
}
