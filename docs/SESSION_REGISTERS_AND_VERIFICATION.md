# Session registers and location verification

This change extends the existing PWA with shared verification reporting and a separate client attendance module. The panic alarm is outside this implementation pending an agreed response procedure.

## Verification behaviour

Clock-in retains its immediate GPS or trusted-kiosk evidence. If it is not verified, the active app retries approximately once per minute until first on-site verification or clock-out. First verification is retained even if a subsequent reading is unavailable or outside the boundary. Kiosk and administrator clocking remain distinct evidence sources.

Clock-out saves immediately through an authenticated RPC. A separate GPS request then records the initial departure reading. If an accurate reading confirms outside the boundary, the departure milestone completes and checks stop. Otherwise, the active app retries approximately once per minute for up to 15 minutes from clock-out. Closing, hiding or locking the app interrupts location acquisition; this is a best-effort PWA feature, not background tracking. Clocking out while still inside the garden is valid.

Account settings offer a separate, default-off option for approximately 15-minute checks during an open attendance session. Only the account holder can change this preference. The database checks the current preference and rate-limits periodic submissions. Disabling it prevents further periodic submissions, including from a stale second tab. Retries around clock-in/out are explained separately from this option.

History and admin reports display three milestones: on site at clock-in, on-site presence verified at any point, and off-site departure verified. Successful clock-in establishes both arrival milestones. Departure verification can be immediate or within the subsequent window, with the timestamp and source described on expansion. Latest location evidence is shown separately. Green means confirmed, amber uncertain, grey unavailable/not applicable, and red an outside-site clock-in or unconfirmed presence with outside-site evidence. Colours also have text labels. New readings require usable accuracy even when the reported centre point lies inside the boundary; historical evidence is not reclassified.

No raw coordinate trail is retained. Location absence or uncertainty never cancels attendance, changes recorded hours or automatically clocks someone out. Derived location is evidence supplied by a device, not proof against spoofing or proof of continuous presence.

## Register access

Client records are separate from login profiles and staff clocking sessions. Owner access is built in. Administrators need the explicit `can_manage_registers` capability, assigned by the owner. A developer role does not grant client access automatically. An assigned lead can read and take only their assigned registers and receives display names with internal references, not full client directory access. All permissions are enforced in Postgres, in addition to the UI.

Managers create individual/group sessions, enrol expected attendees and assign leads. Individual sessions allow one expected attendee. Expected attendees allow genuine missed-session counting. A client can have several approved school/carer contacts; each contact is linked to that client rather than to an entire group. Approval records who verified the address and sharing authority, when and the verification reference. Turning a contact off blocks outstanding notifications. Names, session labels and approval/correction references must not contain clinical or safeguarding notes.

## Attendance and notification workflow

1. Manager creates a session and expected roster, then assigns leads.
2. Lead records present, late, absent, excused or unmarked. Optional observed arrival/departure times are separate from scheduled times and cannot be in the future.
3. Save attendance draft. No emails are queued at this step.
4. Review saved status and approved recipients. Unsaved changes hide the confirmation controls. The database rejects stale revisions and incomplete registers.
5. Confirm attendance and notify. The transaction confirms the register and creates one durable notification per linked client/contact. Each email contains only that client's display name, a neutral external session label, scheduled times, recorded attendance and any observed times.
6. The email worker checks authenticated register access, claims jobs atomically, rechecks approved routing and submits them to Resend. Sending is disabled unless `REGISTER_EMAIL_ENABLED=true` and a verified sender is configured.

Present/late notifications are included by default. Absence notifications require explicit approval per contact. Excused absences are not ordinarily emailed. If an earlier notification was sent, a subsequent manager correction also notifies that recipient even if the corrected status is absent or excused. Corrections require a reason and preserve old/new attendance in the register audit. Draft corrections supersede earlier unsent notifications; already sent messages cannot be recalled.

Emails say that a client _was recorded_ as attending, not that they are currently there. Abbreviated names are still personal data. There is no authenticated external recipient portal in this version; direct minimal emails use approved contacts. More sensitive session types should use a later secure notification portal or be excluded from direct email.

Queue statuses distinguish pending, sending, provider-accepted sent, failed, blocked and superseded. Provider acceptance does not prove delivery or reading. Each job has a stable provider idempotency key and a first-attempt timestamp. Attempts are capped and retrying stops before the provider's 24-hour idempotency window expires. Pending/failed notifications can be processed from the register page. A batch processes up to 50 jobs; larger batches need another processing run. No automatic timed retry scheduler or delivery/bounce webhook is included in this initial version.

## Reporting

Register reports search people/session names and filter dates, person and status. Managers see full names; assigned leads see display names within authorised sessions. Reports include scheduled and observed times and export the authorised records to CSV. Totals count confirmed present/late as attended, confirmed absent as missed, and excused separately. Cancelled sessions are excluded. Draft/unmarked entries are pending. Attendance percentage is attended divided by attended plus missed. Reports are limited to 5,000 records and flag when the range must be narrowed.

## Deployment and handover

The existing production schema was inspected read-only and matches the prerequisite columns. Production records have not been changed by this build.

1. Apply the two new timestamped migrations in order, **before** deploying the frontend that selects their columns. Existing numbered legacy files correspond to older, already applied production migrations; do not replay them or run an unreviewed wholesale database push.
2. Deploy `register-notifications`, including `_shared/register-email.ts` and its pinned import map, with JWT verification enabled.
3. Reuse the existing Resend account/API key and configure `REGISTER_FROM_EMAIL` with a verified sender. Leave `REGISTER_EMAIL_ENABLED` unset/false initially.
4. Deploy the frontend preview and test with fictitious clients, an explicitly approved test inbox, leads and unrelated users. Check phone GPS on site and outside the boundary, active/hidden app behaviour and timed expiry.
5. Enable register email delivery only after the approved-contact workflow and template are accepted. Do not use real schools/carers for testing.
6. Owner grants manager capabilities and managers assign session leads.

RCG still needs to agree purpose, sharing authority, privacy information and retention periods before storing real client records. This version does not automatically delete attendance or audit data; retention must be agreed before an automated policy is added. Location monitoring remains supplementary, and a panic/assistance feature requires its own responder and escalation design.

## Validation

`npm test` runs logic tests and the actual new migration SQL in isolated PGlite/Postgres against a fixture matching the existing columns. Tests cover ownership, current user opt-in, rate limits, departure expiry, retained first verification, RLS, lead isolation, developer exclusion, approved-contact checks, stale revisions, transactionally queued minimal notifications, manager corrections, queue claim deduplication and individual roster limits. This does not substitute for a deployment test against Supabase's API/Auth/Edge runtime or real GPS hardware.
