import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
    <main className="shell flex min-h-screen items-center justify-center py-10">
      <section className="card w-full max-w-md p-7 sm:p-9">
        <div className="mb-6 text-center">
          <img className="mx-auto h-20 w-24 object-contain" src="/icon.svg" alt="Redcatch fox wearing a green staff shirt" />
          <p className="section-kicker mt-2">Account access</p>
        </div>
        <h1 className="text-3xl font-black tracking-tight">Choose a new password</h1>
        <p className="mt-2 text-[var(--rcg-muted)]">Use at least 10 characters.</p>
        {error ? <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        <form action={updateRecoveredPassword} className="mt-6 space-y-4">
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="password">New password</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></div>
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="confirmPassword">Confirm password</label><input className="input" id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></div>
          <button className="btn btn-primary w-full" type="submit">Update password</button>
        </form>
      </section>
    </main>
  );
}
