-- Professional classification is separate from clocking role and explicit register grants.
alter table public.profiles add column register_account_type text not null default 'standard'
 check(register_account_type in ('standard','therapist','senior_manager','company_owner'));
update public.profiles set register_account_type=case when role='owner' then 'company_owner' when can_manage_registers then 'senior_manager' else 'therapist' end
 where role='owner' or can_manage_registers or id in (select profile_id from public.register_leads union select profile_id from public.register_programme_access);
create or replace function private.register_manager() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and is_active and archived_at is null and profile_type='account'
 and (role='owner' or (can_manage_registers and register_account_type<>'standard')))
$$;
create or replace function private.programme_access(p_programme uuid,p_roles text[] default array['coordinator','lead','viewer']) returns boolean language sql stable security definer set search_path='' as $$
 select private.register_manager() or exists(select 1 from public.register_programme_access a join public.profiles p on p.id=a.profile_id
 where a.programme_id=p_programme and a.access_role=any(p_roles) and p.user_id=auth.uid() and p.is_active and p.archived_at is null and p.register_account_type<>'standard')
$$;
create or replace function private.can_access_register(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.register_manager() or exists(select 1 from public.register_sessions s where s.id=p_session and private.programme_access(s.programme_id))
 or exists(select 1 from public.register_leads l join public.profiles p on p.id=l.profile_id where l.session_id=p_session and p.user_id=auth.uid() and p.is_active and p.archived_at is null and p.register_account_type<>'standard')
$$;
create or replace function private.take_register(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.register_manager() or exists(select 1 from public.register_sessions s where s.id=p_session and private.programme_access(s.programme_id,array['coordinator','lead']))
 or exists(select 1 from public.register_leads l join public.profiles p on p.id=l.profile_id where l.session_id=p_session and p.user_id=auth.uid() and p.is_active and p.archived_at is null and p.register_account_type<>'standard')
$$;
create or replace function private.register_accounts(p_programme uuid default null,p_session uuid default null) returns table(id uuid,full_name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not (private.register_manager() or private.programme_access(p_programme,array['coordinator']) or private.manage_register(p_session)) then raise exception 'Coordinator permission required'; end if;
 return query select p.id,p.full_name from public.profiles p where p.profile_type='account' and p.is_active and p.archived_at is null and (p.role='owner' or p.register_account_type<>'standard') order by p.full_name;
end $$;

create table public.register_parties (
 id uuid primary key default gen_random_uuid(), label text not null check(length(label) between 2 and 120),
 email text not null check(email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 kind text not null default 'carer' check(kind in ('school','carer')), phone text not null default '' check(length(phone)<=80),
 active boolean not null default true, created_at timestamptz not null default now()
);
alter table public.register_parties enable row level security;
revoke all on public.register_parties from public,anon,authenticated;
grant select on public.register_parties to authenticated;
grant all on public.register_parties to service_role;
create policy register_parties_read on public.register_parties for select to authenticated using(private.register_manager());
alter table public.register_contacts add column party_id uuid references public.register_parties(id),
 add column notify_attendance boolean not null default true, add column notify_departure boolean not null default false;
create index register_contacts_party_idx on public.register_contacts(party_id);
insert into public.register_parties(label,email) select distinct label,email from public.register_contacts;
update public.register_contacts c set party_id=p.id from public.register_parties p where p.label=c.label and p.email=c.email;
alter table public.register_attendance add column marked_at timestamptz;
update public.register_attendance set marked_at=coalesce(arrived_at,recorded_at) where status not in ('unmarked','excused');
alter table public.register_notifications add column event text not null default 'attendance' check(event in ('attendance','departure'));
do $$ declare constraint_name text; begin
 for constraint_name in select conname from pg_constraint where conrelid='public.register_notifications'::regclass and contype='u' loop
 execute format('alter table public.register_notifications drop constraint %I',constraint_name); end loop; end $$;
alter table public.register_notifications add unique(session_id,client_id,contact_id,revision,event);
-- Absence has a marked time but never an arrival/departure.

-- Sync one attendee's two notification streams. Immutable attempted payloads retain their idempotency keys.
create function private.sync_register_notifications(p_session uuid,p_client uuid,p_force boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare s public.register_sessions%rowtype; a public.register_attendance%rowtype; c public.register_clients%rowtype;
 k record; e text; content jsonb; previous public.register_notifications%rowtype; delivered boolean; wanted boolean;
begin
 select * into s from public.register_sessions where id=p_session;
 select * into a from public.register_attendance where session_id=p_session and client_id=p_client;
 select * into c from public.register_clients where id=p_client;
 for k in select x.* from public.register_contacts x left join public.register_parties p on p.id=x.party_id
 where x.client_id=p_client and x.active and coalesce(p.active,true) loop
  foreach e in array array['attendance','departure'] loop
   delivered:=exists(select 1 from public.register_notifications n where n.session_id=p_session and n.client_id=p_client and n.contact_id=k.id and n.event=e and n.status='sent');
   wanted:=c.active and a.status<>'excused' and case when e='attendance' then k.notify_attendance and
     (a.status in ('present','late') or (a.status='absent' and k.notify_absence) or (a.status='unmarked' and delivered))
    else k.notify_departure and (a.departed_at is not null or delivered) end;
   if not wanted then
    update public.register_notifications set status='superseded' where session_id=p_session and client_id=p_client and contact_id=k.id and event=e and status in ('pending','failed','sending');
    continue;
   end if;
   content:=jsonb_build_object('display_name',c.display_name,'session',s.external_label,'starts_at',s.starts_at,'ends_at',s.ends_at,'status',a.status,
     'arrived_at',case when e='attendance' then a.arrived_at else null end,'departed_at',case when e='departure' then a.departed_at else null end,
     'marked_at',case when e='attendance' then a.marked_at else null end,'recorded_at',a.recorded_at,'event',e,'correction',delivered);
   select * into previous from public.register_notifications n where n.session_id=p_session and n.client_id=p_client and n.contact_id=k.id and n.event=e and n.status in ('pending','failed','sending','sent') order by n.created_at desc,n.revision desc limit 1;
   -- Ignore record timestamp and correction flag when deciding whether the observed event changed.
   if previous.id is not null and previous.recipient=k.email and (previous.payload-'recorded_at'-'correction')=(content-'recorded_at'-'correction') and not p_force then continue; end if;
   if previous.id is not null and previous.status='pending' and previous.attempts=0 then
    update public.register_notifications set payload=content,recipient=k.email,revision=s.revision,error=null where id=previous.id;
   else
    update public.register_notifications set status='superseded' where session_id=p_session and client_id=p_client and contact_id=k.id and event=e and status in ('pending','failed','sending');
    insert into public.register_notifications(session_id,client_id,contact_id,revision,recipient,payload,event) values(p_session,p_client,k.id,s.revision,k.email,content,e);
   end if;
  end loop;
 end loop;
end $$;
revoke all on function private.sync_register_notifications(uuid,uuid,boolean) from public,anon,authenticated;

alter function private.register_action(text,jsonb) rename to register_action_legacy;
create function private.register_action(p_action text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype; s public.register_sessions%rowtype; v_id uuid; v_row jsonb; oldrow jsonb; newrow jsonb; k public.register_contacts%rowtype; party public.register_parties%rowtype; v_client uuid;
begin
 select * into actor from public.profiles where user_id=auth.uid() and is_active and archived_at is null and profile_type='account';
 if actor.id is null then raise exception 'Active account required'; end if;
 if p_action='account_access' then
  if actor.role<>'owner' then raise exception 'Owner permission required'; end if;
  update public.profiles set register_account_type=p_data->>'register_account_type',can_manage_registers=coalesce((p_data->>'enabled')::boolean,false) and p_data->>'register_account_type'<>'standard'
   where id=(p_data->>'profile_id')::uuid and profile_type='account' and is_active and archived_at is null returning id into v_id;
  if v_id is null then raise exception 'Choose an active account'; end if;
  if p_data->>'register_account_type'='standard' then
   delete from public.register_leads where profile_id=v_id;
   delete from public.register_programme_access where profile_id=v_id;
  end if;
 elsif p_action in ('update_client','create_party','update_party','link_contact','update_contact') then
  if not private.register_manager() then raise exception 'Register manager permission required'; end if;
  if p_action='update_client' then
   v_id:=(p_data->>'client_id')::uuid;
   update public.register_clients set full_name=trim(p_data->>'full_name'),display_name=trim(p_data->>'display_name'),active=coalesce((p_data->>'active')::boolean,true) where id=v_id;
   if not found then raise exception 'Client not found'; end if;
   update public.register_notifications set payload=jsonb_set(payload,'{display_name}',to_jsonb(trim(p_data->>'display_name'))) where client_id=v_id and status='pending' and attempts=0;
   if not (p_data->>'active')::boolean then update public.register_notifications set status='blocked',error='Client inactive' where client_id=v_id and status in ('pending','failed','sending'); end if;
  elsif p_action in ('create_party','update_party') then
   if p_data->>'address_verified' is distinct from 'true' or nullif(trim(p_data->>'reason'),'') is null then raise exception 'Verify recipient address and record verification reference'; end if;
   if p_action='create_party' then
    insert into public.register_parties(label,email,kind,phone,active) values(trim(p_data->>'label'),lower(trim(p_data->>'email')),p_data->>'kind',coalesce(p_data->>'phone',''),coalesce((p_data->>'active')::boolean,true)) returning id into v_id;
   else
    v_id:=(p_data->>'party_id')::uuid;
    select * into party from public.register_parties where id=v_id for update;
    if party.id is null then raise exception 'Contact not found'; end if;
    update public.register_parties set label=trim(p_data->>'label'),email=lower(trim(p_data->>'email')),kind=p_data->>'kind',phone=coalesce(p_data->>'phone',''),active=(p_data->>'active')::boolean where id=v_id;
    update public.register_contacts set label=trim(p_data->>'label'),email=lower(trim(p_data->>'email')),approved_by=actor.id,approved_at=now() where party_id=v_id;
    update public.register_notifications n set status='blocked',error='Recipient details changed; regenerate after review' where n.contact_id in(select id from public.register_contacts where party_id=v_id) and n.status in ('pending','failed','sending');
   end if;
  else
   if p_data->>'active'='true' and (p_data->>'sharing_authorised' is distinct from 'true' or p_data->>'address_verified' is distinct from 'true' or nullif(trim(p_data->>'reason'),'') is null) then raise exception 'Verify address and authority for this client'; end if;
   if p_action='link_contact' then
    select * into party from public.register_parties where id=(p_data->>'party_id')::uuid and active for update;
    if party.id is null then raise exception 'Active school or carer required'; end if;
    insert into public.register_contacts(client_id,party_id,label,email,approved_by,notify_absence,notify_attendance,notify_departure,active)
     values((p_data->>'client_id')::uuid,party.id,party.label,party.email,actor.id,coalesce((p_data->>'notify_absence')::boolean,true),(p_data->>'notify_attendance')::boolean,(p_data->>'notify_departure')::boolean,(p_data->>'active')::boolean) returning id into v_id;
   else
    v_id:=(p_data->>'contact_id')::uuid;
    update public.register_contacts set active=(p_data->>'active')::boolean,notify_attendance=(p_data->>'notify_attendance')::boolean,notify_departure=(p_data->>'notify_departure')::boolean,notify_absence=(p_data->>'notify_absence')::boolean,approved_by=actor.id,approved_at=now() where id=v_id returning * into k;
    if not found then raise exception 'Client contact link not found'; end if;
    update public.register_notifications set status='blocked',error='Contact preferences changed; regenerate after review' where contact_id=v_id and status in ('pending','failed','sending');
   end if;
  end if;
 elsif p_action in ('record_attendance','regenerate_notifications') then
  select * into s from public.register_sessions where id=(p_data->>'session_id')::uuid for update;
  if s.id is null or not private.take_register(s.id) then raise exception 'Attendance permission required'; end if;
  if s.status='cancelled' then raise exception 'Session cancelled'; end if;
  if (p_data->>'revision')::int is distinct from s.revision then raise exception 'Register changed. Refresh and review before saving'; end if;
  v_id:=s.id;
  if s.starts_at>now() then raise exception 'Register taking starts when the session begins'; end if;
  if p_action='record_attendance' then
   for v_row in select value from jsonb_array_elements(p_data->'rows') loop
    v_client:=(v_row->>'client_id')::uuid;
    select to_jsonb(a) into oldrow from public.register_attendance a where session_id=s.id and client_id=v_client;
    if oldrow is null then raise exception 'Client is not on this register'; end if;
    if v_row->>'status' in ('present','absent') and nullif(v_row->>'marked_at','') is null then raise exception 'Attendance time required'; end if;
    if v_row->>'status' not in ('unmarked','present','absent','excused') then raise exception 'Invalid attendance status'; end if;
    if nullif(v_row->>'arrived_at','')::timestamptz>now() or nullif(v_row->>'departed_at','')::timestamptz>now() or nullif(v_row->>'marked_at','')::timestamptz>now() then raise exception 'Observed attendance cannot be in the future'; end if;
    update public.register_attendance set status=v_row->>'status',arrived_at=nullif(v_row->>'arrived_at','')::timestamptz,departed_at=nullif(v_row->>'departed_at','')::timestamptz,
     marked_at=nullif(v_row->>'marked_at','')::timestamptz,recorded_at=now(),recorded_by=actor.id where session_id=s.id and client_id=v_client;
    if v_row->>'status' in ('excused','unmarked') then update public.register_attendance set arrived_at=null,departed_at=null,marked_at=null where session_id=s.id and client_id=v_client; end if;
    select to_jsonb(a) into newrow from public.register_attendance a where session_id=s.id and client_id=v_client;
    insert into public.register_audit(session_id,actor_id,action,detail) values(s.id,actor.id,'attendance_change',jsonb_build_object('before',oldrow,'after',newrow,'reason',p_data->>'reason'));
   end loop;
  end if;
  update public.register_sessions set revision=revision+1,status='confirmed',confirmed_at=coalesce(confirmed_at,now()) where id=s.id;
  for v_row in select value from jsonb_array_elements(p_data->'rows') loop
   v_client:=(v_row->>'client_id')::uuid;
   if not exists(select 1 from public.register_attendance where session_id=s.id and client_id=v_client) then raise exception 'Client is not on this register'; end if;
   perform private.sync_register_notifications(s.id,v_client,p_action='regenerate_notifications');
  end loop;
 else
  if p_action='manager_permission' and actor.role<>'owner' then raise exception 'Owner permission required'; end if;
  if p_action in ('assign_lead','manager_permission') and not exists(select 1 from public.profiles where id=(p_data->>'profile_id')::uuid and (role='owner' or register_account_type<>'standard')) then raise exception 'Professional account type required'; end if;
  return private.register_action_legacy(p_action,p_data);
 end if;
 insert into public.register_audit(session_id,actor_id,action,detail) values(case when p_action in ('record_attendance','regenerate_notifications') then v_id else null end,actor.id,p_action,jsonb_build_object('record_id',v_id,'reason',p_data->>'reason'));
 return v_id;
end $$;
revoke all on function private.register_action(text,jsonb) from public,anon;
grant execute on function private.register_action(text,jsonb) to authenticated;
-- Prevent directly bypassing new action checks via the old implementation.
revoke all on function private.register_action_legacy(text,jsonb) from public,anon,authenticated;
-- Public wrapper is recreated to bind the new function rather than the renamed legacy OID.
create or replace function public.register_action(p_action text,p_data jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.register_action(p_action,p_data) $$;

alter function private.programme_action(text,jsonb) rename to programme_action_legacy;
create function private.programme_action(p_action text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if p_action='programme_permission' and p_data->>'access_role'<>'none' and not exists(select 1 from public.profiles where id=(p_data->>'profile_id')::uuid and (role='owner' or register_account_type<>'standard')) then raise exception 'Professional account type required'; end if;
 return private.programme_action_legacy(p_action,p_data);
end $$;
revoke all on function private.programme_action(text,jsonb) from public,anon;
grant execute on function private.programme_action(text,jsonb) to authenticated;
revoke all on function private.programme_action_legacy(text,jsonb) from public,anon,authenticated;
create or replace function public.programme_action(p_action text,p_data jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.programme_action(p_action,p_data) $$;

-- Extend roster without changing the existing RPC signature for older clients.
create function private.register_live_roster(p_session uuid) returns table(client_id uuid,display_name text,status text,arrived_at timestamptz,departed_at timestamptz,marked_at timestamptz) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_access_register(p_session) then raise exception 'Register access denied'; end if;
 return query select c.id,c.display_name,a.status,a.arrived_at,a.departed_at,a.marked_at from public.register_attendance a join public.register_clients c on c.id=a.client_id where a.session_id=p_session order by c.display_name,c.id;
end $$;
revoke all on function private.register_live_roster(uuid) from public,anon;
grant execute on function private.register_live_roster(uuid) to authenticated;
create function public.register_live_roster(p_session uuid) returns table(client_id uuid,display_name text,status text,arrived_at timestamptz,departed_at timestamptz,marked_at timestamptz) language sql stable security invoker set search_path='' as $$ select * from private.register_live_roster(p_session) $$;
revoke all on function public.register_live_roster(uuid) from public,anon;
grant execute on function public.register_live_roster(uuid) to authenticated;

create function private.register_routing(p_session uuid) returns table(client_id uuid,display_name text,contact_label text,email text,notify_attendance boolean,notify_absence boolean,notify_departure boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.take_register(p_session) then raise exception 'Attendance permission required'; end if;
 return query select c.id,c.display_name,k.label,k.email,k.notify_attendance,k.notify_absence,k.notify_departure
 from public.register_attendance a join public.register_clients c on c.id=a.client_id join public.register_contacts k on k.client_id=c.id
 left join public.register_parties p on p.id=k.party_id where a.session_id=p_session and c.active and k.active and coalesce(p.active,true) order by c.display_name,k.label;
end $$;
revoke all on function private.register_routing(uuid) from public,anon;
grant execute on function private.register_routing(uuid) to authenticated;
create function public.register_routing(p_session uuid) returns table(client_id uuid,display_name text,contact_label text,email text,notify_attendance boolean,notify_absence boolean,notify_departure boolean)
language sql stable security invoker set search_path='' as $$ select * from private.register_routing(p_session) $$;
revoke all on function public.register_routing(uuid) from public,anon;
grant execute on function public.register_routing(uuid) to authenticated;
