# RCG Clocking App — Operations Guide

This guide covers normal administration of the production RCG Clocking App.

## Daily use

Users sign in on their own device to clock in/out and see their history. Shared kiosk mode only works on browsers/devices that an administrator has explicitly enrolled under **Admin → Kiosk devices**. Registered users use email/short code + PIN; visitors and one-off volunteers use the kiosk attendance flow. Attendance writes require an internet connection.

Administrators use **Admin** to see the live presence list. Working time and physical presence are separate: an open session means the person is still clocked in for work, while the current presence state records whether they are verified on site, off site, or unverified. Kiosk clock-ins are on-site verified automatically; mobile clock-ins can use GPS verification.

## User management

Under **Admin → Manage people** an authorised administrator can create registered accounts, classify employees/regular volunteers, close/reactivate account access, classify attendance-only visitors/one-off volunteers, grant on-site visibility, and reset kiosk PINs. Attendance-only people have no login account.

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
- grace period before the user self-check
- user response / escalation window
- management repeat interval
- active escalation recipient email addresses

The Supabase scheduler checks every five minutes. When enabled, a person still recorded on site after closing + grace is asked to confirm their status first. Web Push is used when the device has opted in; otherwise email is the fallback. If the check remains unresolved for the configured escalation window, management recipients are emailed. The management view receives only on-site, off-site or unresolved status — not the person's exact ping location.

The user can resolve the check by confirming/allowing a site check, stating that they have left but are still working, or choosing **I already left — clock me out** and entering the time they actually left. Administrators can also use **Request presence check** from the live presence card at any time.

Before first enablement:

1. Add the Resend sending-only key to Supabase Edge Function secrets under the name `RESEND_API_KEY`.
2. Keep alerts disabled.
3. Add one or more active recipients in the app.
4. Click **Send test to active recipients** and confirm delivery.
5. Confirm closing time, timezone, grace period, response window and repeat interval.
6. Users should enable **Safety notifications** on supported personal devices; users who do not enable Web Push receive email fallback.
7. Enable alerts and save.

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


## Manual administrator attendance

Owners, admins and developers can use **Admin → Admin attendance** or the admin controls on **On Site** to enter attendance on somebody's behalf.

- Existing people can be clocked in at a chosen local date/time; an optional clock-out time can be entered at the same time for historical/backfilled attendance.
- A live open session can be clocked out by an administrator using the actual date/time the person left.
- **Visitor / no app login** creates an attendance-only person. This record has no Supabase Auth user, email login, kiosk access, PIN or push-notification path.
- An open admin-entered clock-in counts in the site-safety headcount because an administrator has explicitly recorded the person as present.
- Admin-entered attendance is not GPS/kiosk verified. Its location evidence is shown as **Admin entry · Not location verified**.
- If a normal app user was manually clocked in and later opens the app, a later device presence check may provide separate on-site evidence; it does not change the fact that the original clock-in was an admin entry.
- Every admin add/correction/clock-out writes an audit event containing the acting administrator, target person/session, reason, entered times and relevant before/after values.
- Attendance-only people cannot receive automated presence pings. If still open after hours, management follow-up is required directly.


## Trusted kiosk model

Kiosk verification is only considered strong on-site evidence when the request comes from an active enrolled RCG kiosk device.

1. On the physical shared tablet/computer, sign in as an administrator.
2. Open **Admin → Kiosk devices**.
3. Enter a device name such as `Canopy reception tablet` and choose **Enrol & open kiosk**.
4. The browser stores a long random kiosk credential locally; only its SHA-256 hash is stored in Supabase.
5. The administrator is signed out and the browser opens `/kiosk`.
6. If a device is lost/replaced, revoke it from **Admin → Kiosk devices**. A revoked device immediately stops producing kiosk-verified attendance.

Knowing the kiosk URL is not sufficient. A non-enrolled browser shows a locked kiosk screen and cannot create kiosk-verified attendance.

Administrators using the maintenance link on a kiosk should return via **Sign out admin & return to kiosk** so no privileged session remains on the shared device.

## Registered-user kiosk access

Registered employees/regular volunteers configure kiosk access themselves under **Account → Kiosk access**.

- PIN: 4–6 digits, stored only as a bcrypt hash.
- Short code: optional, unique case-insensitively, 3–12 letters/numbers/`-`/`_`.
- Email always remains a valid kiosk identifier.
- Disabling kiosk access does not affect private app access.
- An administrator can also reset a kiosk PIN if necessary.

A registered user can therefore choose phone GPS clocking or a trusted RCG kiosk. Using a kiosk is suitable when the phone is unavailable or the user prefers not to grant phone location permission.

## Visitors and one-off volunteers

An enrolled kiosk offers three routes:

- **Staff / regular volunteer** — registered account, email/short code + PIN.
- **Volunteering today** — one-off/corporate/course/occasional volunteer. Creates or reuses an attendance-only volunteer record. These sessions count toward volunteer hours.
- **Visiting RCG** — meeting/media/contractor/guest. Creates or reuses an attendance-only visitor record. These sessions contribute to safety presence but not volunteer-hour totals.

Attendance-only people have no Auth account, password, app login, kiosk PIN or push-notification path.

When a name already exists, the kiosk shows matching attendance-only records so the same person can reuse their previous record. Duplicate names remain allowed for genuinely different people.

If a one-off volunteer becomes regular, open their person record under **Admin → Manage people** and use **Promote to registered account**. This creates the Auth account on the same profile ID, retaining all historic attendance.

## Account lifecycle

Full app accounts are created/approved by RCG administrators rather than by public self-registration.

- **Active** — normal private app/kiosk access.
- **Close access** — the profile becomes inactive, blocking app use and kiosk authentication while retaining attendance history.
- **Reactivate** — restores the existing person/account.
- Attendance-only people are **Archived** rather than given or closing login access.

Use permanent deletion only for exceptional owner-approved cases; normal departures should use Close access/Archive.
