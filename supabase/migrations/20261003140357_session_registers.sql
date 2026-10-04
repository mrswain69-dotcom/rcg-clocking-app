-- Client attendance is a separate permission domain from staff clocking.
alter table public.profiles add column if not exists can_manage_registers boolean not null default false;
create table public.register_clients (
 id uuid primary key default gen_random_uuid(), full_name text not null check(length(full_name) between 2 and 200),
 display_name text not null check(length(display_name) between 2 and 80), active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.register_contacts (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.register_clients(id),
 label text not null check(length(label) between 2 and 120), email text not null check(email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 active boolean not null default true, approved_at timestamptz not null default now(),
 approved_by uuid not null references public.profiles(id), notify_absence boolean not null default false,
 unique(client_id,email)
);
create table public.register_sessions (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 200),
 external_label text not null default 'RCG session' check(length(external_label) between 2 and 200),
 starts_at timestamptz not null, ends_at timestamptz not null, kind text not null check(kind in ('group','individual')),
 status text not null default 'draft' check(status in ('draft','confirmed','cancelled')),
 revision integer not null default 1, confirmed_at timestamptz, created_at timestamptz not null default now(),
 check(ends_at > starts_at)
);
create table public.register_leads (
 session_id uuid not null references public.register_sessions(id), profile_id uuid not null references public.profiles(id),
 primary key(session_id,profile_id)
);
create index register_leads_profile_idx on public.register_leads(profile_id);
create table public.register_attendance (
 session_id uuid not null references public.register_sessions(id), client_id uuid not null references public.register_clients(id),
 status text not null default 'unmarked' check(status in ('unmarked','present','late','absent','excused')),
 arrived_at timestamptz, departed_at timestamptz, recorded_at timestamptz, recorded_by uuid references public.profiles(id),
 primary key(session_id,client_id), check(departed_at is null or (arrived_at is not null and departed_at >= arrived_at)),
 check(status in ('present','late') or (arrived_at is null and departed_at is null))
);
create index register_attendance_client_idx on public.register_attendance(client_id);
create index register_attendance_actor_idx on public.register_attendance(recorded_by);
create table public.register_audit (
 id uuid primary key default gen_random_uuid(), session_id uuid references public.register_sessions(id),
 actor_id uuid not null references public.profiles(id), action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index register_audit_session_idx on public.register_audit(session_id);
create index register_audit_actor_idx on public.register_audit(actor_id);
create table public.register_notifications (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.register_sessions(id),
 client_id uuid not null references public.register_clients(id), contact_id uuid not null references public.register_contacts(id),
 revision int not null, recipient text not null, payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','blocked','superseded')),
 attempts int not null default 0, created_at timestamptz not null default now(), attempted_at timestamptz,
 first_attempted_at timestamptz, sent_at timestamptz, provider_id text, error text,
 unique(session_id,client_id,contact_id,revision)
);
create index register_notifications_contact_idx on public.register_notifications(contact_id);
create index register_notifications_client_idx on public.register_notifications(client_id);
create index register_notifications_pending_idx on public.register_notifications(status,created_at);

create or replace function private.register_manager()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where user_id = auth.uid() and is_active and archived_at is null
   and (role = 'owner' or (role = 'admin' and can_manage_registers)))
$$;
create or replace function private.can_access_register(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.register_manager() or exists(select 1 from public.register_leads l join public.profiles p on p.id = l.profile_id
  where l.session_id = p_session and p.user_id = auth.uid() and p.is_active and p.archived_at is null)
$$;
revoke all on function private.register_manager() from public;
revoke all on function private.can_access_register(uuid) from public;
grant execute on function private.register_manager(), private.can_access_register(uuid) to authenticated;

alter table public.register_clients enable row level security;
alter table public.register_contacts enable row level security;
alter table public.register_sessions enable row level security;
alter table public.register_leads enable row level security;
alter table public.register_attendance enable row level security;
alter table public.register_audit enable row level security;
alter table public.register_notifications enable row level security;
revoke all on public.register_clients,public.register_contacts,public.register_sessions,public.register_leads,public.register_attendance,public.register_audit,public.register_notifications from public,anon,authenticated;
grant select on public.register_clients,public.register_contacts,public.register_sessions,public.register_leads,public.register_attendance,public.register_audit,public.register_notifications to authenticated;
grant all on public.register_clients,public.register_contacts,public.register_sessions,public.register_leads,public.register_attendance,public.register_audit,public.register_notifications to service_role;
create policy register_clients_read on public.register_clients for select to authenticated using(private.register_manager());
create policy register_contacts_read on public.register_contacts for select to authenticated using(private.register_manager());
create policy register_sessions_read on public.register_sessions for select to authenticated using(private.can_access_register(id));
create policy register_leads_read on public.register_leads for select to authenticated using(private.can_access_register(session_id));
create policy register_attendance_read on public.register_attendance for select to authenticated using(private.can_access_register(session_id));
create policy register_audit_read on public.register_audit for select to authenticated using(private.register_manager() or (session_id is not null and private.can_access_register(session_id)));
create policy register_notifications_read on public.register_notifications for select to authenticated using(private.can_access_register(session_id));

-- Returns minimal client identity to assigned leads without granting reads of full names.
create or replace function private.register_roster(p_session uuid)
returns table(client_id uuid,display_name text,status text,arrived_at timestamptz,departed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.can_access_register(p_session) then raise exception 'Register access denied'; end if;
 return query select c.id,c.display_name,a.status,a.arrived_at,a.departed_at from public.register_attendance a
 join public.register_clients c on c.id = a.client_id where a.session_id = p_session order by c.display_name,c.id;
end $$;
revoke all on function private.register_roster(uuid) from public;
grant execute on function private.register_roster(uuid) to authenticated;
create or replace function public.register_roster(p_session uuid)
returns table(client_id uuid,display_name text,status text,arrived_at timestamptz,departed_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.register_roster(p_session) $$;
revoke all on function public.register_roster(uuid) from public,anon;
grant execute on function public.register_roster(uuid) to authenticated;

create or replace function private.register_recipient_preview(p_session uuid)
returns table(client_id uuid,display_name text,contact_label text,email text,attendance_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.can_access_register(p_session) then raise exception 'Register access denied'; end if;
 return query select c.id,c.display_name,k.label,k.email,a.status from public.register_attendance a
 join public.register_clients c on c.id = a.client_id join public.register_contacts k on k.client_id = c.id
 where a.session_id = p_session and k.active and c.active and (a.status in ('present','late') or (a.status = 'absent' and k.notify_absence) or exists(select 1 from public.register_notifications n where n.session_id = p_session and n.client_id = c.id and n.contact_id = k.id and n.status = 'sent'))
 order by c.display_name,k.label;
end $$;
revoke all on function private.register_recipient_preview(uuid) from public;
grant execute on function private.register_recipient_preview(uuid) to authenticated;
create or replace function public.register_recipient_preview(p_session uuid)
returns table(client_id uuid,display_name text,contact_label text,email text,attendance_status text)
language sql stable security invoker set search_path = '' as $$ select * from private.register_recipient_preview(p_session) $$;
revoke all on function public.register_recipient_preview(uuid) from public,anon;
grant execute on function public.register_recipient_preview(uuid) to authenticated;

-- One transactional mutation surface; every action validates identity, permission and revision.
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
   where id = (p_data->>'profile_id')::uuid and role = 'admin';
   if not found then raise exception 'Choose an administrator'; end if;
   insert into public.register_audit(actor_id,action,detail) values(v_actor.id,p_action,p_data);
   return (p_data->>'profile_id')::uuid;
 end if;
 if p_action in ('create_client','approve_contact','deactivate_contact','create_session','assign_lead','enrol','cancel') and not private.register_manager() then
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
   v_id := v_session_id;
   if p_action = 'assign_lead' then
     if not exists(select 1 from public.profiles where id = (p_data->>'profile_id')::uuid and profile_type = 'account' and is_active and archived_at is null) then raise exception 'Active account required for lead'; end if;
     insert into public.register_leads(session_id,profile_id) values(v_id,(p_data->>'profile_id')::uuid) on conflict do nothing;
   elsif p_action = 'enrol' then
     if v_session.status <> 'draft' then raise exception 'Only draft rosters may change'; end if;
     if v_session.kind = 'individual' and exists(select 1 from public.register_attendance where session_id = v_id) then raise exception 'Individual session already has an attendee'; end if;
     if not exists(select 1 from public.register_clients where id = (p_data->>'client_id')::uuid and active) then raise exception 'Active client required'; end if;
     insert into public.register_attendance(session_id,client_id) values(v_id,(p_data->>'client_id')::uuid) on conflict do nothing;
   elsif p_action = 'save_attendance' then
     if v_session.status = 'confirmed' and (not private.register_manager() or v_reason is null) then raise exception 'Manager and correction reason required'; end if;
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
revoke all on function private.register_action(text,jsonb) from public;
grant execute on function private.register_action(text,jsonb) to authenticated;
create or replace function public.register_action(p_action text,p_data jsonb)
returns uuid language sql security invoker set search_path = '' as $$ select private.register_action(p_action,p_data) $$;
revoke all on function public.register_action(text,jsonb) from public,anon;
grant execute on function public.register_action(text,jsonb) to authenticated;

-- Service-only queue claim prevents concurrent workers sending the same message.
create or replace function public.claim_register_notifications(p_session uuid)
returns setof public.register_notifications language sql volatile security invoker set search_path = '' as $$
 update public.register_notifications n set status = 'sending',attempts = attempts + 1,attempted_at = now(),first_attempted_at = coalesce(first_attempted_at,now()),error = null
 where n.id in (select q.id from public.register_notifications q join public.register_contacts c on c.id = q.contact_id
 join public.register_sessions s on s.id = q.session_id
 where q.session_id = p_session and s.status = 'confirmed' and c.active and c.email = q.recipient
 and q.attempts < 5 and (q.first_attempted_at is null or q.first_attempted_at > now() - interval '23 hours')
 and (q.status in ('pending','failed') or (q.status = 'sending' and q.attempted_at < now() - interval '5 minutes'))
 order by q.created_at limit 50 for update of q skip locked)
 returning n.*
$$;
revoke all on function public.claim_register_notifications(uuid) from public,anon,authenticated;
grant execute on function public.claim_register_notifications(uuid) to service_role;

create or replace function private.register_report(p_from timestamptz,p_to timestamptz)
returns table(session_id uuid,client_id uuid,display_name text,session_name text,starts_at timestamptz,ends_at timestamptz,session_status text,attendance_status text,arrived_at timestamptz,departed_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select s.id,c.id,case when private.register_manager() then c.full_name else c.display_name end,
 s.name,s.starts_at,s.ends_at,s.status,a.status,a.arrived_at,a.departed_at
 from public.register_sessions s join public.register_attendance a on a.session_id = s.id
 join public.register_clients c on c.id = a.client_id
 where private.can_access_register(s.id) and s.starts_at >= p_from and s.starts_at < p_to
 order by s.starts_at desc,c.display_name limit 5000
$$;
revoke all on function private.register_report(timestamptz,timestamptz) from public;
grant execute on function private.register_report(timestamptz,timestamptz) to authenticated;
create or replace function public.register_report(p_from timestamptz,p_to timestamptz)
returns table(session_id uuid,client_id uuid,display_name text,session_name text,starts_at timestamptz,ends_at timestamptz,session_status text,attendance_status text,arrived_at timestamptz,departed_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from private.register_report(p_from,p_to) $$;
revoke all on function public.register_report(timestamptz,timestamptz) from public,anon;
grant execute on function public.register_report(timestamptz,timestamptz) to authenticated;
