-- RCG Clocking App
-- Follow-up hardening after 0004 alignment.
-- Keeps current-on-site visibility limited to admin-like users or people explicitly granted
-- can_view_currently_on_site, while exposing only the safe display fields defined by the architecture.

-- Schema checks from the approved specification.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_email_chk' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_email_chk check (position('@' in email) > 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_short_code_chk' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_short_code_chk check (short_code is null or length(short_code) between 3 and 12);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'kiosk_events_resolved_profile_id_fkey'
      and conrelid = 'public.kiosk_events'::regclass
  ) then
    alter table public.kiosk_events
      add constraint kiosk_events_resolved_profile_id_fkey
      foreign key (resolved_profile_id) references public.profiles(id) on delete set null;
  end if;
end $$;

-- The MVP archive/reactivate action is intentionally restricted to just these columns.
-- RLS still limits this operation to owner/admin/developer accounts.
grant update (is_active, archived_at) on public.profiles to authenticated;

-- A SECURITY INVOKER view alone cannot expose other users' safe display fields without also
-- granting broader profile-table visibility. Put the capability check inside a tightly scoped
-- SECURITY DEFINER function and return only presence-safe columns, then keep the public view
-- SECURITY INVOKER. PUBLIC execution is revoked and authenticated callers are still gated by
-- can_view_on_site().
create or replace function public.authorized_current_on_site_rows()
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
  where public.can_view_on_site()
    and s.clock_out_at is null
    and p.is_active = true
    and p.archived_at is null
  order by s.clock_in_at asc
$$;

revoke all on function public.authorized_current_on_site_rows() from public;
grant execute on function public.authorized_current_on_site_rows() to authenticated;

drop view if exists public.current_on_site_view;
create view public.current_on_site_view
with (security_invoker = true)
as
select * from public.authorized_current_on_site_rows();

grant select on public.current_on_site_view to authenticated;
