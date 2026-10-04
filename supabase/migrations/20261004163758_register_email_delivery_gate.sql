-- Independent fail-closed rollout switch; only privileged administration can enable sending.
alter table public.settings add column if not exists register_email_enabled boolean not null default false;
