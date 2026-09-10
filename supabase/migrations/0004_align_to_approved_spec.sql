-- RCG Clocking App
-- Forward migration aligning the early March 2026 schema with the approved
-- "Supabase Data Schema & Security Specification" v1.0.
--
-- This migration preserves existing attendance/profile rows. It renames and extends
-- the early objects instead of deleting them. The live project contained zero rows
-- when this was prepared, but the migration remains preservation-first.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('owner','admin','developer','user');
  end if;
  if not exists (select 1 from pg_type where typname = 'clock_method') then
    create type public.clock_method as enum ('web','kiosk','admin_override');
  end if;
  if not exists (select 1 from pg_type where typname = 'kiosk_event_type') then
    create type public.kiosk_event_type as enum
      ('pin_success','pin_failure','clock_in','clock_out','timeout','admin_access');
  end if;
end $$;

-- Profiles: preserve the old id values, but separate profile id from auth user id.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists can_use_kiosk boolean not null default true,
  add column if not exists can_receive_safety_alerts boolean not null default false,
  add column if not exists short_code text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

update public.profiles p
set user_id = p.id
where user_id is null
  and exists (select 1 from auth.users u where u.id = p.id);

update public.profiles p
set email = u.email
from auth.users u
where p.user_id = u.id
  and p.email is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='active'
  ) then
    execute 'alter table public.profiles rename column active to is_active';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='allow_presence_view'
  ) then
    execute 'alter table public.profiles rename column allow_presence_view to can_view_currently_on_site';
  end if;
end $$;

alter table public.profiles
  alter column id set default gen_random_uuid(),
  alter column user_id set not null,
  alter column email set not null,
  alter column role drop default,
  alter column role type public.app_role using role::text::public.app_role,
  alter column role set default 'user'::public.app_role,
  alter column is_active set not null,
  alter column can_view_currently_on_site set not null;

create unique index if not exists profiles_user_id_uq on public.profiles(user_id);
create unique index if not exists profiles_email_lower_uq on public.profiles(lower(email));
create unique index if not exists profiles_short_code_uq on public.profiles(short_code) where short_code is not null;
create index if not exists profiles_role_active_idx on public.profiles(role, is_active);

-- Sessions: rename early fields and preserve old records.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sessions' and column_name='user_id'
  ) then
    execute 'alter table public.sessions rename column user_id to profile_id';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sessions' and column_name='started_at'
  ) then
    execute 'alter table public.sessions rename column started_at to clock_in_at';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sessions' and column_name='ended_at'
  ) then
    execute 'alter table public.sessions rename column ended_at to clock_out_at';
  end if;
end $$;

alter table public.sessions
  alter column profile_id set not null,
  add column if not exists clock_in_method public.clock_method,
  add column if not exists clock_out_method public.clock_method,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

update public.sessions
set clock_in_method = case method::text
  when 'kiosk' then 'kiosk'::public.clock_method
  when 'admin_override' then 'admin_override'::public.clock_method
  else 'web'::public.clock_method
end
where clock_in_method is null;

update public.sessions
set clock_out_method = case method::text
  when 'kiosk' then 'kiosk'::public.clock_method
  when 'admin_override' then 'admin_override'::public.clock_method
  else 'web'::public.clock_method
end
where clock_out_at is not null and clock_out_method is null;

alter table public.sessions
  alter column clock_in_method set not null,
  alter column clock_in_method set default 'web'::public.clock_method;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='sessions_time_order_chk' and conrelid='public.sessions'::regclass
  ) then
    alter table public.sessions add constraint sessions_time_order_chk
      check (clock_out_at is null or clock_out_at >= clock_in_at);
  end if;
end $$;

create unique index if not exists sessions_one_open_session_per_profile_idx
  on public.sessions(profile_id) where clock_out_at is null;
create index if not exists sessions_profile_clockin_idx
  on public.sessions(profile_id, clock_in_at desc);
create index if not exists sessions_open_idx
  on public.sessions(clock_in_at desc) where clock_out_at is null;

-- Settings: extend the existing singleton settings table.
alter table public.settings
  add column if not exists timezone text not null default 'Europe/London',
  add column if not exists closing_time time not null default '18:00',
  add column if not exists alert_enabled boolean not null default false,
  add column if not exists alert_grace_minutes integer not null default 15,
  add column if not exists alert_repeat_minutes integer not null default 60,
  add column if not exists last_alert_sent_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

insert into public.settings (id, site_name)
values (1, 'Redcatch Community Garden')
on conflict (id) do nothing;

update public.settings
set site_name = coalesce(site_name, 'Redcatch Community Garden')
where id = 1;

alter table public.settings alter column site_name set not null;

create table if not exists public.alert_recipients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Kiosk credentials and audit state.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='pin_credentials' and column_name='user_id'
  ) then
    execute 'alter table public.pin_credentials rename column user_id to profile_id';
  end if;
end $$;

alter table public.pin_credentials
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='pin_credentials_attempts_chk' and conrelid='public.pin_credentials'::regclass
  ) then
    alter table public.pin_credentials add constraint pin_credentials_attempts_chk
      check (failed_attempts >= 0);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='kiosk_events' and column_name='user_id'
  ) then
    execute 'alter table public.kiosk_events rename column user_id to resolved_profile_id';
  end if;
end $$;

alter table public.kiosk_events
  add column if not exists entered_identifier text,
  add column if not exists event_type public.kiosk_event_type,
  add column if not exists device_label text,
  add column if not exists metadata jsonb;

update public.kiosk_events
set event_type = case
  when success is false then 'pin_failure'::public.kiosk_event_type
  when action = 'clock_out' then 'clock_out'::public.kiosk_event_type
  when action = 'clock_in' then 'clock_in'::public.kiosk_event_type
  else 'pin_success'::public.kiosk_event_type
