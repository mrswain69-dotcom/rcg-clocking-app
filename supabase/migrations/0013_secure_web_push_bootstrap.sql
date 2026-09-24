-- RCG Clocking App
-- Secure Web Push bootstrap: Edge Functions may generate a VAPID pair and store
-- the private half directly in Vault without exposing it to the frontend or repository.

create or replace function private.configure_web_push_keys(
  p_public_key text,
  p_private_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if p_public_key is null or length(p_public_key) < 60
    or p_private_key is null or length(p_private_key) < 30 then
    raise exception 'Invalid VAPID key material';
  end if;

  select s.id into v_secret_id
  from vault.secrets s
  where s.name = 'rcg_vapid_private_key'
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(
      p_private_key,
      'rcg_vapid_private_key',
      'RCG Web Push VAPID private key'
    );
  else
    perform vault.update_secret(v_secret_id, p_private_key);
  end if;

  update public.settings
  set vapid_public_key = p_public_key
  where id = 1;

  return true;
end;
$$;

revoke all on function private.configure_web_push_keys(text,text) from public;
grant usage on schema private to service_role;
grant execute on function private.configure_web_push_keys(text,text) to service_role;

create or replace function public.configure_web_push_keys(
  p_public_key text,
  p_private_key text
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.configure_web_push_keys(p_public_key, p_private_key)
$$;

revoke all on function public.configure_web_push_keys(text,text) from public, anon, authenticated;
grant execute on function public.configure_web_push_keys(text,text) to service_role;
