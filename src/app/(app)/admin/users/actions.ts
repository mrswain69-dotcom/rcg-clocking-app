"use server";

import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";

export async function setUserActive(formData: FormData) {
  const targetId = String(formData.get("profileId") ?? "");
  const desiredActive = String(formData.get("active")) === "true";
  if (!targetId) return;

  const { supabase, profile: actor } = await requireAdminProfile();

  const { data: target } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", targetId)
    .single();

  if (!target) return;
  if (target.role === "owner" && actor.id !== target.id) {
    throw new Error("The owner account cannot be archived by another administrator.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      is_active: desiredActive,
      archived_at: desiredActive ? null : new Date().toISOString(),
    })
    .eq("id", targetId);

  if (error) throw new Error("Unable to update this user.");

  revalidatePath("/admin/users");
}
