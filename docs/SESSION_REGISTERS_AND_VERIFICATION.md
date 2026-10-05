# Session registers and location verification

This change extends the existing PWA with shared verification reporting and a separate client attendance module. The panic alarm is outside this implementation pending an agreed response procedure.

## Verification behaviour

Clock-in retains its immediate GPS or trusted-kiosk evidence. If it is not verified, the active app retries approximately once per minute until first on-site verification or clock-out. First verification is retained even if a subsequent reading is unavailable or outside the boundary. Kiosk and administrator clocking remain distinct evidence sources.

Clock-out saves immediately through an authenticated RPC. A separate GPS request then records the initial departure reading. If an accurate reading confirms outside the boundary, the departure milestone completes and checks stop. Otherwise, the active app retries approximately once per minute for up to 15 minutes from clock-out. Closing, hiding or locking the app interrupts location acquisition; this is a best-effort PWA feature, not background tracking. Clocking out while still inside the garden is valid.

Account settings offer a separate, default-off option for approximately 15-minute checks during an open attendance session. Only the account holder can change this preference. The database checks the current preference and rate-limits periodic submissions. Disabling it prevents further periodic submissions, including from a stale second tab. Retries around clock-in/out are explained separately from this option.

History and admin reports display three milestones: on site at clock-in, on-site presence verified at any point, and off-site departure verified. Successful clock-in establishes both arrival milestones. Departure verification can be immediate or within the subsequent window, with the timestamp and source described on expansion. Latest location evidence is shown separately. Green means confirmed, amber uncertain, grey unavailable/not applicable, and red an outside-site clock-in or unconfirmed presence with outside-site evidence. Colours also have text labels. New readings require usable accuracy even when the reported centre point lies inside the boundary; historical evidence is not reclassified.

No raw coordinate trail is retained. Location absence or uncertainty never cancels attendance, changes recorded hours or automatically clocks someone out. Derived location is evidence supplied by a device, not proof against spoofing or proof of continuous presence.

## Register access and directories

Attendance classification (registered person, employee, volunteer) is separate from professional account type and register permissions. Standard accounts have no register access. An owner assigns therapist/session practitioner, senior manager or company owner classification. Classification alone gives no access to client data: eligible accounts still need explicit programme/session assignments or the owner-granted global register-manager capability. Owner access is built in; clocking administrator/developer roles do not grant register access. User management shows the distinction and permits owner-only changes. Changing to Standard immediately removes programme/session grants and global manager capability. Existing assignments are preserved during migration; no previously unassigned account gains access.

Programme roles remain coordinator (schedule/allocated roster/lead assignments/attendance), lead (attendance), viewer (read authorised attendance and reports). Register managers alone manage full names and contact routing. RLS and authenticated RPC checks enforce this independently of navigation. Direct client-role writes and calls to legacy private mutation implementations are denied.

The registers area has Programmes & Sessions, Client Directory, and School/Carer Directory sections. Only managers see the directories. Clients retain internal full names and outward display names, with editable details and active status. Schools/carers have reusable name, type, email, phone and active status. Client/contact links can be edited from either directory; several links per client are supported. A disabled link can be re-enabled after address and sharing-authority verification. Contact email changes require verification and block unsent messages to previous routing, with reviewed regeneration available. Disabled clients, parties and links cannot receive notifications. Names and verification references must not contain case notes.

Programmes preserve weekly/fortnightly schedules, UK times, excluded dates, enrolment windows and reviewed generation. Dated registers retain roster/schedule snapshots. Programme changes affect subsequent generation, never silently rewrite existing registers. Recorded rosters are locked. Permissions and changes are audited; stale revisions reject conflicting saves.

## Live attendance and notifications

Present (tick), Absent (circle), and Excused (dash) replace the status dropdown. Present/Absent save the current UK date/time; Excused clears and disables observed times and never generates an email. Tapping the selected status clears it. Arrival/attendance and departure time edits are explicitly saved; changes retain old/new attendance in the audit. Leads may correct observations on their assigned registers, including after previous notifications were sent. Status/departure mutations save transactionally and synchronise notifications immediately without waiting for a whole-register confirmation. Partial registers retain unmarked rows as pending in reports. Taking attendance before the scheduled start is prevented.

A departure control records or clears a present attendee's observed departure. Mark-all departure applies one timestamp to currently present attendees without an existing departure, preserving earlier individual departure times. Times remain editable. Departure requires arrival and cannot precede it; observed times cannot be in the future.

Each client-contact link separately opts into attendance/arrival (and optional absence), departure, both, or neither. The register shows routing/preferences to authorised takers; viewers cannot see recipient details or notification payloads. One contact receives only its linked client's display name and neutral session label.

