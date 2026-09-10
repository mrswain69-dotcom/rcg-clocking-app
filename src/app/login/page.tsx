import type { Metadata } from "next";
import { login } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
          <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <form action={login} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-bold">
              Email
            </label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-bold">
              Password
            </label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn-primary w-full" type="submit">
            Sign in
          </button>
        </form>

        <a className="mt-5 block text-center text-sm font-bold text-[var(--rcg-green)]" href="/kiosk">
          Use the on-site kiosk
        </a>
      </section>
    </main>
  );
}
