-- ==========================================
-- ENABLE RLS
-- ==========================================

alter table profiles enable row level security;
alter table sessions enable row level security;
alter table pin_credentials enable row level security;

-- ==========================================
-- PROFILES
-- ==========================================

create policy "users can read own profile"
on profiles
for select
using (auth.uid() = id);

create policy "admins read all profiles"
on profiles
for select
using (
  exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('admin','owner','developer')
  )
);

-- ==========================================
-- SESSIONS
-- ==========================================

create policy "users read own sessions"
on sessions
for select
using (user_id = auth.uid());

create policy "users create sessions"
on sessions
for insert
with check (user_id = auth.uid());

create policy "users update own sessions"
on sessions
for update
using (user_id = auth.uid());

-- ==========================================
-- PIN CREDENTIALS
-- ==========================================

create policy "admins manage pins"
on pin_credentials
for all
using (
  exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('admin','owner','developer')
  )
);
