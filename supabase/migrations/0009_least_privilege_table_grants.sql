-- RCG Clocking App
-- Remove legacy broad table grants from the early schema and restore only the
-- privileges required by the approved RLS/Edge Function architecture.

revoke all on public.profiles from anon, authenticated;
revoke all on public.sessions from anon, authenticated;
revoke all on public.settings from anon, authenticated;
revoke all on public.alert_recipients from anon, authenticated;
revoke all on public.pin_credentials from anon, authenticated;
revoke all on public.kiosk_events from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;

-- Signed-in users need to resolve their own profile; RLS controls row visibility.
grant select on public.profiles to authenticated;

-- Normal clocking uses direct RLS-protected session reads/inserts and a limited
-- clock-out update. Privileged corrections use the admin-session Edge Function.
grant select on public.sessions to authenticated;
grant insert (profile_id, clock_in_at, clock_in_method) on public.sessions to authenticated;
grant update (clock_out_at, clock_out_method) on public.sessions to authenticated;

-- Operational configuration remains admin-like through RLS.
grant select, update on public.settings to authenticated;
grant select, insert, update, delete on public.alert_recipients to authenticated;

-- PIN hashes remain service-role only. Operational logs are read-only to
-- authorised admin-like users through RLS.
grant select on public.kiosk_events to authenticated;
grant select on public.audit_log to authenticated;

-- Reporting views remain available only after sign-in; their underlying helper
-- functions and RLS/capability checks enforce row/capability access.
revoke all on public.current_on_site_view from anon;
revoke all on public.user_hours_summary_view from anon;
grant select on public.current_on_site_view to authenticated;
grant select on public.user_hours_summary_view to authenticated;
