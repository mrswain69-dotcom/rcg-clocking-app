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
        <div className="mb-8 text-center">
          <img className="mx-auto h-28 w-32 object-contain" src="/icon.svg" alt="Redcatch fox wearing a green staff shirt" />
          <div className="brand-name mt-2 text-2xl">Redcatch<br />Community Garden</div>
          <p className="mt-2 text-sm font-extrabold uppercase tracking-[.12em] text-[var(--rcg-green)]">Clocking app</p>
          <h1 className="mt-7 text-3xl font-black tracking-tight">Welcome</h1>
          <p className="mt-2 text-[var(--rcg-muted)]">Sign in to record your time and help keep everyone on site accounted for.</p>
        </div>

        {error ? (
          <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
        ) : null}
        {message ? (
          <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>
        ) : null}

        <form action={login} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-extrabold">Email address</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label htmlFor="password" className="block text-sm font-extrabold">Password</label>
              <Link className="text-sm font-extrabold text-[var(--rcg-green)]" href="/forgot-password">Forgot password?</Link>
            </div>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary w-full text-base" type="submit">Sign in</button>
        </form>

        <Link className="mt-5 block text-center text-sm font-extrabold text-[var(--rcg-green)]" href="/kiosk">
          Use the on-site kiosk
        </Link>
      </section>
    </main>
  );
}
