-- RCG Clocking App
-- Scheduled after-hours safety alerts.
-- Uses Supabase Cron + pg_net and stores the scheduler authentication secret in Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the project URL and a random scheduler secret in Supabase Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'rcg_project_url') then
    perform vault.create_secret('https://xdiucesmsgscckddhlqj.supabase.co', 'rcg_project_url');
  end if;

  if not exists (select 1 from vault.secrets where name = 'rcg_alert_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'rcg_alert_cron_secret');
  end if;
end $$;

-- Keep the SECURITY DEFINER Vault lookup in the non-exposed private schema.
create or replace function private.verify_alert_cron_secret(p_candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_candidate = (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'rcg_alert_cron_secret'
      limit 1
    ),
    false
  )
$$;

revoke all on function private.verify_alert_cron_secret(text) from public;
grant usage on schema private to service_role;
grant execute on function private.verify_alert_cron_secret(text) to service_role;

-- The exposed RPC is SECURITY INVOKER and callable only by service_role. The Edge
-- Function uses its service-role client after validating the scheduler header.
create or replace function public.verify_alert_cron_secret(p_candidate text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.verify_alert_cron_secret(p_candidate)
$$;

revoke all on function public.verify_alert_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_alert_cron_secret(text) to service_role;

-- Alert settings/recipient writes now flow through admin-alerts so that changes are audited.
revoke update on public.settings from authenticated;
revoke insert, update, delete on public.alert_recipients from authenticated;
grant select on public.settings to authenticated;
grant select on public.alert_recipients to authenticated;

-- Supabase Cron invokes the checker every five minutes. The function itself decides
-- whether alerts are enabled, whether the local closing+grace threshold has passed,
-- and whether the repeat window has elapsed.
select cron.schedule(
  'rcg-after-hours-alert-check',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'rcg_project_url' limit 1)
      || '/functions/v1/after-hours-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-rcg-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rcg_alert_cron_secret' limit 1)
    ),
    body := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 10000
  ) as request_id;
  $cron$
);
