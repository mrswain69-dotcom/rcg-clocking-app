import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { changePassword } from "./actions";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { profile } = await requireProfile();
  const { error, message } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.12em] text-[var(--rcg-orange)]">Your account</p>
        <h1 className="mt-1 text-3xl font-black">Account settings</h1>
        <p className="mt-2 text-[var(--rcg-muted)]">Manage your sign-in details.</p>
      </div>

      <section className="card p-5 sm:p-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt className="text-xs font-bold uppercase tracking-wide text-[var(--rcg-muted)]">Name</dt><dd className="mt-1 font-bold">{profile.full_name}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wide text-[var(--rcg-muted)]">Email</dt><dd className="mt-1">{profile.email}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wide text-[var(--rcg-muted)]">Role</dt><dd className="mt-1"><span className="badge">{profile.role}</span></dd></div>
        </dl>
      </section>

      <section className="card max-w-xl p-5 sm:p-6">
        <h2 className="text-xl font-black">Change password</h2>
        {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        {message ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}
        <form action={changePassword} className="mt-5 space-y-4">
          <div><label className="mb-1 block text-sm font-bold" htmlFor="currentPassword">Current password</label><input className="input" id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></div>
          <div><label className="mb-1 block text-sm font-bold" htmlFor="password">New password</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></div>
          <div><label className="mb-1 block text-sm font-bold" htmlFor="confirmPassword">Confirm new password</label><input className="input" id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></div>
          <button className="btn btn-primary" type="submit">Change password</button>
        </form>
      </section>
    </div>
  );
}
