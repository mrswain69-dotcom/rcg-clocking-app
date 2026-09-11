# RCG Clocking App — Operations Guide

This guide covers normal administration of the production RCG Clocking App.

## Daily use

Users sign in on their own device to clock in/out and see their history. The shared tablet uses `/kiosk` and asks for a short code/email plus PIN. Attendance writes require an internet connection.

Administrators use **Admin** to see the live on-site list. The list is derived from sessions with a clock-in time and no clock-out time; there is no separate presence register.

## User management

Under **Admin → Manage users** an authorised administrator can create accounts, archive/reactivate users, enable or disable kiosk access, grant on-site visibility, and reset kiosk PINs.

Only the owner can assign/remove admin or developer roles and permanently delete a user. Permanent deletion is intentionally harder than archive: the target email address must be typed exactly. Use archive for normal departures because permanent deletion also removes attendance records through the database lifecycle rules.

PINs are never displayed. A reset replaces the stored bcrypt hash and clears lockout state.

## Attendance corrections

Open a user from **Admin → Manage users** to inspect their attendance. Authorised admins can add a missing session, correct timestamps, or close an abandoned open session. A reason is required and the operation is written to the audit log.

## Reports

Use **Admin → Reports & exports** to choose a date range and either all users or one user. The page provides visit/hour totals plus detailed and summary CSV downloads.

Users can export their own attendance from **History** using This Week, This Month or a custom date range.

## After-hours alerts

Use **Admin → After-hours alerts** to configure:

- site name
- timezone
- normal closing time
- grace period
- repeat interval
- active recipient email addresses

The Supabase scheduler checks every five minutes. It sends only when alerts are enabled, at least one session is still open beyond closing time plus the grace period, and the configured repeat interval has elapsed since the previous alert.

Before first enablement:

1. Add the Resend sending-only key to Supabase Edge Function secrets under the name `RESEND_API_KEY`.
2. Keep alerts disabled.
3. Add one or more active recipients in the app.
4. Click **Send test to active recipients** and confirm delivery.
5. Confirm closing time, timezone, grace period and repeat interval.
6. Enable alerts and save.

The default sender is `RCG Clocking <alerts@rcgclocking.app>`.

## Developer diagnostics

Owner and developer roles can open **Developer** to view profile/session counts, current alert configuration, recent audit events and recent kiosk events. Standard admins and users cannot access this area.

## Kiosk lockouts

Five failed PIN attempts temporarily lock kiosk PIN access for 15 minutes. An administrator can reset the PIN, which also clears failed-attempt/lockout state.

## PWA / tablet installation

Open the production app in a supported browser and use **Install RCG Clocking** when offered. The service worker caches only the shell/offline resources. Clocking actions are not queued offline; if connectivity is unavailable the user should wait for a connection before clocking.

## Security operations

- Never put Supabase service-role credentials or Resend API keys in GitHub.
- Use archive rather than deletion unless permanent removal is genuinely required.
- Review **Admin → Audit log** when investigating sensitive changes.
- Enable Supabase Auth **Leaked Password Protection** in the Supabase dashboard.
- Keep RLS enabled on all application tables.

## Deployment

`main` is production. Feature branches and pull requests receive CI and Vercel preview builds. Merge only after TypeScript and the production Next.js build pass.
