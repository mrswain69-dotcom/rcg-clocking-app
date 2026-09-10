-- RCG Clocking App
-- Move SECURITY DEFINER authorization helpers out of the exposed public API schema.
-- This preserves the approved RLS model while following current Supabase security guidance.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p where p.user_id = auth.uid()
$$;

create or replace function private.app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = auth.uid()
$$;

create or replace function private.is_admin_like()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.app_role() in ('owner','admin','developer'), false)
$$;

create or replace function private.can_view_on_site()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.is_active = true
      and p.archived_at is null
      and (p.role in ('owner','admin','developer') or p.can_view_currently_on_site = true)
  )
$$;

create or replace function private.authorized_current_on_site_rows()
returns table (
  session_id uuid,
  profile_id uuid,
  full_name text,
  role public.app_role,
  clock_in_at timestamptz,
  duration_minutes integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    p.id,
    p.full_name,
    p.role,
    s.clock_in_at,
    round(extract(epoch from (now() - s.clock_in_at)) / 60.0)::int
  from public.sessions s
  join public.profiles p on p.id = s.profile_id
  where private.can_view_on_site()
    and s.clock_out_at is null
    and p.is_active = true
    and p.archived_at is null
  order by s.clock_in_at asc
$$;

revoke all on all functions in schema private from public;
grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.app_role() to authenticated;
grant execute on function private.is_admin_like() to authenticated;
grant execute on function private.can_view_on_site() to authenticated;
grant execute on function private.authorized_current_on_site_rows() to authenticated;

-- Rebuild dependent policies against the non-exposed helpers.
drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_admin_insert on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists sessions_select_own_admin_or_presence on public.sessions;
drop policy if exists sessions_insert_self on public.sessions;
drop policy if exists sessions_update_self_open_only on public.sessions;
drop policy if exists sessions_admin_all on public.sessions;
drop policy if exists settings_admin_read on public.settings;
drop policy if exists settings_admin_update on public.settings;
drop policy if exists alert_recipients_admin_all on public.alert_recipients;
drop policy if exists audit_log_admin_read on public.audit_log;
drop policy if exists kiosk_events_admin_read on public.kiosk_events;

create policy profiles_select_own_or_admin
on public.profiles for select to authenticated
using (user_id = (select auth.uid()) or private.is_admin_like());

create policy profiles_admin_insert
on public.profiles for insert to authenticated
with check (private.is_admin_like());

create policy profiles_admin_update
on public.profiles for update to authenticated
using (private.is_admin_like())
with check (private.is_admin_like());

create policy sessions_select_own_admin_or_presence
on public.sessions for select to authenticated
using (
  profile_id = private.current_profile_id()
  or private.is_admin_like()
  or (private.can_view_on_site() and clock_out_at is null)
);

create policy sessions_insert_self
on public.sessions for insert to authenticated
with check (
  profile_id = private.current_profile_id()
  and exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.is_active = true and p.archived_at is null
  )
);

create policy sessions_update_self_open_only
on public.sessions for update to authenticated
using (profile_id = private.current_profile_id() and clock_out_at is null)
with check (profile_id = private.current_profile_id());

create policy sessions_admin_all
on public.sessions for all to authenticated
using (private.is_admin_like())
with check (private.is_admin_like());

create policy settings_admin_read
on public.settings for select to authenticated
using (private.is_admin_like());

create policy settings_admin_update
on public.settings for update to authenticated
using (private.is_admin_like())
with check (private.is_admin_like());

create policy alert_recipients_admin_all
on public.alert_recipients for all to authenticated
using (private.is_admin_like())
with check (private.is_admin_like());

create policy audit_log_admin_read
on public.audit_log for select to authenticated
using (private.is_admin_like());

create policy kiosk_events_admin_read
on public.kiosk_events for select to authenticated
using (private.is_admin_like());

-- Rebuild the safe current-presence view against the private gated function.
drop view if exists public.current_on_site_view;
create view public.current_on_site_view
with (security_invoker = true)
as
select * from private.authorized_current_on_site_rows();

revoke all on public.current_on_site_view from anon;
revoke all on public.user_hours_summary_view from anon;
grant select on public.current_on_site_view to authenticated;
grant select on public.user_hours_summary_view to authenticated;

-- Remove the now-obsolete public helper RPC surface.
drop function if exists public.authorized_current_on_site_rows();
drop function if exists public.can_view_on_site();
drop function if exists public.is_admin_like();
drop function if exists public.app_role();
drop function if exists public.current_profile_id();
