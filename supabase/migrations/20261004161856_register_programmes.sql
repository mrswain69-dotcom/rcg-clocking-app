-- Regular programmes and explicit, independent register capabilities.
create table public.register_programmes (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 200),
 external_label text not null default 'RCG session' check(length(external_label) between 2 and 200),
 kind text not null check(kind in ('group','individual')),
 first_date date not null, last_date date not null, start_time time not null, end_time time not null,
 interval_weeks int not null default 1 check(interval_weeks in (1,2)), excluded_dates date[] not null default '{}',
 revision int not null default 1, active boolean not null default true,
 check(last_date >= first_date and last_date <= first_date + 730), check(end_time > start_time)
);
create table public.register_programme_access (
 programme_id uuid not null references public.register_programmes(id), profile_id uuid not null references public.profiles(id),
 access_role text not null check(access_role in ('coordinator','lead','viewer')), primary key(programme_id,profile_id)
);
create index register_programme_access_profile_idx on public.register_programme_access(profile_id);
create table public.register_programme_enrolments (
 programme_id uuid not null references public.register_programmes(id),client_id uuid not null references public.register_clients(id),
 from_date date not null, to_date date, primary key(programme_id,client_id), check(to_date is null or to_date>=from_date)
);
create index register_programme_enrolments_client_idx on public.register_programme_enrolments(client_id);
alter table public.register_sessions add column programme_id uuid references public.register_programmes(id);
alter table public.register_sessions add column programme_date date;
create unique index register_programme_occurrence_idx on public.register_sessions(programme_id,programme_date) where programme_id is not null;
create or replace function private.register_manager() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and is_active and archived_at is null and (role='owner' or can_manage_registers))
$$;
create or replace function private.programme_access(p_programme uuid,p_roles text[] default array['coordinator','lead','viewer'])
returns boolean language sql stable security definer set search_path='' as $$
 select private.register_manager() or exists(select 1 from public.register_programme_access a join public.profiles p on p.id=a.profile_id
 where a.programme_id=p_programme and a.access_role=any(p_roles) and p.user_id=auth.uid() and p.is_active and p.archived_at is null)
