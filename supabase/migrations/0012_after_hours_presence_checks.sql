-- RCG Clocking App
-- Actionable after-hours presence checks and Web Push subscriptions.
-- Presence checks disclose only on-site / off-site / unavailable state to management.

alter table public.settings
  add column if not exists presence_check_enabled boolean not null default true,
  add column if not exists presence_check_escalation_minutes integer not null default 10,
  add column if not exists vapid_public_key text,
  add column if not exists app_base_url text not null default 'https://rcgclocking.app';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_presence_check_escalation_chk'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_presence_check_escalation_chk
      check (presence_check_escalation_minutes between 1 and 120);
  end if;
end $$;

alter table public.sessions
  add column if not exists current_presence_status text not null default 'unverified',
  add column if not exists current_presence_status_at timestamptz,
  add column if not exists current_presence_source text;

update public.sessions
set
  current_presence_status = case
    when clock_out_at is not null then 'off_site'
    when clock_in_location_status = 'outside_site' then 'off_site'
    when clock_in_location_status in ('on_site_verified','kiosk_verified')
      or first_on_site_verified_at is not null then 'on_site'
    else 'unverified'
  end,
  current_presence_status_at = coalesce(first_on_site_verified_at, last_presence_check_at, clock_in_at),
  current_presence_source = case
    when clock_in_location_status = 'kiosk_verified' then 'kiosk'
    when first_on_site_verified_at is not null or clock_in_location_status = 'on_site_verified' then 'gps'
    when clock_in_location_status = 'outside_site' then 'gps'
    else 'unverified'
  end
where current_presence_status_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_current_presence_status_chk'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_current_presence_status_chk
      check (current_presence_status in ('on_site','off_site','unverified'));
  end if;
end $$;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_active_idx
  on public.push_subscriptions(profile_id, active);

create table if not exists public.presence_check_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  requested_by_profile_id uuid references public.profiles(id) on delete set null,
  request_source text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  notified_at timestamptz,
  notification_channel text,
  responded_at timestamptz,
  resolved_at timestamptz,
  actual_left_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists presence_check_one_unresolved_per_session_idx
  on public.presence_check_requests(session_id)
  where resolved_at is null;

create index if not exists presence_check_profile_requested_idx
  on public.presence_check_requests(profile_id, requested_at desc);

create index if not exists presence_check_pending_idx
  on public.presence_check_requests(requested_at)
  where resolved_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'presence_check_source_chk'
      and conrelid = 'public.presence_check_requests'::regclass
  ) then
    alter table public.presence_check_requests
      add constraint presence_check_source_chk
      check (request_source in ('automatic_after_hours','admin_manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'presence_check_status_chk'
      and conrelid = 'public.presence_check_requests'::regclass
  ) then
    alter table public.presence_check_requests
      add constraint presence_check_status_chk
      check (status in (
        'pending',
        'on_site_verified',
        'outside_site',
        'location_unavailable',
        'user_confirmed_on_site',
        'clocked_out',
        'working_off_site',
        'cancelled'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'presence_check_notification_channel_chk'
      and conrelid = 'public.presence_check_requests'::regclass
  ) then
    alter table public.presence_check_requests
      add constraint presence_check_notification_channel_chk
      check (
        notification_channel is null
        or notification_channel in ('push','email','in_app','push_and_email')
      );
  end if;
end $$;

drop trigger if exists trg_push_subscriptions_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists trg_presence_check_requests_updated_at on public.presence_check_requests;
create trigger trg_presence_check_requests_updated_at
before update on public.presence_check_requests
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.presence_check_requests enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
on public.push_subscriptions for select to authenticated
using (profile_id = private.current_profile_id());

drop policy if exists presence_check_select_own_or_admin on public.presence_check_requests;
create policy presence_check_select_own_or_admin
on public.presence_check_requests for select to authenticated
using (profile_id = private.current_profile_id() or private.is_admin_like());

revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.presence_check_requests from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
grant select on public.presence_check_requests to authenticated;

-- Save/reassign a browser push subscription to the currently signed-in profile.
create or replace function private.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.is_active = true
    and p.archived_at is null;

  if v_profile_id is null then
    raise exception 'Active profile not found';
  end if;

  if p_endpoint is null or length(p_endpoint) < 20
    or p_p256dh is null or length(p_p256dh) < 20
    or p_auth is null or length(p_auth) < 8 then
    raise exception 'Invalid push subscription';
  end if;

  insert into public.push_subscriptions (
    profile_id, endpoint, p256dh, auth, user_agent, active
  ) values (
    v_profile_id, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 500), true
  )
  on conflict (endpoint) do update
  set
    profile_id = excluded.profile_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    active = true,
    last_failure_at = null,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.save_push_subscription(text,text,text,text) from public;
grant execute on function private.save_push_subscription(text,text,text,text) to authenticated;

create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.save_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent)
$$;

