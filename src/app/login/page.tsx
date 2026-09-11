import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { login } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -bottom-16 -left-12 h-80 w-80 bg-[url('/brand/leaves.svg')] bg-contain bg-no-repeat opacity-20" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rotate-[-18deg] bg-[url('/brand/leaves.svg')] bg-contain bg-no-repeat opacity-15" />

      <section className="card relative z-10 w-full max-w-md p-7 sm:p-9">
        <div className="mb-8 text-center">
          <BrandLogo href="" className="justify-center" />
          <p className="mt-3 text-sm font-extrabold text-[var(--rcg-green-dark)]">People · Plants · Community</p>
          <h1 className="mt-8 text-4xl font-black text-[var(--rcg-green-deep)]">Welcome</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">Sign in to your account.</p>
        </div>

        {error ? <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        {message ? <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}

        <form action={login} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-extrabold">Email address</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label htmlFor="password" className="block text-sm font-extrabold">Password</label>
              <Link className="text-sm font-extrabold text-[var(--rcg-green-dark)]" href="/forgot-password">Forgot password?</Link>
            </div>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary w-full text-base" type="submit">Sign in</button>
        </form>

        <div className="mt-6 border-t border-[var(--rcg-border)] pt-5 text-center">
          <Link className="text-sm font-extrabold text-[var(--rcg-green-dark)]" href="/kiosk">Use the on-site kiosk →</Link>
        </div>
      </section>
    </main>
  );
}
