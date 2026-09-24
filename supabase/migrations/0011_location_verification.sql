-- RCG Clocking App
-- Location verification for clock-in and first verified arrival.
-- Stores only derived distance/accuracy evidence, not raw latitude/longitude trails.

alter table public.settings
  add column if not exists site_latitude double precision,
  add column if not exists site_longitude double precision,
  add column if not exists site_geofence_radius_m integer not null default 70,
  add column if not exists site_location_accuracy_limit_m integer not null default 100;

-- Redcatch Community Garden / former bowling green centre.
-- Public map reference used for the initial configuration: 51.43362, -2.57128.
update public.settings
set
  site_latitude = coalesce(site_latitude, 51.43362),
  site_longitude = coalesce(site_longitude, -2.57128),
  site_geofence_radius_m = coalesce(site_geofence_radius_m, 70),
  site_location_accuracy_limit_m = coalesce(site_location_accuracy_limit_m, 100)
where id = 1;

alter table public.sessions
  add column if not exists clock_in_location_status text not null default 'location_unavailable',
  add column if not exists clock_in_distance_m integer,
  add column if not exists clock_in_accuracy_m integer,
  add column if not exists first_on_site_verified_at timestamptz,
  add column if not exists first_on_site_verification_method text,
  add column if not exists last_presence_check_at timestamptz,
  add column if not exists last_presence_distance_m integer,
  add column if not exists last_presence_accuracy_m integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_clock_in_location_status_chk'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_clock_in_location_status_chk
      check (clock_in_location_status in (
        'on_site_verified',
        'kiosk_verified',
        'outside_site',
        'near_boundary',
        'location_uncertain',
        'location_unavailable'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_first_on_site_verification_method_chk'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_first_on_site_verification_method_chk
      check (
        first_on_site_verification_method is null
        or first_on_site_verification_method in ('gps','kiosk')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_geofence_radius_chk'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_geofence_radius_chk
      check (site_geofence_radius_m between 10 and 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_location_accuracy_limit_chk'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_location_accuracy_limit_chk
      check (site_location_accuracy_limit_m between 10 and 1000);
  end if;
end $$;

create schema if not exists private;

create or replace function private.classify_site_location(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision
)
returns table (
  location_status text,
  distance_outside_m integer,
  reported_accuracy_m integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_site_lat double precision;
  v_site_lon double precision;
  v_radius integer;
  v_accuracy_limit integer;
  v_center_distance double precision;
  v_outside_distance double precision;
  v_accuracy integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_latitude is null or p_longitude is null then
    return query select 'location_unavailable'::text, null::integer, null::integer;
    return;
  end if;

  if p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid location coordinates';
  end if;

  select
    s.site_latitude,
    s.site_longitude,
    s.site_geofence_radius_m,
    s.site_location_accuracy_limit_m
  into v_site_lat, v_site_lon, v_radius, v_accuracy_limit
  from public.settings s
  where s.id = 1;

  if v_site_lat is null or v_site_lon is null then
    return query select
      'location_unavailable'::text,
      null::integer,
      case when p_accuracy_m is null then null else greatest(0, round(p_accuracy_m)::integer) end;
    return;
  end if;

  v_center_distance :=
    6371000.0 * 2.0 * asin(
      sqrt(
        power(sin(radians(p_latitude - v_site_lat) / 2.0), 2)
        + cos(radians(v_site_lat))
        * cos(radians(p_latitude))
        * power(sin(radians(p_longitude - v_site_lon) / 2.0), 2)
      )
    );

  v_outside_distance := greatest(0.0, v_center_distance - v_radius);
  v_accuracy := case
    when p_accuracy_m is null then null
    else greatest(0, round(p_accuracy_m)::integer)
  end;

  if v_center_distance <= v_radius then
    return query select 'on_site_verified'::text, 0, v_accuracy;
  elsif v_accuracy is null then
    return query select 'outside_site'::text, round(v_outside_distance)::integer, null::integer;
  elsif v_accuracy > v_accuracy_limit then
    return query select 'location_uncertain'::text, round(v_outside_distance)::integer, v_accuracy;
  elsif v_outside_distance <= v_accuracy then
    return query select 'near_boundary'::text, round(v_outside_distance)::integer, v_accuracy;
  else
    return query select 'outside_site'::text, round(v_outside_distance)::integer, v_accuracy;
  end if;
end;
$$;

revoke all on function private.classify_site_location(double precision,double precision,double precision) from public;
grant usage on schema private to authenticated;
grant execute on function private.classify_site_location(double precision,double precision,double precision) to authenticated;

create or replace function private.clock_in_with_location(
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m double precision default null
)
returns table (
  session_id uuid,
  location_status text,
  distance_outside_m integer,
  reported_accuracy_m integer,
  first_on_site_verified_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_existing public.sessions%rowtype;
  v_status text;
  v_distance integer;
  v_accuracy integer;
  v_now timestamptz := now();
  v_session_id uuid;
  v_verified_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select p.id
  into v_profile_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.is_active = true
    and p.archived_at is null;

  if v_profile_id is null then
    raise exception 'Active profile not found';
  end if;

  select s.*
  into v_existing
  from public.sessions s
  where s.profile_id = v_profile_id
    and s.clock_out_at is null
  order by s.clock_in_at desc
  limit 1;

  if v_existing.id is not null then
    return query select
      v_existing.id,
      v_existing.clock_in_location_status,
      v_existing.clock_in_distance_m,
      v_existing.clock_in_accuracy_m,
      v_existing.first_on_site_verified_at;
    return;
  end if;

  select c.location_status, c.distance_outside_m, c.reported_accuracy_m
  into v_status, v_distance, v_accuracy
  from private.classify_site_location(p_latitude, p_longitude, p_accuracy_m) c;

  if v_status = 'on_site_verified' then
    v_verified_at := v_now;
  end if;

  insert into public.sessions (
    profile_id,
    clock_in_at,
    clock_in_method,
    clock_in_location_status,
    clock_in_distance_m,
    clock_in_accuracy_m,
    first_on_site_verified_at,
    first_on_site_verification_method,
    last_presence_check_at,
    last_presence_distance_m,
    last_presence_accuracy_m
  ) values (
    v_profile_id,
    v_now,
    'web'::public.clock_method,
    coalesce(v_status, 'location_unavailable'),
    v_distance,
    v_accuracy,
    v_verified_at,
    case when v_verified_at is not null then 'gps' else null end,
    case when p_latitude is not null and p_longitude is not null then v_now else null end,
    v_distance,
    v_accuracy
  )
  returning id into v_session_id;

  return query select v_session_id, v_status, v_distance, v_accuracy, v_verified_at;
end;
$$;

revoke all on function private.clock_in_with_location(double precision,double precision,double precision) from public;
grant execute on function private.clock_in_with_location(double precision,double precision,double precision) to authenticated;

create or replace function public.clock_in_with_location(
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m double precision default null
)
returns table (
  session_id uuid,
  location_status text,
  distance_outside_m integer,
  reported_accuracy_m integer,
  first_on_site_verified_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from private.clock_in_with_location(p_latitude, p_longitude, p_accuracy_m)
$$;

revoke all on function public.clock_in_with_location(double precision,double precision,double precision) from public, anon;
grant execute on function public.clock_in_with_location(double precision,double precision,double precision) to authenticated;

create or replace function private.record_presence_check(
  p_session_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision
)
returns table (
  location_status text,
  distance_outside_m integer,
  reported_accuracy_m integer,
  verified_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_status text;
  v_distance integer;
  v_accuracy integer;
  v_verified timestamptz;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select p.id
  into v_profile_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.is_active = true
    and p.archived_at is null;

  if v_profile_id is null then
    raise exception 'Active profile not found';
  end if;

  if not exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and s.profile_id = v_profile_id
      and s.clock_out_at is null
  ) then
    raise exception 'Open session not found';
  end if;

  select c.location_status, c.distance_outside_m, c.reported_accuracy_m
  into v_status, v_distance, v_accuracy
  from private.classify_site_location(p_latitude, p_longitude, p_accuracy_m) c;

  update public.sessions s
  set
    last_presence_check_at = v_now,
    last_presence_distance_m = v_distance,
    last_presence_accuracy_m = v_accuracy,
    first_on_site_verified_at = case
      when v_status = 'on_site_verified' and s.first_on_site_verified_at is null then v_now
      else s.first_on_site_verified_at
    end,
    first_on_site_verification_method = case
      when v_status = 'on_site_verified' and s.first_on_site_verified_at is null then 'gps'
      else s.first_on_site_verification_method
    end
  where s.id = p_session_id
    and s.profile_id = v_profile_id
    and s.clock_out_at is null
  returning s.first_on_site_verified_at into v_verified;

  return query select v_status, v_distance, v_accuracy, v_verified;
end;
$$;

revoke all on function private.record_presence_check(uuid,double precision,double precision,double precision) from public;
grant execute on function private.record_presence_check(uuid,double precision,double precision,double precision) to authenticated;

create or replace function public.record_presence_check(
  p_session_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision
)
returns table (
  location_status text,
  distance_outside_m integer,
  reported_accuracy_m integer,
  verified_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from private.record_presence_check(p_session_id, p_latitude, p_longitude, p_accuracy_m)
$$;

revoke all on function public.record_presence_check(uuid,double precision,double precision,double precision) from public, anon;
grant execute on function public.record_presence_check(uuid,double precision,double precision,double precision) to authenticated;

-- Browser clock-ins now go through the controlled RPC so location evidence cannot be
-- silently omitted by directly inserting a normal web session through the Data API.
revoke insert on public.sessions from authenticated;

drop view if exists public.current_on_site_view;
drop function if exists public.authorized_current_on_site_rows();

create function public.authorized_current_on_site_rows()
returns table (
  session_id uuid,
  profile_id uuid,
  full_name text,
  role public.app_role,
  clock_in_at timestamptz,
  duration_minutes integer,
  clock_in_location_status text,
  clock_in_distance_m integer,
  clock_in_accuracy_m integer,
  first_on_site_verified_at timestamptz,
  first_on_site_verification_method text,
  last_presence_check_at timestamptz,
  last_presence_distance_m integer,
  last_presence_accuracy_m integer,
  presence_state text
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
    round(extract(epoch from (now() - s.clock_in_at)) / 60.0)::int,
    s.clock_in_location_status,
    s.clock_in_distance_m,
    s.clock_in_accuracy_m,
    s.first_on_site_verified_at,
    s.first_on_site_verification_method,
    s.last_presence_check_at,
    s.last_presence_distance_m,
    s.last_presence_accuracy_m,
    case
      when s.first_on_site_verified_at is not null
        or s.clock_in_location_status in ('on_site_verified','kiosk_verified')
        then 'verified_on_site'
      when s.clock_in_location_status = 'outside_site' then 'outside_site'
      else 'unverified'
    end
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

create view public.current_on_site_view
with (security_invoker = true)
as
select * from public.authorized_current_on_site_rows();

revoke all on public.current_on_site_view from anon;
grant select on public.current_on_site_view to authenticated;
