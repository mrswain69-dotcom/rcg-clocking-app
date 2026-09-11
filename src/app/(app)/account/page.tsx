import type { Metadata } from "next";
import { PageHeader } from "@/components/brand/PageHeader";
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
      <PageHeader
        eyebrow="Your account"
        title="Profile & security"
        description="Your Redcatch account details and sign-in settings."
      />

      <section className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <article className="card p-5 sm:p-6">
          <p className="section-kicker">Profile</p>
          <h2 className="mt-1 text-2xl font-black">Your details</h2>
          <dl className="mt-6 space-y-5">
            <div className="rounded-2xl bg-[var(--rcg-green-mist)] p-4"><dt className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--rcg-muted)]">Name</dt><dd className="mt-1 text-lg font-extrabold">{profile.full_name}</dd></div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[var(--rcg-border)]"><dt className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--rcg-muted)]">Email</dt><dd className="mt-1 break-all font-bold">{profile.email}</dd></div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[var(--rcg-border)]"><dt className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--rcg-muted)]">Role</dt><dd className="mt-2"><span className="badge">{profile.role}</span></dd></div>
          </dl>
        </article>

        <article className="card p-5 sm:p-6">
          <p className="section-kicker">Security</p>
          <h2 className="mt-1 text-2xl font-black">Change password</h2>
          <p className="mt-2 text-sm text-[var(--rcg-muted)]">Use a strong password of at least 10 characters.</p>

          {error ? <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
          {message ? <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}

          <form action={changePassword} className="mt-5 space-y-4">
            <div><label className="mb-1 block text-sm font-extrabold" htmlFor="currentPassword">Current password</label><input className="input" id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></div>
            <div><label className="mb-1 block text-sm font-extrabold" htmlFor="password">New password</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></div>
            <div><label className="mb-1 block text-sm font-extrabold" htmlFor="confirmPassword">Confirm new password</label><input className="input" id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></div>
            <button className="btn btn-primary" type="submit">Update password</button>
          </form>
        </article>
      </section>

      <aside className="decorative-panel">
        <div className="decorative-panel-icon">🌱</div>
        <h2>People · Plants · Community</h2>
        <p className="decorative-panel-copy">Your account helps keep attendance accurate, the team informed and the garden safer for everyone.</p>
        <span className="botanical-corner" aria-hidden="true" />
      </aside>
    </div>
  );
}
