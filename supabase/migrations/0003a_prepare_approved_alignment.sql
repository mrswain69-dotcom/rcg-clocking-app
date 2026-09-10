-- RCG Clocking App
-- Preflight for the approved-schema alignment.
-- The legacy policies and view reference the original March 2026 enum/column shapes.
-- Drop those dependencies before 0004 converts the schema; 0004 recreates the hardened policies/view.

drop policy if exists "users can read own profile" on public.profiles;
drop policy if exists "admins read all profiles" on public.profiles;
drop policy if exists "users read own sessions" on public.sessions;
drop policy if exists "users create sessions" on public.sessions;
drop policy if exists "users update own sessions" on public.sessions;
drop policy if exists "admins manage pins" on public.pin_credentials;

drop view if exists public.current_on_site_view;
drop view if exists public.current_on_site_view_legacy;
