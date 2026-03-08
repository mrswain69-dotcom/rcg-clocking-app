-- ==========================================
-- RCG CLOCKING APP
-- INITIAL DATABASE SCHEMA
-- ==========================================

-- Enable extensions
create extension if not exists "uuid-ossp";

-- ==========================================
-- ENUMS
-- ==========================================

create type user_role as enum (
  'owner',
  'admin',
  'developer',
  'user'
);

create type session_method as enum (
  'app',
  'kiosk',
  'admin_override'
);

-- ==========================================
-- PROFILES
-- ==========================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role default 'user',
  active boolean default true,
  allow_presence_view boolean default false,
  created_at timestamptz default now()
);

create index idx_profiles_role on profiles(role);

-- ==========================================
-- PIN CREDENTIALS (KIOSK)
-- ==========================================

create table public.pin_credentials (
  user_id uuid primary key references profiles(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz default now()
);

-- ==========================================
-- SESSIONS
-- ==========================================

create table public.sessions (
  id uuid primary key default uuid_generate_v4(),

  user_id uuid references profiles(id) on delete cascade,

  started_at timestamptz not null default now(),
  ended_at timestamptz,

  method session_method default 'app',

  created_at timestamptz default now()
);

create index idx_sessions_user on sessions(user_id);
create index idx_sessions_started on sessions(started_at);

-- ==========================================
-- KIOSK EVENTS (AUDIT)
-- ==========================================

create table public.kiosk_events (
  id uuid primary key default uuid_generate_v4(),

  user_id uuid,
  success boolean,
  action text,
  created_at timestamptz default now()
);

-- ==========================================
-- SETTINGS
-- ==========================================

create table public.settings (
  id int primary key default 1,
  site_name text,
  kiosk_enabled boolean default true,
  created_at timestamptz default now()
);

insert into settings (id, site_name)
values (1, 'Redcatch Community Garden')
on conflict do nothing;

-- ==========================================
-- HELPER VIEW
-- ==========================================

create view public.current_on_site_view as
select
  s.id,
  s.user_id,
  p.full_name,
  p.role,
  s.started_at,
  now() - s.started_at as duration
from sessions s
join profiles p on p.id = s.user_id
where s.ended_at is null;