revoke all on function public.save_push_subscription(text,text,text,text) from public, anon;
grant execute on function public.save_push_subscription(text,text,text,text) to authenticated;

create or replace function private.disable_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.user_id = (select auth.uid());

  update public.push_subscriptions
  set active = false
  where endpoint = p_endpoint
    and profile_id = v_profile_id;

  return found;
end;
$$;

revoke all on function private.disable_push_subscription(text) from public;
grant execute on function private.disable_push_subscription(text) to authenticated;

create or replace function public.disable_push_subscription(p_endpoint text)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.disable_push_subscription(p_endpoint)
$$;

revoke all on function public.disable_push_subscription(text) from public, anon;
grant execute on function public.disable_push_subscription(text) to authenticated;

-- Public key is deliberately readable by signed-in clients. Private key remains Vault-backed.
create or replace function private.get_push_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.vapid_public_key from public.settings s where s.id = 1
$$;

revoke all on function private.get_push_public_key() from public;
grant execute on function private.get_push_public_key() to authenticated;

create or replace function public.get_push_public_key()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_push_public_key()
$$;

revoke all on function public.get_push_public_key() from public, anon;
grant execute on function public.get_push_public_key() to authenticated;

create or replace function private.get_web_push_private_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'rcg_vapid_private_key'
  limit 1
$$;

revoke all on function private.get_web_push_private_key() from public;
grant usage on schema private to service_role;
grant execute on function private.get_web_push_private_key() to service_role;

create or replace function public.get_web_push_private_key()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_web_push_private_key()
$$;

revoke all on function public.get_web_push_private_key() from public, anon, authenticated;
grant execute on function public.get_web_push_private_key() to service_role;

