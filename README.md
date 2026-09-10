# RCG Clocking App

Progressive Web App for Redcatch Community Garden (Bristol) to record attendance, support site-safety lock-up checks, and verify volunteer/staff hours.

## Architecture

- Next.js App Router + React + TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, RLS, Realtime and Edge Functions
- Vercel deployment
- Installable PWA manifest

The approved architecture and database/security documents are in `/docs` and remain the source of truth.

## Implemented in the MVP foundation

- Email/password sign-in and Supabase SSR session handling
- Authenticated user shell with role-aware navigation
- User dashboard with Clock In / Clock Out
- Personal attendance history and CSV export
- Admin live on-site dashboard with Supabase Realtime refresh
- Admin user list with archive/reactivate foundation
- Shared-tablet kiosk UI
- `kiosk-clock` Edge Function with hashed PIN validation and lockout handling
- PWA manifest and installable shell
- CI typecheck/build workflow
- Forward migration aligning the early database with the approved schema/security specification

## Supabase environment variables

Copy `.env.example` to `.env.local` for local development:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Use the modern Supabase publishable key. Do not expose a secret/service-role key in the Next.js client.

## Database

The original `0001` and `0002` migrations are retained as project history. `0004_align_to_approved_spec.sql` is the forward alignment migration for the approved data/security model.

`0003_seed_dev_data.sql` contains old placeholder profile IDs and should not be used in production. Real profile rows must reference actual `auth.users` records.

## Still to complete before production handover

- Bootstrap the owner Auth user/profile and create test users
- Privileged admin flows for creating users, role changes, PIN reset and attendance corrections with audit logging
- After-hours alert function and email provider configuration
- Final RCG logo/icon assets and visual polish
- Vercel project link, environment variables and production deployment
- End-to-end permission, kiosk, realtime and tablet tests
