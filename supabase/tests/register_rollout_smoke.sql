-- Run with a privileged SQL connection. Every fixture and permission grant rolls back.
-- Does not invoke Edge Functions or send email. Existing people/clocking rows are not edited.
begin;
do $$
declare
 owner_uid uuid; test_uid uuid:=gen_random_uuid(); test_profile uuid:=gen_random_uuid();
 outsider_uid uuid:=gen_random_uuid(); outsider_profile uuid:=gen_random_uuid();
 client uuid; extra_client uuid; programme uuid; session uuid; prog_revision int:=1;
 count_rows int; denied boolean; settings_enabled boolean;
begin
 select user_id into owner_uid from public.profiles where role='owner' and is_active and archived_at is null limit 1;
 if owner_uid is null then raise exception 'Active owner fixture is required'; end if;
 select register_email_enabled into settings_enabled from public.settings where id=1;
 if settings_enabled is distinct from false then raise exception 'Keep delivery paused during smoke testing'; end if;
 insert into auth.users(id,email) values(test_uid,test_uid::text||'@example.invalid'),(outsider_uid,outsider_uid::text||'@example.invalid');
 insert into public.profiles(id,user_id,full_name,email,role,profile_type,is_active,register_account_type)
 values(test_profile,test_uid,'RCG temporary rollout lead',test_uid::text||'@example.invalid','user','account',true,'therapist'),
 (outsider_profile,outsider_uid,'RCG temporary unrelated user',outsider_uid::text||'@example.invalid','user','account',true,'standard');
 perform set_config('request.jwt.claim.sub',owner_uid::text,true);
 set local role authenticated;
 client:=public.register_action('create_client',jsonb_build_object('full_name','Fictitious Rollout Client','display_name','Test R.'));
 extra_client:=public.register_action('create_client',jsonb_build_object('full_name','Unallocated Rollout Client','display_name','Test U.'));
 perform public.register_action('approve_contact',jsonb_build_object('client_id',client,'label','Fictitious test contact','email','rollout-test@example.invalid','address_verified',true,'sharing_authorised',true,'reason','Synthetic SQL fixture; transaction rollback'));
 programme:=public.programme_action('create_programme',jsonb_build_object('name','Temporary rollout programme','external_label','RCG session','kind','group','first_date',current_date+7,'last_date',current_date+28,'start_time','10:00','end_time','12:00','interval_weeks',1,'excluded_dates',jsonb_build_array(current_date+21)));
 perform public.programme_action('programme_enrol',jsonb_build_object('programme_id',programme,'revision',prog_revision,'client_id',client,'from_date',current_date+7,'to_date',current_date+14)); prog_revision:=prog_revision+1;
 perform public.programme_action('programme_permission',jsonb_build_object('programme_id',programme,'revision',prog_revision,'profile_id',test_profile,'access_role','viewer')); prog_revision:=prog_revision+1;
 perform public.programme_action('generate_sessions',jsonb_build_object('programme_id',programme,'revision',prog_revision)); prog_revision:=prog_revision+1;
 perform public.programme_action('generate_sessions',jsonb_build_object('programme_id',programme,'revision',prog_revision)); prog_revision:=prog_revision+1;
 select count(*) into count_rows from public.register_sessions where programme_id=programme;
 if count_rows<>3 then raise exception 'Generation count/duplicate protection failed'; end if;
 select id into session from public.register_sessions where programme_id=programme order by starts_at limit 1;
 perform set_config('request.jwt.claim.sub',test_uid::text,true);
 if (public.register_capabilities(null,session)->>'take')::boolean then raise exception 'Viewer acquired take permission'; end if;
 select count(*) into count_rows from public.register_clients;
 if count_rows<>0 then raise exception 'Viewer saw full client directory'; end if;
 select count(*) into count_rows from public.register_roster(session);
 if count_rows<>1 then raise exception 'Viewer could not read assigned roster'; end if;
 denied:=false;
 begin perform public.register_action('save_attendance',jsonb_build_object('session_id',session,'revision',1,'rows','[]'::jsonb)); exception when raise_exception then denied:=SQLERRM like '%Attendance permission%'; end;
 if not denied then raise exception 'Viewer save was not denied'; end if;
 denied:=false;
 begin perform public.register_recipient_preview(session); exception when raise_exception then denied:=SQLERRM like '%access denied%'; end;
 if not denied then raise exception 'Viewer saw recipient preview'; end if;
 perform set_config('request.jwt.claim.sub',outsider_uid::text,true);
 select count(*) into count_rows from public.register_sessions where programme_id=programme;
 if count_rows<>0 then raise exception 'Unrelated account saw sessions'; end if;
 perform set_config('request.jwt.claim.sub',owner_uid::text,true);
 perform public.programme_action('programme_permission',jsonb_build_object('programme_id',programme,'revision',prog_revision,'profile_id',test_profile,'access_role','lead')); prog_revision:=prog_revision+1;
 perform set_config('request.jwt.claim.sub',test_uid::text,true);
 perform public.register_action('save_attendance',jsonb_build_object('session_id',session,'revision',1,'rows',jsonb_build_array(jsonb_build_object('client_id',client,'status','present'))));
 perform public.register_action('confirm',jsonb_build_object('session_id',session,'revision',2));
 select count(*) into count_rows from public.register_notifications where session_id=session and recipient='rollout-test@example.invalid' and payload->>'display_name'='Test R.' and status='pending';
 if count_rows<>1 then raise exception 'Minimal per-client notification queue failed'; end if;
 perform set_config('request.jwt.claim.sub',owner_uid::text,true);
 perform public.register_action('save_attendance',jsonb_build_object('session_id',session,'revision',3,'rows',jsonb_build_array(jsonb_build_object('client_id',client,'status','absent')),'reason','Synthetic correction'));
 perform set_config('request.jwt.claim.sub',test_uid::text,true);
 denied:=false;
 begin perform public.register_action('confirm',jsonb_build_object('session_id',session,'revision',4)); exception when raise_exception then denied:=SQLERRM like '%Manager must confirm%'; end;
 if not denied then raise exception 'Lead reconfirmed manager correction'; end if;
 perform set_config('request.jwt.claim.sub',owner_uid::text,true);
 perform public.programme_action('programme_permission',jsonb_build_object('programme_id',programme,'revision',prog_revision,'profile_id',test_profile,'access_role','coordinator')); prog_revision:=prog_revision+1;
 perform set_config('request.jwt.claim.sub',test_uid::text,true);
 denied:=false;
 begin perform public.programme_action('programme_enrol',jsonb_build_object('programme_id',programme,'revision',prog_revision,'client_id',extra_client,'from_date',current_date+7)); exception when raise_exception then denied:=SQLERRM like '%allocate client%'; end;
 if not denied then raise exception 'Coordinator allocated unrelated client'; end if;
 perform set_config('request.jwt.claim.sub',owner_uid::text,true);
 perform public.programme_action('programme_permission',jsonb_build_object('programme_id',programme,'revision',prog_revision,'profile_id',test_profile,'access_role','none')); prog_revision:=prog_revision+1;
 perform set_config('request.jwt.claim.sub',test_uid::text,true);
 select count(*) into count_rows from public.register_sessions where programme_id=programme;
 if count_rows<>0 then raise exception 'Permission revocation did not take effect'; end if;
 reset role;
end $$;
rollback;
select 'PASS: recurrence, RLS isolation, viewer restrictions, lead confirmation, correction protection, coordinator scope and revocation; all fixtures rolled back; delivery remains paused' as smoke_test;
