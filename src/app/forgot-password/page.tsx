import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "./actions";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="shell flex min-h-screen items-center justify-center py-10">
      <section className="card w-full max-w-md p-7 sm:p-9">
        <div className="mb-6 text-center">
          <img className="mx-auto h-20 w-24 object-contain" src="/icon.svg" alt="Redcatch fox wearing a green staff shirt" />
          <p className="section-kicker mt-2">Account access</p>
        </div>
        <h1 className="text-3xl font-black tracking-tight">Reset your password</h1>
        <p className="mt-2 text-[var(--rcg-muted)]">Enter the email address used for your RCG account.</p>

        {error ? <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        {message ? <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}

        <form action={requestPasswordReset} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-extrabold" htmlFor="email">Email address</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <button className="btn btn-primary w-full" type="submit">Send reset link</button>
        </form>

        <Link className="mt-5 block text-center text-sm font-extrabold text-[var(--rcg-green)]" href="/login">Back to sign in</Link>
      </section>
    </main>
  );
}
