"use server";

import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";

async function invoke(body: Record<string, unknown>) {
  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.functions.invoke("kiosk-admin", { body });
  if (error || !data?.success) throw new Error(data?.error || "Unable to update kiosk device.");
  revalidatePath("/admin/kiosk-devices");
  revalidatePath("/admin/audit");
}

export async function revokeKioskDevice(formData: FormData) {
  await invoke({
    action: "revoke",
    device_id: String(formData.get("deviceId") ?? ""),
  });
}

export async function renameKioskDevice(formData: FormData) {
  await invoke({
    action: "rename",
    device_id: String(formData.get("deviceId") ?? ""),
    label: String(formData.get("label") ?? ""),
  });
}
