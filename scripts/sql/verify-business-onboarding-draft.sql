\set ON_ERROR_STOP on
begin;
set local request.jwt.claim.role='service_role';
insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values
 ('17400000-0000-4000-8000-000000000001','onboard-owner@example.invalid','{"role":"salon_owner"}','{}'),
 ('17400000-0000-4000-8000-000000000002','onboard-other@example.invalid','{"role":"salon_owner"}','{}');
insert into public.platform_identities(user_id,email_normalized,primary_role,status) values
 ('17400000-0000-4000-8000-000000000001','onboard-owner@example.invalid','salon_owner','Active'),
 ('17400000-0000-4000-8000-000000000002','onboard-other@example.invalid','salon_owner','Active') on conflict(user_id) do nothing;
insert into public.salons(id,name,slug,email,user_id,status,subscription_tier) values
 ('17400000-0000-4000-8000-000000000003','Onboarding Fixture','onboard-fixture','onboard-owner@example.invalid','17400000-0000-4000-8000-000000000001','New','Free-seed'),
 ('17400000-0000-4000-8000-000000000004','Other Fixture','other-onboard-fixture','onboard-other@example.invalid','17400000-0000-4000-8000-000000000002','New','Free-seed');
set local role service_role;
do $$
declare
 s uuid:='17400000-0000-4000-8000-000000000003'; u uuid:='17400000-0000-4000-8000-000000000001'; other_s uuid:='17400000-0000-4000-8000-000000000004'; other_u uuid:='17400000-0000-4000-8000-000000000002';
 d jsonb; a jsonb; f jsonb; g uuid; source jsonb:='{"kind":"manual","reference":"owned source","permitted":true,"locale":"en"}'; reviewed text[]:=array['identity','services','hours','photos','team','policies'];
begin
 select id into g from public.service_groups where is_active and archived_at is null order by id limit 1;
 f:=jsonb_build_object('identity',jsonb_build_object('name','Reviewed Fixture','description','Owner supplied description','phone','','address_street','','address_city','','address_state','','address_zip',''),
   'services',jsonb_build_array(jsonb_build_object('name','Imported Fixture Service','price',125,'minutes',90,'group_id',g)),
   'hours',jsonb_build_object('Mon',jsonb_build_object('closed',false,'open','09:00','close','17:00')),'photos','[]'::jsonb,'team',jsonb_build_array(jsonb_build_object('name','Fixture Stylist','bio','Owner supplied bio')),'policies',null);
 d:=public.save_business_onboarding_draft(s,u,source,f,'["photos","policies"]');
 if (select name from public.salons where id=s)<>'Onboarding Fixture' then raise exception 'draft changed canonical profile'; end if;
 if d->>'status'<>'draft' or (select count(*) from public.styles where salon_id=s)<>0 then raise exception 'draft changed canonical services'; end if;
 begin perform public.apply_business_onboarding_draft(s,other_u,(d->>'id')::uuid,1,reviewed,true,false); raise exception 'foreign owner accepted'; exception when others then if sqlerrm<>'ONBOARDING_FORBIDDEN' then raise; end if; end;
 begin perform public.apply_business_onboarding_draft(other_s,other_u,(d->>'id')::uuid,1,reviewed,true,false); raise exception 'foreign draft accepted'; exception when others then if sqlerrm<>'ONBOARDING_NOT_FOUND' then raise; end if; end;
 begin perform public.apply_business_onboarding_draft(s,u,(d->>'id')::uuid,1,array['identity'],true,false); raise exception 'partial review accepted'; exception when others then if sqlerrm<>'ONBOARDING_REVIEW_REQUIRED' then raise; end if; end;
 a:=public.apply_business_onboarding_draft(s,u,(d->>'id')::uuid,1,reviewed,true,false);
 if a->>'status'<>'applied' or a->'result'->>'published'<>'false' then raise exception 'wrong applied status'; end if;
 if (select name from public.salons where id=s)<>'Reviewed Fixture' or (select owner_unpublished_at is null or is_discoverable from public.salons where id=s) then raise exception 'profile/hold not preserved'; end if;
 if (select count(*) from public.styles where salon_id=s and is_draft and base_price=125 and duration_min_hours=1.5)<>1 then raise exception 'service facts not persisted in draft'; end if;
 if (select count(*) from public.stylists where salon_id=s and not is_active and name='Fixture Stylist')<>1 then raise exception 'team facts not persisted inactive'; end if;
 update public.salons set name='Later Owner Change' where id=s;
 perform public.apply_business_onboarding_draft(s,u,(d->>'id')::uuid,1,reviewed,true,false);
 if (select name from public.salons where id=s)<>'Later Owner Change' or (select count(*) from public.styles where salon_id=s)<>1 then raise exception 'replay wrote canonical records'; end if;
 f:=jsonb_set(jsonb_set(f,'{services}','[]'),'{team}','[]');
 d:=public.save_business_onboarding_draft(s,u,source,f,'[]');
 update public.salons set name='Concurrent Edit' where id=s;
 begin perform public.apply_business_onboarding_draft(s,u,(d->>'id')::uuid,1,reviewed,true,false); raise exception 'stale workspace accepted'; exception when others then if sqlerrm<>'ONBOARDING_WORKSPACE_CHANGED' then raise; end if; end;
 raise notice 'onboarding own-business draft/apply/replay/stale assertions passed';
