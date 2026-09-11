import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { requestPasswordReset } from "./actions";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -bottom-16 -left-12 h-80 w-80 bg-[url('/brand/leaves.svg')] bg-contain bg-no-repeat opacity-20" />
      <section className="card relative z-10 w-full max-w-md p-7 sm:p-9">
        <div className="mb-7 text-center">
          <BrandLogo href="" className="justify-center" />
          <p className="section-kicker mt-5">Account access</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--rcg-green-deep)]">Reset your password</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">Enter the email address used for your RCG account.</p>
        </div>

        {error ? <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        {message ? <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}

        <form action={requestPasswordReset} className="space-y-4">
          <div><label className="mb-1 block text-sm font-extrabold" htmlFor="email">Email address</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
          <button className="btn btn-primary w-full" type="submit">Send reset link</button>
        </form>

        <Link className="mt-5 block text-center text-sm font-extrabold text-[var(--rcg-green-dark)]" href="/login">← Back to sign in</Link>
      </section>
    </main>
  );
}