Unattempted pending notifications are updated in place. Attempted messages keep immutable provider idempotency keys and are superseded when their observations change. Changed already-sent events generate a new update notification. Departure-only contacts do not receive arrival messages; arrival-only contacts do not receive departures. Excused suppresses both streams even after an earlier notification. Clearing an already-sent attendance/departure produces an update when the matching notification preference permits it. Sent email cannot be recalled. Selected attendees can regenerate notification streams explicitly. Notification history distinguishes attendance/departure, update flag and provider status.

The authenticated email worker rechecks current register permission, client, party, link, email and event preferences before sending. Delivery remains fail-closed unless the database switch, Edge environment switch, API key and verified sender are configured. Email wording reports an observation rather than live presence. Provider acceptance is not proof of delivery/read receipt. Atomic claims, bounded retries and provider idempotency remain in place; batches contain up to 50 jobs and larger queues need additional processing. Automated timed retries and delivery/bounce webhooks are not included.

## Mobile presence

The on-site page presents live presence before admin attendance controls on mobile. Desktop keeps the previous order. Register rows use mobile cards with labelled UK times and accessible status/departure controls.

## Reporting

Register reports search people/session names and filter dates, person and status. Managers see full names; assigned leads see display names within authorised sessions. Reports include scheduled and observed times and export the authorised records to CSV. Totals count confirmed present/late as attended, confirmed absent as missed, and excused separately. Cancelled sessions are excluded. Draft/unmarked entries are pending. Attendance percentage is attended divided by attended plus missed. Reports are limited to 5,000 records and flag when the range must be narrowed.

## Deployment and handover

On 4 October 2026, the verification, register, programme and delivery-gate migrations were applied to the RCG Supabase project, and `register-notifications` version 2 was deployed with JWT verification enabled. The database delivery switch is confirmed false. A live SQL smoke test ran using fictitious users/clients inside a transaction and rolled everything back. No test users, clients, registers or notification jobs remain; existing clocking records were not edited. Signed-in browser checks subsequently verified the deployed register/programme/report/account screens and retained September on-site milestones. Real phone GPS testing remains outstanding.

1. For another environment, apply the four new timestamped migrations in order, **before** deploying the frontend that selects their columns. Existing numbered legacy files correspond to older, already applied production migrations; do not replay them or run an unreviewed wholesale database push.
2. Deploy `register-notifications`, including `_shared/register-email.ts` and its pinned import map, with JWT verification enabled.
3. Reuse the existing Resend account/API key and configure `REGISTER_FROM_EMAIL` with a verified sender. Leave `REGISTER_EMAIL_ENABLED` unset/false and `settings.register_email_enabled=false` initially. Both switches must be explicitly enabled after test-inbox review.
4. Deploy the frontend preview and test with fictitious clients, an explicitly approved test inbox, leads and unrelated users. Check phone GPS on site and outside the boundary, active/hidden app behaviour and timed expiry.
5. Enable register email delivery only after the approved-contact workflow and template are accepted. Do not use real schools/carers for testing.
6. Owner grants manager capabilities; managers create programmes, allocate clients and assign coordinators/leads/viewers; coordinators review and generate dated registers.

RCG still needs to agree purpose, sharing authority, privacy information and retention periods before storing real client records. This version does not automatically delete attendance or audit data; retention must be agreed before an automated policy is added. Location monitoring remains supplementary, and a panic/assistance feature requires its own responder and escalation design.

## Validation

`npm test` runs logic tests and the actual new migration SQL in isolated PGlite/Postgres against a fixture matching the existing columns. Tests cover ownership, current user opt-in, rate limits, departure expiry, retained first verification, RLS, lead isolation, developer exclusion, approved-contact checks, stale revisions, transactionally queued minimal notifications, manager corrections, queue claim deduplication and individual roster limits. This does not substitute for a deployment test against Supabase's API/Auth/Edge runtime or real GPS hardware.

Programme validation additionally exercises scoped coordinator/lead/viewer access, permission revocation, independent manager grants, enrolment snapshots, duplicate generation, excluded dates and UK DST.

The privileged live smoke test is in `supabase/tests/register_rollout_smoke.sql`. It requires delivery to be paused, exercises real Supabase table permissions/RPCs with temporary synthetic Auth/profile fixtures, and rolls back the entire transaction. It does not exercise browser login or invoke the email provider.

## October 2026 usage-feedback update

The additional migration is `20261005091202_register_directories_and_live_attendance.sql`. Apply it before the new frontend, then deploy the notification worker with its shared email module. Keep register email delivery paused until a controlled inbox test is completed. Automated tests exercise the old migration sequence plus the new migration, professional eligibility, permission revocation, linked directories, pending-payload updates, sent corrections, separate event preferences and email wording. Real phone GPS checks and delivery/read outcomes remain outside these automated checks.

On 5 October 2026 the directories/live-attendance migration was applied, `register-notifications` v3 deployed, and the transactional live workflow smoke test passed with all fixtures rolled back. Existing client/session counts remained unchanged and email sending stayed paused.
