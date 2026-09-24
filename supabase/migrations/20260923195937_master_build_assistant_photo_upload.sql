-- Attach a finalized own-account gallery upload only after assistant review.
begin;
set local lock_timeout='5s';
create function public.preview_gc_assistant_photo_upload(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c jsonb;b public.salons%rowtype;m public.media_assets%rowtype;
begin
 if not public.p0_actor_has_permission(p_salon,p_actor,'photos') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if jsonb_typeof(p_args) is distinct from 'object' or not p_args?&array['operation','record_id','changes_json'] or p_args-array['operation','record_id','changes_json']<>'{}' or p_args->>'operation'<>'photo_add' or p_args->'record_id'<>'null' or jsonb_typeof(p_args->'changes_json') is distinct from 'string' or octet_length(p_args->>'changes_json')>6000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 c:=(p_args->>'changes_json')::jsonb;
 if jsonb_typeof(c) is distinct from 'object' or not(c?'url') or c-'url'<>'{}' or jsonb_typeof(c->'url') is distinct from 'string' or length(c->>'url') not between 1 and 2048 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 select * into b from public.salons where id=p_salon;
 select * into m from public.media_assets where salon_id=p_salon and owner_user_id=p_actor and public_url=c->>'url' and bucket_id='salon-photos' and media_kind='gallery' and status='Staged' and archived_at is null;
 if not found or not exists(select 1 from public.media_upload_sessions s where s.finalized_asset_id=m.id and s.owner_user_id=p_actor and s.salon_id=p_salon and s.status='Finalized' and s.attachment='{}') then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
 if coalesce(b.gallery_photos,'[]') ? m.public_url then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if jsonb_array_length(coalesce(b.gallery_photos,'[]'))>=16 then raise exception 'ASSISTANT_GALLERY_FULL';end if;
 return jsonb_build_object('salon_id',p_salon,'before',jsonb_build_object('gallery_photos',coalesce(b.gallery_photos,'[]'),'asset_fingerprint',md5(to_jsonb(m)::text)),'payload',jsonb_build_object('operation','photo_add','record_id',null,'asset_id',m.id,'changes',c,'photo_count_after',jsonb_array_length(coalesce(b.gallery_photos,'[]'))+1,'provider_action',false));
exception when invalid_text_representation then raise exception 'ASSISTANT_INVALID_INPUT';
end $$;
alter function public.preview_gc_business_operation(uuid,uuid,jsonb) rename to preview_gc_business_operation_before_photo_upload;
create function public.preview_gc_business_operation(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$begin
 if p_args->>'operation'='photo_add' then return public.preview_gc_assistant_photo_upload(p_salon,p_actor,p_args);end if;
 return public.preview_gc_business_operation_before_photo_upload(p_salon,p_actor,p_args);
end $$;
alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_photo_upload;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;fresh jsonb;saved jsonb;url text;failure text;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool<>'prepare_photo_change' or r.arguments->>'operation'<>'photo_add' then return public.confirm_gc_assistant_request_before_photo_upload(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 if not public.p0_actor_has_permission(p_salon,p_actor,'photos') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 if r.risk_class<>4 or r.permission<>'photos' then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if r.confirmed_at is not null then return jsonb_build_object('verified',true,'replayed',true,'result',r.result);end if;
 if r.failure_code is not null or r.expires_at<=now() then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 begin
  perform 1 from public.media_assets where id=(r.execution_payload->>'asset_id')::uuid and salon_id=p_salon and owner_user_id=p_actor for update;
  fresh:=public.preview_gc_assistant_photo_upload(p_salon,p_actor,r.arguments);
  if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  url:=r.execution_payload#>>'{changes,url}';
  update public.salons set gallery_photos=coalesce(gallery_photos,'[]')||jsonb_build_array(url) where id=p_salon;
  if not exists(select 1 from public.salons where id=p_salon and gallery_photos ? url and jsonb_array_length(gallery_photos)=(r.execution_payload->>'photo_count_after')::integer) or not exists(select 1 from public.media_assets where id=(r.execution_payload->>'asset_id')::uuid and salon_id=p_salon and status='Attached' and attached_record_type='salons' and attached_record_id=p_salon::text) then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  saved:=jsonb_build_object('operation','photo_add','url',url,'photo_count',r.execution_payload->'photo_count_after','provider_action',false);
  update public.gc_assistant_requests set confirmed_at=now(),result=saved where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'confirmed',p_actor,jsonb_build_object('after',saved,'risk_class',4));
  return jsonb_build_object('verified',true,'replayed',false,'result',saved);
 exception when others then
  failure:=case when sqlerrm~'^ASSISTANT_[A-Z_]+$' then sqlerrm else 'ASSISTANT_ACTION_FAILED' end;
  update public.gc_assistant_requests set failure_code=failure where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function public.preview_gc_assistant_photo_upload(uuid,uuid,jsonb),public.preview_gc_business_operation(uuid,uuid,jsonb),public.preview_gc_business_operation_before_photo_upload(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_photo_upload(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.preview_gc_assistant_photo_upload(uuid,uuid,jsonb),public.preview_gc_business_operation(uuid,uuid,jsonb),public.preview_gc_business_operation_before_photo_upload(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_photo_upload(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923195937"',draft_value='"20260923195937"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
