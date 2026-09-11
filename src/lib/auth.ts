import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "owner" | "admin" | "developer" | "user";

export type AppProfile = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: AppRole;
  is_active: boolean;
  can_view_currently_on_site: boolean;
  can_use_kiosk: boolean;
  can_receive_safety_alerts: boolean;
  archived_at: string | null;
};

export async function requireProfile() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id,user_id,full_name,email,role,is_active,can_view_currently_on_site,can_use_kiosk,can_receive_safety_alerts,archived_at",
    )
    .eq("user_id", userId)
    .single();

  if (error || !profile || !profile.is_active || profile.archived_at) {
    redirect("/login?error=Your account is not active.");
  }

  return { supabase, profile: profile as AppProfile, userId };
}

export async function requireAdminProfile() {
  const context = await requireProfile();
  if (!["owner", "admin", "developer"].includes(context.profile.role)) {
    redirect("/dashboard");
  }
  return context;
}

export async function requireDeveloperProfile() {
  const context = await requireProfile();
  if (!["owner", "developer"].includes(context.profile.role)) {
    redirect("/dashboard");
  }
  return context;
}
