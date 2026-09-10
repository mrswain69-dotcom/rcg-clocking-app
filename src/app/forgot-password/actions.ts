"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    redirect(`/forgot-password?error=${encodeURIComponent("Enter a valid email address.")}`);
  }

  const supabase = await createClient();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://rcgclocking.app").replace(/\/$/, "");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/update-password`,
  });

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent("Unable to send a reset email right now.")}`);
  }

  redirect(`/forgot-password?message=${encodeURIComponent("If that email belongs to an account, a password reset link has been sent.")}`);
}