end
where event_type is null;

alter table public.kiosk_events alter column event_type set not null;

create index if not exists kiosk_events_created_idx on public.kiosk_events(created_at desc);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  performed_by_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_session_id uuid references public.sessions(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log(created_at desc);

-- RLS helpers. These use security definer only for the minimal role/capability lookup,
-- with PUBLIC execute revoked immediately below.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p where p.user_id = auth.uid()
$$;

create or replace function public.app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.user_id = auth.uid()
$$;

create or replace function public.is_admin_like()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() in ('owner','admin','developer'), false)
$$;

create or replace function public.can_view_on_site()
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

revoke all on function public.current_profile_id() from public;
revoke all on function public.app_role() from public;
revoke all on function public.is_admin_like() from public;
revoke all on function public.can_view_on_site() from public;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.app_role() to authenticated;
grant execute on function public.is_admin_like() to authenticated;
grant execute on function public.can_view_on_site() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists trg_sessions_updated_at on public.sessions;
create trigger trg_sessions_updated_at before update on public.sessions
for each row execute function public.set_updated_at();
drop trigger if exists trg_settings_updated_at on public.settings;
create trigger trg_settings_updated_at before update on public.settings
for each row execute function public.set_updated_at();

-- Preserve the old view under a legacy name, then create the approved view shape.
do $$
begin
  if to_regclass('public.current_on_site_view') is not null
     and to_regclass('public.current_on_site_view_legacy') is null then
    alter view public.current_on_site_view rename to current_on_site_view_legacy;
  end if;
end $$;

create or replace view public.current_on_site_view
with (security_invoker = true)
as
select
  s.id as session_id,
  p.id as profile_id,
  p.full_name,
  p.role,
  s.clock_in_at,
  round(extract(epoch from (now() - s.clock_in_at)) / 60.0)::int as duration_minutes
from public.sessions s
join public.profiles p on p.id = s.profile_id
where s.clock_out_at is null
  and p.is_active = true
  and p.archived_at is null
order by s.clock_in_at asc;

create or replace view public.user_hours_summary_view
with (security_invoker = true)
as
select
  p.id as profile_id,
  p.full_name,
  date_trunc('day', s.clock_in_at at time zone 'Europe/London')::date as work_date,
  round(sum(extract(epoch from (coalesce(s.clock_out_at, now()) - s.clock_in_at)) / 3600.0)::numeric, 2) as hours_total
from public.sessions s
join public.profiles p on p.id = s.profile_id
group by p.id, p.full_name, date_trunc('day', s.clock_in_at at time zone 'Europe/London')::date;

-- Enable RLS everywhere, including the two early tables that were exposed.
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.settings enable row level security;
alter table public.alert_recipients enable row level security;
alter table public.pin_credentials enable row level security;
alter table public.kiosk_events enable row level security;
alter table public.audit_log enable row level security;

-- Remove the permissive early policies before installing the approved/hardened set.
drop policy if exists "users can read own profile" on public.profiles;
drop policy if exists "admins read all profiles" on public.profiles;
drop policy if exists "users read own sessions" on public.sessions;
drop policy if exists "users create sessions" on public.sessions;
drop policy if exists "users update own sessions" on public.sessions;
drop policy if exists "admins manage pins" on public.pin_credentials;

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
using (user_id = (select auth.uid()) or public.is_admin_like());

create policy profiles_admin_insert
on public.profiles for insert to authenticated
with check (public.is_admin_like());

create policy profiles_admin_update
on public.profiles for update to authenticated
using (public.is_admin_like())
with check (public.is_admin_like());

create policy sessions_select_own_admin_or_presence
on public.sessions for select to authenticated
using (
  profile_id = public.current_profile_id()
  or public.is_admin_like()
  or (public.can_view_on_site() and clock_out_at is null)
);

create policy sessions_insert_self
on public.sessions for insert to authenticated
with check (
  profile_id = public.current_profile_id()
  and exists (
    select 1 from public.profiles p
    where p.id = profile_id and p.is_active = true and p.archived_at is null
  )
);

create policy sessions_update_self_open_only
on public.sessions for update to authenticated
using (profile_id = public.current_profile_id() and clock_out_at is null)
with check (profile_id = public.current_profile_id());

create policy sessions_admin_all
on public.sessions for all to authenticated
using (public.is_admin_like())
with check (public.is_admin_like());

create policy settings_admin_read
on public.settings for select to authenticated
using (public.is_admin_like());

create policy settings_admin_update
on public.settings for update to authenticated
using (public.is_admin_like())
with check (public.is_admin_like());

create policy alert_recipients_admin_all
on public.alert_recipients for all to authenticated
using (public.is_admin_like())
with check (public.is_admin_like());

create policy audit_log_admin_read
on public.audit_log for select to authenticated
using (public.is_admin_like());

create policy kiosk_events_admin_read
on public.kiosk_events for select to authenticated
using (public.is_admin_like());

-- Data API privileges. RLS remains the row-level gate.
revoke all on public.pin_credentials from anon, authenticated;
revoke all on public.profiles from anon;
revoke all on public.sessions from anon;
revoke all on public.settings from anon;
revoke all on public.alert_recipients from anon;
revoke all on public.kiosk_events from anon;
revoke all on public.audit_log from anon;

grant select on public.profiles to authenticated;
grant select, insert on public.sessions to authenticated;
grant update (clock_out_at, clock_out_method) on public.sessions to authenticated;
grant select, update on public.settings to authenticated;
grant select, insert, update, delete on public.alert_recipients to authenticated;
grant select on public.kiosk_events to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.current_on_site_view to authenticated;
grant select on public.user_hours_summary_view to authenticated;

-- Add session change events to Realtime once.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;
