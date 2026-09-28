-- RCG Clocking App
-- Admin-entered attendance and attendance-only people.
-- Attendance-only profiles have no Auth account, kiosk access or personal app session.

alter table public.profiles
  alter column user_id drop not null,
  alter column email drop not null,
  add column if not exists profile_type text not null default 'account';

update public.profiles
set profile_type = 'account'
where profile_type is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_profile_type_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_profile_type_chk
      check (profile_type in ('account','attendance_only'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_identity_by_type_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_identity_by_type_chk
      check (
        (profile_type = 'account' and user_id is not null and email is not null)
        or
        (profile_type = 'attendance_only' and user_id is null and email is null)
      );
  end if;
end $$;

create index if not exists profiles_type_active_idx
  on public.profiles(profile_type, is_active);

-- Include profile type in the gated live-presence view so the UI can avoid
-- trying to push presence requests to people who have no app account.
drop view if exists public.current_on_site_view;
drop function if exists private.authorized_current_on_site_rows();

create function private.authorized_current_on_site_rows()
returns table (
  session_id uuid,
  profile_id uuid,
  full_name text,
  role public.app_role,
  profile_type text,
  clock_in_at timestamptz,
  duration_minutes integer,
  clock_in_location_status text,
  clock_in_distance_m integer,
  clock_in_accuracy_m integer,
  first_on_site_verified_at timestamptz,
  first_on_site_verification_method text,
  last_presence_check_at timestamptz,
  current_presence_status text,
  current_presence_status_at timestamptz,
  current_presence_source text,
  presence_state text,
  latest_presence_check_id uuid,
  latest_presence_check_status text,
  latest_presence_check_requested_at timestamptz,
  latest_presence_check_escalated_at timestamptz
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
    p.profile_type,
    s.clock_in_at,
    round(extract(epoch from (now() - s.clock_in_at)) / 60.0)::int,
    s.clock_in_location_status,
    s.clock_in_distance_m,
    s.clock_in_accuracy_m,
    s.first_on_site_verified_at,
    s.first_on_site_verification_method,
    s.last_presence_check_at,
    s.current_presence_status,
    s.current_presence_status_at,
    s.current_presence_source,
    case
      when s.current_presence_status = 'on_site' then 'verified_on_site'
      when s.current_presence_status = 'off_site' then 'outside_site'
      else 'unverified'
    end,
    pc.id,
    pc.status,
    pc.requested_at,
    pc.escalated_at
  from public.sessions s
  join public.profiles p on p.id = s.profile_id
  left join lateral (
    select r.id, r.status, r.requested_at, r.escalated_at
    from public.presence_check_requests r
    where r.session_id = s.id
    order by r.requested_at desc
    limit 1
  ) pc on true
  where private.can_view_on_site()
    and s.clock_out_at is null
    and p.is_active = true
    and p.archived_at is null
  order by s.clock_in_at asc
$$;

revoke all on function private.authorized_current_on_site_rows() from public;
grant execute on function private.authorized_current_on_site_rows() to authenticated;

create view public.current_on_site_view
with (security_invoker = true)
as
select * from private.authorized_current_on_site_rows();

revoke all on public.current_on_site_view from anon;
grant select on public.current_on_site_view to authenticated;
