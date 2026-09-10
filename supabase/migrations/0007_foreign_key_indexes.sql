-- RCG Clocking App
-- Low-cost indexes recommended by Supabase's database advisor for foreign-key lookups.

create index if not exists alert_recipients_profile_idx
  on public.alert_recipients(profile_id);

create index if not exists audit_log_actor_idx
  on public.audit_log(performed_by_profile_id);

create index if not exists audit_log_target_profile_idx
  on public.audit_log(target_profile_id);

create index if not exists audit_log_target_session_idx
  on public.audit_log(target_session_id);

create index if not exists kiosk_events_profile_idx
  on public.kiosk_events(resolved_profile_id);
