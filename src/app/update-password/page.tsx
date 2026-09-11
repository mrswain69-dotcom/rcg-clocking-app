import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { createClient } from "@/lib/supabase/server";
import { updateRecoveredPassword } from "./actions";

export const metadata: Metadata = { title: "Choose new password" };

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const { error } = await searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -bottom-16 -right-12 h-80 w-80 rotate-[-12deg] bg-[url('/brand/leaves.svg')] bg-contain bg-no-repeat opacity-18" />
      <section className="card relative z-10 w-full max-w-md p-7 sm:p-9">
        <div className="mb-7 text-center">
          <BrandLogo href="" className="justify-center" />
          <p className="section-kicker mt-5">Account access</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--rcg-green-deep)]">Choose a new password</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">Use at least 10 characters.</p>
        </div>
        {error ? <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        <form action={updateRecoveredPassword} className="space-y-4">
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="password">New password</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></div>
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="confirmPassword">Confirm password</label><input className="input" id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></div>
          <button className="btn btn-primary w-full" type="submit">Update password</button>
        </form>
      </section>
    </main>
  );
}