$$;
create or replace function private.can_access_register(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.register_manager() or exists(select 1 from public.register_sessions s where s.id=p_session and private.programme_access(s.programme_id))
 or exists(select 1 from public.register_leads l join public.profiles p on p.id=l.profile_id where l.session_id=p_session and p.user_id=auth.uid() and p.is_active and p.archived_at is null)
$$;
create or replace function private.manage_register(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.register_manager() or exists(select 1 from public.register_sessions s where s.id=p_session and private.programme_access(s.programme_id,array['coordinator']))
$$;
create or replace function private.take_register(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.register_manager() or exists(select 1 from public.register_sessions s where s.id=p_session and private.programme_access(s.programme_id,array['coordinator','lead']))
 or exists(select 1 from public.register_leads l join public.profiles p on p.id=l.profile_id where l.session_id=p_session and p.user_id=auth.uid() and p.is_active and p.archived_at is null)
$$;
revoke all on function private.programme_access(uuid,text[]),private.manage_register(uuid),private.take_register(uuid) from public;
grant execute on function private.programme_access(uuid,text[]),private.manage_register(uuid),private.take_register(uuid) to authenticated;
alter table public.register_programmes enable row level security;
alter table public.register_programme_access enable row level security;
alter table public.register_programme_enrolments enable row level security;
revoke all on public.register_programmes,public.register_programme_access,public.register_programme_enrolments from public,anon,authenticated;
grant select on public.register_programmes,public.register_programme_access,public.register_programme_enrolments to authenticated;
grant all on public.register_programmes,public.register_programme_access,public.register_programme_enrolments to service_role;
create policy programme_read on public.register_programmes for select to authenticated using(private.programme_access(id));
create policy programme_access_read on public.register_programme_access for select to authenticated using(private.programme_access(programme_id));
create policy programme_enrolments_read on public.register_programme_enrolments for select to authenticated using(private.programme_access(programme_id));
-- Viewers may read attendance but cannot see recipient addresses or delivery payloads.
alter policy register_notifications_read on public.register_notifications using(private.take_register(session_id));
create or replace function private.register_action(p_action text,p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles%rowtype; v_session public.register_sessions%rowtype;
 v_id uuid; v_session_id uuid; v_client uuid; v_row jsonb; v_old jsonb; v_new jsonb; v_reason text;
begin
 select * into v_actor from public.profiles where user_id = auth.uid() and is_active and archived_at is null;
 if v_actor.id is null then raise exception 'Active account required'; end if;
 v_reason := nullif(trim(p_data->>'reason'),'');
 if p_action = 'manager_permission' then
   if v_actor.role <> 'owner' then raise exception 'Owner permission required'; end if;
   update public.profiles set can_manage_registers = (p_data->>'enabled')::boolean
   where id = (p_data->>'profile_id')::uuid and profile_type = 'account' and is_active and archived_at is null;
   if not found then raise exception 'Choose an active account'; end if;
   insert into public.register_audit(actor_id,action,detail) values(v_actor.id,p_action,p_data);
   return (p_data->>'profile_id')::uuid;
 end if;
 if p_action in ('create_client','approve_contact','deactivate_contact','create_session') and not private.register_manager() then
   raise exception 'Register manager permission required';
 end if;
 if p_action = 'create_client' then
   insert into public.register_clients(full_name,display_name) values(trim(p_data->>'full_name'),trim(p_data->>'display_name')) returning id into v_id;
 elsif p_action = 'approve_contact' then
   if p_data->>'address_verified' is distinct from 'true' or p_data->>'sharing_authorised' is distinct from 'true' or v_reason is null then raise exception 'Confirm verified address and authority to receive attendance'; end if;
   insert into public.register_contacts(client_id,label,email,approved_by,notify_absence)
   values((p_data->>'client_id')::uuid,trim(p_data->>'label'),lower(trim(p_data->>'email')),v_actor.id,coalesce((p_data->>'notify_absence')::boolean,false)) returning id into v_id;
 elsif p_action = 'deactivate_contact' then
   update public.register_contacts set active = false where id = (p_data->>'contact_id')::uuid returning id into v_id;
   update public.register_notifications set status = 'blocked',error = 'Contact disabled' where contact_id = v_id and status in ('pending','failed');
 elsif p_action = 'create_session' then
   insert into public.register_sessions(name,external_label,starts_at,ends_at,kind)
   values(trim(p_data->>'name'),coalesce(nullif(trim(p_data->>'external_label'),''),'RCG session'),(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,p_data->>'kind') returning id into v_id;
 else
   v_session_id := (p_data->>'session_id')::uuid;
   select * into v_session from public.register_sessions where id = v_session_id for update;
   if v_session.id is null or not private.can_access_register(v_session_id) then raise exception 'Register access denied'; end if;
   if (p_data->>'revision')::int is distinct from v_session.revision then raise exception 'Register changed. Refresh and review before saving'; end if;
   if v_session.status = 'cancelled' then raise exception 'Session cancelled'; end if;
   if p_action in ('assign_lead','enrol','cancel') and not private.manage_register(v_session_id) then raise exception 'Coordinator permission required'; end if;
   if p_action in ('save_attendance','confirm') and not private.take_register(v_session_id) then raise exception 'Attendance permission required'; end if;
   v_id := v_session_id;
   if p_action = 'assign_lead' then
     if not exists(select 1 from public.profiles where id = (p_data->>'profile_id')::uuid and profile_type = 'account' and is_active and archived_at is null) then raise exception 'Active account required for lead'; end if;
     insert into public.register_leads(session_id,profile_id) values(v_id,(p_data->>'profile_id')::uuid) on conflict do nothing;
   elsif p_action = 'enrol' then
     if v_session.confirmed_at is not null then raise exception 'Confirmed rosters are locked'; end if;
     if not private.register_manager() and not exists(select 1 from public.register_programme_enrolments where programme_id=v_session.programme_id and client_id=(p_data->>'client_id')::uuid) then raise exception 'Client outside programme'; end if;
     if v_session.status <> 'draft' then raise exception 'Only draft rosters may change'; end if;
     if v_session.kind = 'individual' and exists(select 1 from public.register_attendance where session_id = v_id) then raise exception 'Individual session already has an attendee'; end if;
     if not exists(select 1 from public.register_clients where id = (p_data->>'client_id')::uuid and active) then raise exception 'Active client required'; end if;
     insert into public.register_attendance(session_id,client_id) values(v_id,(p_data->>'client_id')::uuid) on conflict do nothing;
   elsif p_action = 'save_attendance' then
     if v_session.confirmed_at is not null and (not private.register_manager() or v_reason is null) then raise exception 'Manager and correction reason required'; end if;
     for v_row in select value from jsonb_array_elements(p_data->'rows') loop
       v_client := (v_row->>'client_id')::uuid;
       select to_jsonb(a) into v_old from public.register_attendance a where session_id = v_id and client_id = v_client;
       if v_old is null then raise exception 'Client is not on this register'; end if;
       if nullif(v_row->>'arrived_at','')::timestamptz > now() or nullif(v_row->>'departed_at','')::timestamptz > now() then raise exception 'Observed attendance cannot be in the future'; end if;
       update public.register_attendance set status = v_row->>'status',
         arrived_at = nullif(v_row->>'arrived_at','')::timestamptz,departed_at = nullif(v_row->>'departed_at','')::timestamptz,
         recorded_by = v_actor.id,recorded_at = now() where session_id = v_id and client_id = v_client;
       select to_jsonb(a) into v_new from public.register_attendance a where session_id = v_id and client_id = v_client;
       insert into public.register_audit(session_id,actor_id,action,detail) values(v_id,v_actor.id,'attendance_change',jsonb_build_object('before',v_old,'after',v_new,'reason',v_reason));
     end loop;
     -- Pending earlier versions must not send after a correction.
     update public.register_notifications set status = 'superseded' where session_id = v_id and status in ('pending','failed');
     update public.register_sessions set status = 'draft' where id = v_id;
   elsif p_action = 'confirm' then
     if v_session.status <> 'draft' then raise exception 'Register already confirmed'; end if;
     if v_session.confirmed_at is not null and not private.register_manager() then raise exception 'Manager must confirm attendance corrections'; end if;
     if not exists(select 1 from public.register_attendance where session_id = v_id) or exists(select 1 from public.register_attendance where session_id = v_id and status = 'unmarked') then raise exception 'Mark every expected attendee before confirming'; end if;
     insert into public.register_notifications(session_id,client_id,contact_id,revision,recipient,payload)
     select v_id,c.id,k.id,v_session.revision,k.email,jsonb_build_object(
       'display_name',c.display_name,'session',v_session.external_label,'starts_at',v_session.starts_at,'ends_at',v_session.ends_at,
       'status',a.status,'arrived_at',a.arrived_at,'departed_at',a.departed_at,'recorded_at',a.recorded_at,
       'correction',v_session.confirmed_at is not null)
     from public.register_attendance a join public.register_clients c on c.id = a.client_id
     join public.register_contacts k on k.client_id = c.id and k.active
     where a.session_id = v_id and c.active and (a.status in ('present','late') or (a.status = 'absent' and k.notify_absence) or exists(select 1 from public.register_notifications n where n.session_id = v_id and n.client_id = c.id and n.contact_id = k.id and n.status = 'sent'));
     update public.register_sessions set status = 'confirmed',confirmed_at = now() where id = v_id;
   elsif p_action = 'cancel' then
     if not private.register_manager() and (v_session.confirmed_at is not null or v_session.starts_at <= now()) then raise exception 'Manager required to cancel historical sessions'; end if;
     if v_reason is null then raise exception 'Cancellation reason required'; end if;
     update public.register_sessions set status = 'cancelled' where id = v_id;
     update public.register_notifications set status = 'blocked',error = 'Session cancelled' where session_id = v_id and status in ('pending','failed');
   else raise exception 'Unknown register action';
   end if;
   update public.register_sessions set revision = revision + 1 where id = v_id;
 end if;
 insert into public.register_audit(session_id,actor_id,action,detail)
 values(v_session_id,v_actor.id,p_action,jsonb_build_object('record_id',v_id,'reason',v_reason));
 return v_id;
end $$;

-- Small scoped directory RPCs return abbreviated client identities and account names only.
create or replace function private.programme_roster(p_programme uuid)
returns table(client_id uuid,display_name text,from_date date,to_date date) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.programme_access(p_programme) then raise exception 'Programme access denied'; end if;
 return query select c.id,c.display_name,e.from_date,e.to_date from public.register_programme_enrolments e join public.register_clients c on c.id=e.client_id where e.programme_id=p_programme order by c.display_name,c.id;
end $$;
create or replace function private.register_accounts(p_programme uuid default null,p_session uuid default null)
returns table(id uuid,full_name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not (private.register_manager() or private.programme_access(p_programme,array['coordinator']) or private.manage_register(p_session)) then raise exception 'Coordinator permission required'; end if;
 return query select p.id,p.full_name from public.profiles p where p.profile_type='account' and p.is_active and p.archived_at is null order by p.full_name;
end $$;
create or replace function private.register_capabilities(p_programme uuid default null,p_session uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('manage',private.register_manager() or private.programme_access(p_programme,array['coordinator']) or private.manage_register(p_session),
 'take',private.register_manager() or private.programme_access(p_programme,array['coordinator','lead']) or private.take_register(p_session))
$$;
create or replace function private.programme_action(p_action text,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid; pid uuid; target uuid; prog public.register_programmes%rowtype; d date; sid uuid; reason text;
begin
 select id into actor from public.profiles where user_id=auth.uid() and is_active and archived_at is null;
 if actor is null then raise exception 'Active account required'; end if;
 pid:=nullif(p_data->>'programme_id','')::uuid;
 reason:=nullif(trim(p_data->>'reason'),'');
 if p_action='create_programme' then
  if not private.register_manager() then raise exception 'Register manager permission required'; end if;
  insert into public.register_programmes(name,external_label,kind,first_date,last_date,start_time,end_time,interval_weeks,excluded_dates)
  values(trim(p_data->>'name'),trim(p_data->>'external_label'),p_data->>'kind',(p_data->>'first_date')::date,(p_data->>'last_date')::date,
  (p_data->>'start_time')::time,(p_data->>'end_time')::time,(p_data->>'interval_weeks')::int,
  array(select value::date from jsonb_array_elements_text(coalesce(p_data->'excluded_dates','[]'::jsonb)))) returning id into pid;
 else
  select * into prog from public.register_programmes where id=pid for update;
  if prog.id is null or not private.programme_access(pid,array['coordinator']) then raise exception 'Coordinator permission required'; end if;
  if (p_data->>'revision')::int is distinct from prog.revision then raise exception 'Programme changed. Refresh before saving'; end if;
  if p_action='programme_permission' then
   if not private.register_manager() then raise exception 'Register manager permission required'; end if;
   target:=(p_data->>'profile_id')::uuid;
   if not exists(select 1 from public.profiles where id=target and is_active and archived_at is null and profile_type='account') then raise exception 'Active account required'; end if;
   if p_data->>'access_role'='none' then delete from public.register_programme_access where programme_id=pid and profile_id=target;
   else insert into public.register_programme_access values(pid,target,p_data->>'access_role') on conflict(programme_id,profile_id) do update set access_role=excluded.access_role; end if;
  elsif p_action='programme_enrol' then
   target:=(p_data->>'client_id')::uuid;
   if not exists(select 1 from public.register_clients where id=target and active) then raise exception 'Active client required'; end if;
   if not private.register_manager() and not exists(select 1 from public.register_programme_enrolments where programme_id=pid and client_id=target) then raise exception 'Manager must allocate client to programme first'; end if;
   if prog.kind='individual' and exists(select 1 from public.register_programme_enrolments where programme_id=pid and client_id<>target and from_date<=coalesce(nullif(p_data->>'to_date','')::date,'infinity'::date) and coalesce(to_date,'infinity'::date)>=(p_data->>'from_date')::date) then raise exception 'Individual booking already has an attendee in these dates'; end if;
   insert into public.register_programme_enrolments values(pid,target,(p_data->>'from_date')::date,nullif(p_data->>'to_date','')::date)
   on conflict(programme_id,client_id) do update set from_date=excluded.from_date,to_date=excluded.to_date;
  elsif p_action='update_programme' then
   update public.register_programmes set name=trim(p_data->>'name'),external_label=trim(p_data->>'external_label'),
    first_date=(p_data->>'first_date')::date,last_date=(p_data->>'last_date')::date,start_time=(p_data->>'start_time')::time,end_time=(p_data->>'end_time')::time,
    interval_weeks=(p_data->>'interval_weeks')::int,excluded_dates=array(select value::date from jsonb_array_elements_text(coalesce(p_data->'excluded_dates','[]'::jsonb))),active=(p_data->>'active')::boolean where id=pid;
  elsif p_action='generate_sessions' then
   if not prog.active then raise exception 'Programme is inactive'; end if;
   for d in select gs::date from generate_series(prog.first_date::timestamp,prog.last_date::timestamp,make_interval(days=>7*prog.interval_weeks)) gs loop
    if d=any(prog.excluded_dates) or d < (now() at time zone 'Europe/London')::date then continue; end if;
    sid:=null;
    insert into public.register_sessions(name,external_label,kind,starts_at,ends_at,programme_id,programme_date)
    values(prog.name,prog.external_label,prog.kind,(d+prog.start_time) at time zone 'Europe/London',(d+prog.end_time) at time zone 'Europe/London',pid,d)
    on conflict(programme_id,programme_date) where programme_id is not null do nothing returning id into sid;
    if sid is not null then
     insert into public.register_attendance(session_id,client_id) select sid,e.client_id from public.register_programme_enrolments e join public.register_clients c on c.id=e.client_id
      where e.programme_id=pid and c.active and e.from_date<=d and (e.to_date is null or e.to_date>=d);
    end if;
   end loop;
  else raise exception 'Unknown programme action'; end if;
  update public.register_programmes set revision=revision+1 where id=pid;
 end if;
 insert into public.register_audit(actor_id,action,detail) values(actor,p_action,jsonb_build_object('programme_id',pid,'data',p_data));
 return pid;
end $$;
-- Session exceptions never mutate the recurring template or historical roster.
create or replace function private.register_setup_action(p_action text,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.register_sessions%rowtype; actor uuid; cid uuid;
begin
 select id into actor from public.profiles where user_id=auth.uid() and is_active and archived_at is null;
 if actor is null then raise exception 'Active account required'; end if;
 select * into s from public.register_sessions where id=(p_data->>'session_id')::uuid for update;
 if s.id is null or not private.manage_register(s.id) then raise exception 'Coordinator permission required'; end if;
 if s.revision is distinct from (p_data->>'revision')::int then raise exception 'Register changed. Refresh before saving'; end if;
 if s.status='cancelled' and p_action<>'remove_lead' then raise exception 'Session cancelled'; end if;
 if p_action='remove_lead' then
  delete from public.register_leads where session_id=s.id and profile_id=(p_data->>'profile_id')::uuid;
 else
  if s.confirmed_at is not null or s.starts_at<=now() or exists(select 1 from public.register_attendance where session_id=s.id and status<>'unmarked') then raise exception 'Only future untouched registers can change setup'; end if;
  if p_action='remove_attendee' then
   delete from public.register_attendance where session_id=s.id and client_id=(p_data->>'client_id')::uuid;
  elsif p_action='update_session' then
   if (p_data->>'starts_at')::timestamptz <= now() then raise exception 'Choose a future session time'; end if;
   update public.register_sessions set name=trim(p_data->>'name'),external_label=trim(p_data->>'external_label'),starts_at=(p_data->>'starts_at')::timestamptz,ends_at=(p_data->>'ends_at')::timestamptz where id=s.id;
  elsif p_action='refresh_roster' then
   if s.programme_id is null then raise exception 'Programme required'; end if;
   delete from public.register_attendance where session_id=s.id;
   insert into public.register_attendance(session_id,client_id) select s.id,e.client_id from public.register_programme_enrolments e join public.register_clients c on c.id=e.client_id
    where e.programme_id=s.programme_id and c.active and e.from_date<=s.programme_date and (e.to_date is null or e.to_date>=s.programme_date);
  else raise exception 'Unknown setup action'; end if;
 end if;
 update public.register_sessions set revision=revision+1 where id=s.id;
 insert into public.register_audit(session_id,actor_id,action,detail) values(s.id,actor,p_action,p_data);
 return s.id;
end $$;
create or replace function private.register_recipient_preview(p_session uuid)
returns table(client_id uuid,display_name text,contact_label text,email text,attendance_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.take_register(p_session) then raise exception 'Register access denied'; end if;
 return query select c.id,c.display_name,k.label,k.email,a.status from public.register_attendance a
 join public.register_clients c on c.id = a.client_id join public.register_contacts k on k.client_id = c.id
 where a.session_id = p_session and k.active and c.active and (a.status in ('present','late') or (a.status = 'absent' and k.notify_absence) or exists(select 1 from public.register_notifications n where n.session_id = p_session and n.client_id = c.id and n.contact_id = k.id and n.status = 'sent'))
 order by c.display_name,k.label;
end $$;

revoke all on function private.programme_action(text,jsonb) from public;
grant execute on function private.programme_action(text,jsonb) to authenticated;
create or replace function public.programme_action(p_action text,p_data jsonb) returns uuid language sql volatile security invoker set search_path='' as $$ select private.programme_action(p_action,p_data) $$;
revoke all on function public.programme_action(text,jsonb) from public,anon;
grant execute on function public.programme_action(text,jsonb) to authenticated;

revoke all on function private.register_setup_action(text,jsonb) from public;
grant execute on function private.register_setup_action(text,jsonb) to authenticated;
create or replace function public.register_setup_action(p_action text,p_data jsonb) returns uuid language sql volatile security invoker set search_path='' as $$ select private.register_setup_action(p_action,p_data) $$;
revoke all on function public.register_setup_action(text,jsonb) from public,anon;
grant execute on function public.register_setup_action(text,jsonb) to authenticated;

revoke all on function private.programme_roster(uuid) from public;
grant execute on function private.programme_roster(uuid) to authenticated;
create or replace function public.programme_roster(p_programme uuid) returns table(client_id uuid,display_name text,from_date date,to_date date) language sql stable security invoker set search_path='' as $$ select * from private.programme_roster(p_programme) $$;
revoke all on function public.programme_roster(uuid) from public,anon;
grant execute on function public.programme_roster(uuid) to authenticated;

revoke all on function private.register_accounts(uuid,uuid) from public;
grant execute on function private.register_accounts(uuid,uuid) to authenticated;
create or replace function public.register_accounts(p_programme uuid default null,p_session uuid default null) returns table(id uuid,full_name text) language sql stable security invoker set search_path='' as $$ select * from private.register_accounts(p_programme,p_session) $$;
revoke all on function public.register_accounts(uuid,uuid) from public,anon;
grant execute on function public.register_accounts(uuid,uuid) to authenticated;

revoke all on function private.register_capabilities(uuid,uuid) from public;
grant execute on function private.register_capabilities(uuid,uuid) to authenticated;
create or replace function public.register_capabilities(p_programme uuid default null,p_session uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$ select private.register_capabilities(p_programme,p_session) $$;
revoke all on function public.register_capabilities(uuid,uuid) from public,anon;
grant execute on function public.register_capabilities(uuid,uuid) to authenticated;
