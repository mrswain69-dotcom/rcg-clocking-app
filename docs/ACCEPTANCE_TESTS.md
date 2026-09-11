# RCG Clocking App — Production Acceptance Tests

Use this checklist before broad staff/volunteer rollout. Run destructive tests with temporary test accounts rather than real attendance records.

## Authentication

- Sign in with an active named account and reach the dashboard.
- Wrong password is rejected.
- Password recovery email/link flow returns the user to the app and permits a new password.
- Archived user cannot use the authenticated app.

## User clocking

- User with no open session can Clock In.
- A second clock-in is prevented by the one-open-session database constraint/business rule.
- Clock Out closes the existing open session.
- Dashboard/history update without a manual browser refresh when session data changes.
- History supports This Week, This Month and a custom date range.
- Personal CSV contains only that user's permitted records.

## Current on-site safety view

- Owner/admin/developer can view current on-site users.
- A normal user without the capability cannot access the on-site view.
- A user granted `can_view_currently_on_site` can access it.
- Clock-in/out in a second browser updates the on-site list in realtime.

## Kiosk

- Valid short code/email + PIN clocks a kiosk-enabled user in/out.
- PIN is not exposed to the client/database UI path.
- Invalid PIN attempts are logged.
- Five failed attempts trigger temporary lockout.
- Success screen resets back to the neutral kiosk form.
- A user with kiosk access disabled cannot clock via kiosk.

## User administration

- Admin can create a standard user, archive/reactivate, reset PIN and change capability flags.
- Admin cannot change protected owner role or permanently delete the owner.
- Owner can assign/remove admin and developer roles.
- Owner permanent deletion requires exact typed email confirmation; test only with a disposable account.
- Sensitive changes appear in the audit log.

## Attendance administration

- Admin can add a missing session with a reason.
- Admin can correct timestamps with a reason.
- Admin can manually close an abandoned open session with a reason.
- Invalid time ordering is rejected.
- Corrections appear in `audit_log`.

## Reports

- Admin report filters by custom date range.
- Admin report can select all users or one user.
- Detailed CSV downloads correctly.
- Summary CSV includes per-user visit and hour totals.
- Archived users remain selectable for historical reporting until permanently deleted.

## After-hours alerts

Keep production alerts disabled until the first five checks pass.

- `RESEND_API_KEY` exists in Supabase Edge Function secrets.
- `rcgclocking.app` is verified for sending in Resend.
- At least one active recipient exists.
- **Send test to active recipients** is received.
- Site name, Europe/London timezone, closing time, grace and repeat interval are correct.
- Enable alerts.
- With no qualifying open session, scheduler sends nothing.
- With a controlled test user left open beyond a temporarily configured closing/grace threshold, an alert is received and contains site name, current time, user, clock-in time and duration.
- A second alert is suppressed until the repeat interval.
- Restore the real operational closing/grace settings after the test.

## PWA and resilience

- Install prompt/standalone PWA works on the intended device.
- Offline navigation presents the offline shell.
- Attendance actions are not falsely recorded while offline.
- Reconnecting restores normal operation.

## Developer access

- Owner/developer can open Developer diagnostics.
- Standard admin/user cannot open Developer diagnostics.
- Diagnostics show operational counts, alert configuration, recent audit events and kiosk events.

## Release gates

- GitHub CI TypeScript check passes.
- GitHub CI production Next.js build passes.
- Vercel production deployment for `main` succeeds.
- `https://rcgclocking.app` resolves and loads over HTTPS.
- Supabase security advisor has no unexpected new high-severity findings.
