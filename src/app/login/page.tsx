import type { Metadata } from "next";
import Link from "next/link";
import { login } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="shell flex min-h-screen items-center justify-center py-10">
      <section className="card w-full max-w-md p-7 sm:p-9">
        <div className="mb-7">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#d7652f] text-2xl font-black text-white">
            RCG
          </div>
          <h1 className="text-3xl font-bold">Clocking App</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">
            Sign in to record your time at Redcatch Community Garden.
          </p>
        </div>

        {error ? (
          <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
        ) : null}
        {message ? (
          <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>
        ) : null}

        <form action={login} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-bold">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label htmlFor="password" className="block text-sm font-bold">Password</label>
              <Link className="text-sm font-bold text-[var(--rcg-green)]" href="/forgot-password">Forgot password?</Link>
            </div>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary w-full" type="submit">Sign in</button>
        </form>

        <Link className="mt-5 block text-center text-sm font-bold text-[var(--rcg-green)]" href="/kiosk">
          Use the on-site kiosk
        </Link>
      </section>
    </main>
  );
}
