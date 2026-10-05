-- Run as database administrator. All fictitious records roll back; no provider is invoked.
begin;
do $$ begin
 if (select register_email_enabled from public.settings where id=1) is distinct from false then raise exception 'Pause register emails before smoke testing'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select user_id::text from public.profiles where role='owner' and is_active and archived_at is null limit 1),true);
set local role authenticated;
do $$
declare client uuid; party uuid; sid uuid; job uuid; count_jobs int;
begin
 client:=public.register_action('create_client',jsonb_build_object('full_name','Roll-back workflow fixture','display_name','Fixture T.'));
 party:=public.register_action('create_party',jsonb_build_object('label','Roll-back test contact','email','workflow@example.invalid','kind','school','address_verified',true,'reason','Synthetic smoke-test verification'));
 perform public.register_action('link_contact',jsonb_build_object('client_id',client,'party_id',party,'active',true,'notify_attendance',true,'notify_departure',true,'notify_absence',true,'address_verified',true,'sharing_authorised',true,'reason','Synthetic test authority'));
 sid:=public.register_action('create_session',jsonb_build_object('name','Rollback register workflow','external_label','RCG session','kind','group','starts_at',now()-interval '2 hours','ends_at',now()-interval '1 hour'));
 perform public.register_action('enrol',jsonb_build_object('session_id',sid,'revision',1,'client_id',client));
 perform public.register_action('record_attendance',jsonb_build_object('session_id',sid,'revision',2,'rows',jsonb_build_array(jsonb_build_object('client_id',client,'status','present','marked_at',now()-interval '110 minutes','arrived_at',now()-interval '110 minutes'))));
 select id into job from public.register_notifications where session_id=sid and status='pending';
 if job is null then raise exception 'Arrival queue missing'; end if;
 perform public.register_action('record_attendance',jsonb_build_object('session_id',sid,'revision',3,'rows',jsonb_build_array(jsonb_build_object('client_id',client,'status','present','marked_at',now()-interval '109 minutes','arrived_at',now()-interval '109 minutes'))));
 if not exists(select 1 from public.register_notifications where id=job and status='pending') then raise exception 'Pending job was not updated in place'; end if;
 perform public.register_action('record_attendance',jsonb_build_object('session_id',sid,'revision',4,'rows',jsonb_build_array(jsonb_build_object('client_id',client,'status','present','marked_at',now()-interval '109 minutes','arrived_at',now()-interval '109 minutes','departed_at',now()-interval '60 minutes'))));
 select count(*) into count_jobs from public.register_notifications where session_id=sid and status='pending';
 if count_jobs<>2 then raise exception 'Expected separate arrival and departure jobs'; end if;
 if exists(select 1 from public.register_notifications where session_id=sid and payload::text like '%Roll-back workflow fixture%') then raise exception 'Full name leaked into queue'; end if;
 perform public.register_action('record_attendance',jsonb_build_object('session_id',sid,'revision',5,'rows',jsonb_build_array(jsonb_build_object('client_id',client,'status','excused'))));
 if exists(select 1 from public.register_notifications where session_id=sid and status='pending') then raise exception 'Excused must suppress notifications'; end if;
 if not exists(select 1 from public.register_live_roster(sid) where client_id=client and status='excused' and arrived_at is null and departed_at is null and marked_at is null) then raise exception 'Excused times were not cleared'; end if;
end $$;
rollback;
