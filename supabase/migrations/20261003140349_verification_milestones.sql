-- Derived evidence only; no raw coordinate trail is stored.
alter table public.profiles add column if not exists periodic_location_checks boolean not null default false;
alter table public.sessions
 add column if not exists clock_out_location_status text,
 add column if not exists clock_out_accuracy_m integer,
 add column if not exists first_off_site_verified_at timestamptz,
 add column if not exists last_location_status text,
 add column if not exists last_periodic_check_at timestamptz;

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

  if p_accuracy_m is not null and (p_accuracy_m < 0 or p_accuracy_m > 1000000 or p_accuracy_m = 'NaN'::float8) then
    return query select 'location_uncertain'::text, null::integer, null::integer;
    return;
  end if;

  if p_latitude is null or p_longitude is null then
    return query select 'location_unavailable'::text, null::integer, null::integer;
    return;
  end if;

  if p_latitude = 'NaN'::float8 or p_longitude = 'NaN'::float8 or p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
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
      case when p_accuracy_m is null or p_accuracy_m < 0 or p_accuracy_m > 1000000 or p_accuracy_m = 'NaN'::float8 then null else greatest(0, round(p_accuracy_m)::integer) end;
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
    when p_accuracy_m is null or p_accuracy_m < 0 or p_accuracy_m > 1000000 or p_accuracy_m = 'NaN'::float8 then null
    else greatest(0, round(p_accuracy_m)::integer)
  end;

  if p_accuracy_m is null or p_accuracy_m < 0 or p_accuracy_m > v_accuracy_limit or p_accuracy_m = 'NaN'::float8 then
    return query select 'location_uncertain'::text, round(v_outside_distance)::integer, null::integer;
    return;
  end if;

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


