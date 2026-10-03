"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";

export async function changePassword(formData: FormData) {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword)
    redirect(
      `/account?error=${encodeURIComponent("Enter your current password.")}`,
    );
  if (password.length < 10)
    redirect(
      `/account?error=${encodeURIComponent("Use at least 10 characters for the new password.")}`,
    );
  if (password !== confirm)
    redirect(
      `/account?error=${encodeURIComponent("The two new passwords do not match.")}`,
    );

  const { supabase } = await requireProfile();
  const { error } = await supabase.auth.updateUser({
    password,
    current_password: currentPassword,
  });
  if (error)
    redirect(
      `/account?error=${encodeURIComponent("Current password was not accepted or the password could not be changed.")}`,
    );

  redirect(
    `/account?message=${encodeURIComponent("Password changed successfully.")}`,
  );
}

export async function setLocationChecks(formData: FormData) {
  const { supabase } = await requireProfile();
  const { error } = await supabase.rpc("set_location_check_preference", {
    p_enabled: formData.get("enabled") === "on",
  });
  if (error)
    redirect("/account?error=Unable%20to%20save%20location%20settings");
  revalidatePath("/", "layout");
  redirect("/account?message=Location%20settings%20saved");
}
