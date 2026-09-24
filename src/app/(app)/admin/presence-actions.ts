"use server";

import { revalidatePath } from "next/cache";
import { requireAdminProfile } from "@/lib/auth";

export async function requestPresenceCheck(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) throw new Error("Session is required.");

  const { supabase } = await requireAdminProfile();
  const { data, error } = await supabase.functions.invoke("presence-check", {
    body: {
      action: "request",
      session_id: sessionId,
    },
  });

  if (error || !data?.success) {
    throw new Error(data?.error || "Unable to request a presence check.");
  }

  revalidatePath("/admin");
  revalidatePath("/on-site");
  revalidatePath("/admin/audit");
}