-- Location response to a presence check. Exact coordinates/distances are not written to the
-- presence-check record or returned to management.
create or replace function private.resolve_presence_check_location(
  p_request_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_session_id uuid;
  v_location_status text;
  v_distance integer;
  v_accuracy integer;
  v_result text;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.is_active = true
    and p.archived_at is null;

  select r.session_id into v_session_id
  from public.presence_check_requests r
  join public.sessions s on s.id = r.session_id
  where r.id = p_request_id
    and r.profile_id = v_profile_id
    and s.clock_out_at is null;

  if v_session_id is null then
    raise exception 'Active presence check not found';
  end if;

  select c.location_status, c.distance_outside_m, c.reported_accuracy_m
  into v_location_status, v_distance, v_accuracy
  from private.classify_site_location(p_latitude, p_longitude, p_accuracy_m) c;

  v_result := case
    when v_location_status = 'on_site_verified' then 'on_site_verified'
    when v_location_status = 'outside_site' then 'outside_site'
    else 'location_unavailable'
  end;

  update public.sessions s
  set
    current_presence_status = case
      when v_result = 'on_site_verified' then 'on_site'
      when v_result = 'outside_site' then 'off_site'
      else 'unverified'
    end,
    current_presence_status_at = v_now,
    current_presence_source = 'presence_check_gps',
    last_presence_check_at = v_now,
    first_on_site_verified_at = case
      when v_result = 'on_site_verified' and s.first_on_site_verified_at is null then v_now
      else s.first_on_site_verified_at
    end,
    first_on_site_verification_method = case
      when v_result = 'on_site_verified' and s.first_on_site_verified_at is null then 'gps'
      else s.first_on_site_verification_method
    end
  where s.id = v_session_id;

  update public.presence_check_requests
  set
    status = v_result,
    responded_at = v_now,
    resolved_at = case when v_result in ('on_site_verified','outside_site') then v_now else null end
  where id = p_request_id;

  return v_result;
end;
$$;

revoke all on function private.resolve_presence_check_location(uuid,double precision,double precision,double precision) from public;
grant execute on function private.resolve_presence_check_location(uuid,double precision,double precision,double precision) to authenticated;

create or replace function public.resolve_presence_check_location(
  p_request_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.resolve_presence_check_location(
    p_request_id, p_latitude, p_longitude, p_accuracy_m
  )
$$;

revoke all on function public.resolve_presence_check_location(uuid,double precision,double precision,double precision) from public, anon;
grant execute on function public.resolve_presence_check_location(uuid,double precision,double precision,double precision) to authenticated;

create or replace function private.resolve_presence_check_clock_out(
  p_request_id uuid,
  p_clock_out_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_session_id uuid;
  v_clock_in_at timestamptz;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.is_active = true
    and p.archived_at is null;

  select r.session_id, s.clock_in_at
  into v_session_id, v_clock_in_at
  from public.presence_check_requests r
  join public.sessions s on s.id = r.session_id
  where r.id = p_request_id
    and r.profile_id = v_profile_id
    and s.clock_out_at is null;

  if v_session_id is null then
    raise exception 'Active presence check not found';
  end if;

  if p_clock_out_at is null
    or p_clock_out_at < v_clock_in_at
    or p_clock_out_at > v_now + interval '5 minutes' then
    raise exception 'Clock-out time is outside the session';
  end if;

  update public.sessions
  set
    clock_out_at = least(p_clock_out_at, v_now),
    clock_out_method = 'web'::public.clock_method,
    current_presence_status = 'off_site',
    current_presence_status_at = least(p_clock_out_at, v_now),
    current_presence_source = 'presence_check_clock_out'
  where id = v_session_id
    and clock_out_at is null;

  update public.presence_check_requests
  set
    status = 'clocked_out',
    responded_at = v_now,
    resolved_at = v_now,
    actual_left_at = least(p_clock_out_at, v_now)
  where id = p_request_id;

  return least(p_clock_out_at, v_now);
end;
$$;

revoke all on function private.resolve_presence_check_clock_out(uuid,timestamptz) from public;
grant execute on function private.resolve_presence_check_clock_out(uuid,timestamptz) to authenticated;

create or replace function public.resolve_presence_check_clock_out(
  p_request_id uuid,
  p_clock_out_at timestamptz
)
returns timestamptz
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.resolve_presence_check_clock_out(p_request_id, p_clock_out_at)
$$;

revoke all on function public.resolve_presence_check_clock_out(uuid,timestamptz) from public, anon;
grant execute on function public.resolve_presence_check_clock_out(uuid,timestamptz) to authenticated;

create or replace function private.resolve_presence_check_working_off_site(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_session_id uuid;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.is_active = true
    and p.archived_at is null;

  select r.session_id into v_session_id
  from public.presence_check_requests r
  join public.sessions s on s.id = r.session_id
  where r.id = p_request_id
    and r.profile_id = v_profile_id
    and s.clock_out_at is null;

  if v_session_id is null then
    raise exception 'Active presence check not found';
  end if;

  update public.sessions
  set
    current_presence_status = 'off_site',
    current_presence_status_at = v_now,
    current_presence_source = 'user_working_off_site'
  where id = v_session_id;

  update public.presence_check_requests
  set
    status = 'working_off_site',
    responded_at = v_now,
    resolved_at = v_now
  where id = p_request_id;

  return true;
end;
$$;

revoke all on function private.resolve_presence_check_working_off_site(uuid) from public;
grant execute on function private.resolve_presence_check_working_off_site(uuid) to authenticated;

create or replace function public.resolve_presence_check_working_off_site(p_request_id uuid)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.resolve_presence_check_working_off_site(p_request_id)
$$;

revoke all on function public.resolve_presence_check_working_off_site(uuid) from public, anon;
grant execute on function public.resolve_presence_check_working_off_site(uuid) to authenticated;

create or replace function private.resolve_presence_check_user_confirmed_on_site(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_session_id uuid;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.is_active = true
    and p.archived_at is null;

  select r.session_id into v_session_id
  from public.presence_check_requests r
  join public.sessions s on s.id = r.session_id
  where r.id = p_request_id
    and r.profile_id = v_profile_id
    and s.clock_out_at is null;

  if v_session_id is null then
    raise exception 'Active presence check not found';
  end if;

  update public.sessions
  set
    current_presence_status = 'on_site',
    current_presence_status_at = v_now,
    current_presence_source = 'user_confirmation'
  where id = v_session_id;

  update public.presence_check_requests
  set
    status = 'user_confirmed_on_site',
    responded_at = v_now,
    resolved_at = v_now
  where id = p_request_id;

  return true;
end;
$$;

revoke all on function private.resolve_presence_check_user_confirmed_on_site(uuid) from public;
grant execute on function private.resolve_presence_check_user_confirmed_on_site(uuid) to authenticated;

create or replace function public.resolve_presence_check_user_confirmed_on_site(p_request_id uuid)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.resolve_presence_check_user_confirmed_on_site(p_request_id)
$$;

revoke all on function public.resolve_presence_check_user_confirmed_on_site(uuid) from public, anon;
grant execute on function public.resolve_presence_check_user_confirmed_on_site(uuid) to authenticated;

-- Keep opportunistic GPS arrival checks in sync with the current presence state.
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

  select p.id into v_profile_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.is_active = true
    and p.archived_at is null;

  if v_profile_id is null then
    raise exception 'Active profile not found';
  end if;

  if not exists (
    select 1 from public.sessions s
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
    current_presence_status = case
      when v_status = 'on_site_verified' then 'on_site'
      when v_status = 'outside_site' then 'off_site'
      else 'unverified'
    end,
    current_presence_status_at = v_now,
    current_presence_source = 'gps',
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

-- Rebuild the clock-in RPC so new sessions get an explicit current presence state.
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

  select p.id into v_profile_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.is_active = true
    and p.archived_at is null;

  if v_profile_id is null then
    raise exception 'Active profile not found';
  end if;

  select s.* into v_existing
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
    last_presence_accuracy_m,
    current_presence_status,
    current_presence_status_at,
    current_presence_source
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
    v_accuracy,
    case
      when v_status = 'on_site_verified' then 'on_site'
      when v_status = 'outside_site' then 'off_site'
      else 'unverified'
    end,
    v_now,
    case when p_latitude is null or p_longitude is null then 'unverified' else 'gps' end
  )
  returning id into v_session_id;

  return query select v_session_id, v_status, v_distance, v_accuracy, v_verified_at;
end;
$$;

-- Rebuild live view helper around current presence rather than "ever verified".
drop view if exists public.current_on_site_view;
drop function if exists private.authorized_current_on_site_rows();

create function private.authorized_current_on_site_rows()
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

-- Presence requests need realtime delivery when a signed-in PWA is already open.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'presence_check_requests'
  ) then
    alter publication supabase_realtime add table public.presence_check_requests;
  end if;
end $$;
