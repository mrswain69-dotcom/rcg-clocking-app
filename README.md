# RCG Clocking App

Progressive Web App for Redcatch Community Garden (Bristol) to record attendance, support site-safety lock-up checks, and verify volunteer/staff hours.

## Architecture

- Next.js App Router + React + TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, RLS, Realtime and Edge Functions
- Vercel deployment
- Installable PWA manifest + service worker + offline shell
- Resend transactional email for after-hours safety alerts

The approved architecture and database/security documents in `/docs` remain the source of truth.

## MVP implemented

- Email/password authentication, password recovery and password change
- Roles: owner, admin, developer and user
- User dashboard with Clock In / Clock Out
- Personal attendance history with This Week, This Month and custom date ranges
- Personal CSV export
- Realtime session refresh across authenticated screens
- Live currently-on-site view with per-user visibility permission
- Admin user creation, archive/reactivation, role management and kiosk access controls
- Owner-only permanent user deletion with explicit confirmation
- Kiosk clocking with short code/email + securely hashed PIN, lockout and audit events
- Manual attendance correction, missing-session addition and manual clock-out with audit logging
- Admin attendance reports by user/date range with detailed and summary CSV exports
- After-hours safety alerts with configurable closing time, grace period, repeat interval and recipients
- Five-minute Supabase Cron checker with Vault-backed scheduler authentication
- Audit log and developer diagnostics/event viewer
- Global operational settings for site name/timezone
- Installable PWA with safe offline shell; attendance writes require a connection
- CI typecheck and production build on GitHub with Vercel previews/deployment

## Environment variables

For the Next.js app:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Use the modern Supabase publishable key. Never expose a secret/service-role key in the Next.js client.

Supabase Edge Functions use platform-provided Supabase secrets plus:

```text
RESEND_API_KEY=<sending-only Resend key restricted to rcgclocking.app>
```

The alert functions default to `RCG Clocking <alerts@rcgclocking.app>` as the sender. `ALERT_FROM_EMAIL` may be supplied as an override if required.

Never commit API keys or service-role values to this repository.

## Production services

- Application domain: `https://rcgclocking.app`
- Database/Auth/Realtime/Edge Functions: Supabase
- Frontend deployment: Vercel from `main`
- Email delivery: Resend, `rcgclocking.app`, EU region

## After-hours alert go-live

Alerts intentionally remain disabled until the operational owner has:

1. Added `RESEND_API_KEY` to Supabase Edge Function secrets.
2. Added at least one active recipient under **Admin → After-hours alerts**.
3. Used **Send test to active recipients** and confirmed receipt.
4. Confirmed closing time, timezone, grace and repeat settings.
5. Enabled after-hours alerts and saved.

The scheduler itself runs every five minutes and exits safely when alerts are disabled.

## Security notes

- RLS is enabled on all application data tables.
- PIN hashes are service-role only and never shown in the UI.
- Sensitive admin operations run through authenticated Edge Functions and write to `audit_log`.
- One open attendance session per profile is enforced in the database.
- The owner account is protected from normal demotion/archive/deletion flows.
- Supabase Auth Leaked Password Protection should be enabled from the Supabase dashboard as an account-level hardening step.

## Deferred by the approved architecture

These are compatible future enhancements, not missing MVP work:

- offline attendance queueing
- QR-code check-in
- richer charts/reporting
- Google Drive automatic export
- activity tags
- volunteer milestones

## Handover

See:

- `docs/OPERATIONS.md` — day-to-day administration and alert setup
- `docs/ACCEPTANCE_TESTS.md` — production acceptance checklist