create or replace function private.set_location_check_preference(p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 select id into v_id from public.profiles where user_id = auth.uid() and is_active and archived_at is null;
 if v_id is null or p_enabled is null then raise exception 'Active account required'; end if;
 update public.profiles set periodic_location_checks = p_enabled where id = v_id;
 insert into public.audit_log(performed_by_profile_id,action,target_profile_id,metadata)
 values(v_id,'location_check_preference',v_id,jsonb_build_object('enabled',p_enabled));
end $$;
revoke all on function private.set_location_check_preference(boolean) from public;
grant execute on function private.set_location_check_preference(boolean) to authenticated;
create or replace function public.set_location_check_preference(p_enabled boolean)
returns void language sql security invoker set search_path = '' as $$ select private.set_location_check_preference(p_enabled) $$;
revoke all on function public.set_location_check_preference(boolean) from public,anon;
grant execute on function public.set_location_check_preference(boolean) to authenticated;

create or replace function private.record_session_location(
 p_session_id uuid, p_phase text, p_latitude double precision default null,
 p_longitude double precision default null, p_accuracy_m double precision default null)
returns table(location_status text, verified_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_profile public.profiles%rowtype; v_session public.sessions%rowtype;
 v_status text; v_distance int; v_accuracy int; v_now timestamptz := now(); v_verified timestamptz;
begin
 select * into v_profile from public.profiles where user_id = auth.uid() and is_active and archived_at is null;
 if v_profile.id is null then raise exception 'Active account required'; end if;
 select * into v_session from public.sessions where id = p_session_id and profile_id = v_profile.id for update;
 if v_session.id is null then raise exception 'Session not found'; end if;
 if p_phase not in ('arrival','periodic','clock_out','departure') or p_phase is null then raise exception 'Invalid check phase'; end if;
 if p_phase in ('clock_out','departure') then
   if v_session.clock_out_at is null or v_session.clock_out_method <> 'web'
      or v_session.clock_out_at < v_now - interval '15 minutes' then raise exception 'Departure check window has ended'; end if;
   if v_session.first_off_site_verified_at is not null then
     return query select 'outside_site'::text,v_session.first_off_site_verified_at; return;
   end if;
 else
   if v_session.clock_out_at is not null then raise exception 'Open session required'; end if;
   if p_phase = 'arrival' and v_session.first_on_site_verified_at is not null then
     return query select 'on_site_verified'::text,v_session.first_on_site_verified_at; return;
   end if;
   if p_phase = 'periodic' then
     if not v_profile.periodic_location_checks then raise exception 'Periodic checks are disabled'; end if;
     if v_session.last_periodic_check_at > v_now - interval '15 minutes' then raise exception 'Periodic check not due'; end if;
   end if;
 end if;
 select c.location_status,c.distance_outside_m,c.reported_accuracy_m into v_status,v_distance,v_accuracy
 from private.classify_site_location(p_latitude,p_longitude,p_accuracy_m) c;
 if p_phase in ('clock_out','departure') then
   update public.sessions set
     clock_out_location_status = case when p_phase = 'clock_out' then coalesce(clock_out_location_status,v_status) else clock_out_location_status end,
     clock_out_accuracy_m = case when p_phase = 'clock_out' and clock_out_location_status is null then v_accuracy else clock_out_accuracy_m end,
     first_off_site_verified_at = case when v_status = 'outside_site' then v_now else first_off_site_verified_at end,
     last_location_status = v_status,last_presence_check_at = v_now,
     last_presence_accuracy_m = v_accuracy,last_presence_distance_m = v_distance
   where id = p_session_id returning first_off_site_verified_at into v_verified;
 else
   update public.sessions set
     last_location_status = v_status,last_presence_check_at = v_now,
     last_presence_accuracy_m = v_accuracy,last_presence_distance_m = v_distance,
     last_periodic_check_at = case when p_phase = 'periodic' then v_now else last_periodic_check_at end,
     current_presence_status = case when v_status = 'on_site_verified' then 'on_site' when v_status = 'outside_site' then 'off_site' else 'unverified' end,
     current_presence_status_at = v_now,current_presence_source = 'gps',
     first_on_site_verified_at = case when v_status = 'on_site_verified' then coalesce(first_on_site_verified_at,v_now) else first_on_site_verified_at end,
     first_on_site_verification_method = case when v_status = 'on_site_verified' then coalesce(first_on_site_verification_method,'gps') else first_on_site_verification_method end
   where id = p_session_id returning first_on_site_verified_at into v_verified;
 end if;
 return query select v_status,v_verified;
end $$;
revoke all on function private.record_session_location(uuid,text,double precision,double precision,double precision) from public;
grant execute on function private.record_session_location(uuid,text,double precision,double precision,double precision) to authenticated;
create or replace function public.record_session_location(p_session_id uuid,p_phase text,
 p_latitude double precision default null,p_longitude double precision default null,p_accuracy_m double precision default null)
returns table(location_status text,verified_at timestamptz)
language sql security invoker set search_path = '' as $$ select * from private.record_session_location(p_session_id,p_phase,p_latitude,p_longitude,p_accuracy_m) $$;
revoke all on function public.record_session_location(uuid,text,double precision,double precision,double precision) from public,anon;
grant execute on function public.record_session_location(uuid,text,double precision,double precision,double precision) to authenticated;

create or replace function private.clock_out_for_verification()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_profile uuid; v_session uuid;
begin
 select id into v_profile from public.profiles where user_id = auth.uid() and is_active and archived_at is null;
 if v_profile is null then raise exception 'Active account required'; end if;
 select id into v_session from public.sessions where profile_id = v_profile and clock_out_at is null for update;
 if v_session is null then return null; end if;
 update public.sessions set clock_out_at = now(),clock_out_method = 'web'::public.clock_method,
   current_presence_status = 'off_site',current_presence_status_at = now(),current_presence_source = 'clock_out'
 where id = v_session;
 return v_session;
end $$;
revoke all on function private.clock_out_for_verification() from public;
grant execute on function private.clock_out_for_verification() to authenticated;
create or replace function public.clock_out_for_verification()
returns uuid language sql security invoker set search_path = '' as $$ select private.clock_out_for_verification() $$;
revoke all on function public.clock_out_for_verification() from public,anon;
grant execute on function public.clock_out_for_verification() to authenticated;