end $$;
reset role;
-- A currently public/active business requires a different, explicit reviewed
-- action. Preserve existing catalog/team and the published policy pointer.
update public.salons set owner_unpublished_at=null,owner_unpublished_reason=null where id='17400000-0000-4000-8000-000000000003';
update public.salons set status='Active',is_discoverable=true where id='17400000-0000-4000-8000-000000000003';
set local role service_role;
do $$
declare s uuid:='17400000-0000-4000-8000-000000000003';u uuid:='17400000-0000-4000-8000-000000000001';d jsonb;a jsonb;f jsonb;
 reviewed text[]:=array['identity','services','hours','photos','team','policies'];
begin
 f:=jsonb_build_object('identity',jsonb_build_object('name','Reviewed Existing Business','description','','phone','','address_street','','address_city','','address_state','','address_zip',''),
 'services',jsonb_build_array(jsonb_build_object('name','Uncertain Service','price',null,'minutes',null,'group_id',null)),
 'hours','{}'::jsonb,'photos','[]'::jsonb,'team','[]'::jsonb,'policies','{"cancellation_hours":24,"rescheduling_hours":24,"grace_minutes":15,"no_show":"contact_business","late_arrival":"contact_business","deposit_treatment":"platform_rules","balance_due":"after_service","satisfaction":"contact_business","preparation":"","guests":"ask_first","children":"ask_first","walk_ins":"ask_first","notes":"","business_policy_text":"Owner policy source"}'::jsonb);
 d:=public.save_business_onboarding_draft(s,u,'{"kind":"website","reference":"https://fixture.invalid","permitted":true,"locale":"fr"}',f,'["services.0.price","services.0.minutes","services.0.group_id"]');
 begin perform public.apply_business_onboarding_draft(s,u,(d->>'id')::uuid,1,reviewed,true,false); raise exception 'live change accepted without public impact review'; exception when others then if sqlerrm<>'ONBOARDING_LIVE_BUSINESS_REVIEW_REQUIRED' then raise; end if; end;
 a:=public.apply_business_onboarding_draft(s,u,(d->>'id')::uuid,1,reviewed,false,true);
 if (select name from public.salons where id=s)<>'Reviewed Existing Business' or (select owner_unpublished_at is not null from public.salons where id=s) then raise exception 'existing business apply/hold incorrect'; end if;
 if (select count(*) from public.styles where salon_id=s)<>1 or exists(select 1 from public.styles where salon_id=s and name='Uncertain Service') then raise exception 'missing service facts fabricated or prior services changed'; end if;
 if (select count(*) from public.stylists where salon_id=s)<>1 then raise exception 'existing team changed'; end if;
 if (select business_policy_revision_id is not null from public.salons where id=s) then raise exception 'policy silently published'; end if;
 if not exists(select 1 from public.business_policy_revisions where id=(a->'result'->>'policy_revision_id')::uuid and salon_id=s and published_at is null and source_locale='fr' and policy->>'business_policy_text'='Owner policy source') then raise exception 'policy draft/provenance not persisted'; end if;
 if (a->'result'->>'published')::boolean is distinct from (select is_discoverable from public.salons where id=s) then raise exception 'publication result differs from canonical lifecycle'; end if;
 raise notice 'onboarding explicit live impact, retained records, unknown facts, and policy draft assertions passed';
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.business_onboarding_drafts','SELECT') or has_table_privilege('authenticated','public.business_onboarding_drafts','SELECT') then raise exception 'private drafts visible to browser role'; end if;
 if has_function_privilege('authenticated','public.apply_business_onboarding_draft(uuid,uuid,uuid,integer,text[],boolean,boolean)','EXECUTE') then raise exception 'browser can bypass confirmation route'; end if;
end $$;
rollback;
