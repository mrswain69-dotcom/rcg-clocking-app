import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
export default async function RegistersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireProfile();
  if (profile.role !== "owner" && profile.register_account_type === "standard")
    redirect("/dashboard");
  return children;
}
