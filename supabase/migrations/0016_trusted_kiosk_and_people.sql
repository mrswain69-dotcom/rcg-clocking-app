-- RCG Clocking App
-- Trusted kiosk devices, person categories and reusable visitor/volunteer attendance records.

alter table public.profiles
  add column if not exists attendance_category text not null default 'registered',
  add column if not exists organisation text;

-- Existing login accounts remain neutral until an administrator classifies them.
update public.profiles
set attendance_category = 'registered'
where profile_type = 'account'
  and attendance_category not in ('registered','employee','regular_volunteer');

-- Existing attendance-only records pre-date visitor/volunteer classification.
update public.profiles
set attendance_category = 'other'
where profile_type = 'attendance_only'
  and attendance_category not in ('one_off_volunteer','visitor','other');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_attendance_category_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_attendance_category_chk
      check (attendance_category in (
        'registered',
        'employee',
        'regular_volunteer',
        'one_off_volunteer',
        'visitor',
        'other'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_category_matches_profile_type_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_category_matches_profile_type_chk
      check (
        (profile_type = 'account' and attendance_category in ('registered','employee','regular_volunteer','other'))
        or
        (profile_type = 'attendance_only' and attendance_category in ('one_off_volunteer','visitor','other'))
      );
  end if;
end $$;

-- Short codes are human identifiers, so uniqueness must be case-insensitive.
drop index if exists public.profiles_short_code_uq;
create unique index if not exists profiles_short_code_lower_uq
  on public.profiles(lower(short_code))
  where short_code is not null;

create index if not exists profiles_attendance_category_active_idx
  on public.profiles(attendance_category, is_active);

create table if not exists public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  token_hash text not null unique,
  is_active boolean not null default true,
  enrolled_by_profile_id uuid references public.profiles(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kiosk_devices_active_idx
  on public.kiosk_devices(is_active, enrolled_at desc);

alter table public.kiosk_devices enable row level security;

drop policy if exists kiosk_devices_admin_select on public.kiosk_devices;
create policy kiosk_devices_admin_select
on public.kiosk_devices for select
to authenticated
using (private.is_admin_like());

revoke all on public.kiosk_devices from anon, authenticated;
grant select on public.kiosk_devices to authenticated;

alter table public.kiosk_events
  add column if not exists kiosk_device_id uuid references public.kiosk_devices(id) on delete set null;

create index if not exists kiosk_events_device_created_idx
  on public.kiosk_events(kiosk_device_id, created_at desc);

drop trigger if exists trg_kiosk_devices_updated_at on public.kiosk_devices;
create trigger trg_kiosk_devices_updated_at
before update on public.kiosk_devices
for each row execute function public.set_updated_at();

-- Rebuild the live view helper with attendance category/organisation.
drop view if exists public.current_on_site_view;
drop function if exists private.authorized_current_on_site_rows();

create function private.authorized_current_on_site_rows()
returns table (
  session_id uuid,
  profile_id uuid,
  full_name text,
  role public.app_role,
  profile_type text,
  attendance_category text,
  organisation text,
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
    p.attendance_category,
    p.organisation,
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
