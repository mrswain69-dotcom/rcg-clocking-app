"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateRecoveredPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < 10) {
    redirect(`/update-password?error=${encodeURIComponent("Use at least 10 characters for the new password.")}`);
  }
  if (password !== confirm) {
    redirect(`/update-password?error=${encodeURIComponent("The two passwords do not match.")}`);
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/update-password?error=${encodeURIComponent("Unable to update the password. Request a new reset link and try again.")}`);
  }

  await supabase.auth.signOut();
  redirect(`/login?message=${encodeURIComponent("Password updated. Sign in with your new password.")}`);
}
