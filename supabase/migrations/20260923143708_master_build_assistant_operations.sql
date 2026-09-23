begin;
do $$ declare definition text; begin
 select pg_get_constraintdef(oid) into definition from pg_constraint where conrelid='public.gc_assistant_requests'::regclass and conname='gc_assistant_requests_tool_check';
 if definition is null then raise exception 'ASSISTANT_TOOL_CONTRACT_MISSING';end if;
 alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
 execute 'alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check (tool in (''get_business_stock'',''prepare_stock_change'',''prepare_photo_change'',''prepare_client_card_change'',''prepare_review_reply'') or '||substr(definition,7)||')';
end $$;
create function gc_private.assistant_operation_permission(operation text) returns text language sql immutable set search_path=pg_catalog as $$
 select case when operation in ('stock_restock','stock_correction','stock_consumption','stock_settings','supply_create','supply_archive') then 'products'
 when operation in ('photo_details','photo_cover','photo_remove') then 'photos' when operation='client_card' then 'client_history' when operation='review_reply' then 'reviews' end;
$$;
create function public.read_gc_business_stock(p_salon uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;begin
 if not public.p0_actor_has_permission(p_salon,p_actor,'products') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 result:=public.read_business_stock(p_salon,p_actor);
 return jsonb_build_object('salon_id',p_salon,'products',result->'products','supplies',result->'supplies');
end $$;
create function public.preview_gc_business_operation(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare operation text;permission text;target uuid;changes jsonb;before_json jsonb:='{}';payload jsonb;business public.salons%rowtype;card jsonb;allowed text[];key text;
begin
 if jsonb_typeof(p_args) is distinct from 'object' or not(p_args ?& array['operation','record_id','changes_json']) or p_args-array['operation','record_id','changes_json']<>'{}' or jsonb_typeof(p_args->'changes_json') is distinct from 'string' or octet_length(p_args->>'changes_json')>24000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 operation:=p_args->>'operation';permission:=gc_private.assistant_operation_permission(operation);
 if permission is null then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if not public.p0_actor_has_permission(p_salon,p_actor,permission) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 target:=(p_args->>'record_id')::uuid;changes:=(p_args->>'changes_json')::jsonb;
 if jsonb_typeof(changes) is distinct from 'object' or changes='{}'::jsonb then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 if (operation like 'photo_%' or operation='supply_create') is distinct from (target is null) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 allowed:=case operation
 when 'stock_restock' then array['kind','quantity','cost_cents','note']
 when 'stock_correction' then array['kind','quantity','note'] when 'stock_consumption' then array['kind','quantity','note']
 when 'stock_settings' then array['kind','track_inventory','low_stock_threshold','note']
 when 'supply_create' then array['name','unit','quantity','low_stock_threshold','note'] when 'supply_archive' then array['note']
 when 'photo_details' then array['url','category','title','caption','featured','source_locale']
 when 'photo_cover' then array['url'] when 'photo_remove' then array['url']
 when 'client_card' then array['locale','patch'] when 'review_reply' then array['reply'] end;
 if changes-allowed<>'{}'::jsonb or not(changes ?& allowed) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 payload:=jsonb_build_object('operation',operation,'record_id',target,'changes',changes);
 if permission='products' then
  if jsonb_typeof(changes->'note') is distinct from 'string' or length(trim(changes->>'note')) not between 1 and 1200 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  foreach key in array array['quantity','cost_cents','low_stock_threshold'] loop
   if changes ? key and (jsonb_typeof(changes->key) is distinct from 'number' or changes->>key !~ '^[0-9]+$' or (changes->>key)::numeric>case when key='cost_cents' then 100000000 else 1000000 end) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  end loop;
  if operation in ('stock_restock','stock_consumption') and (changes->>'quantity')::bigint<1 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if operation='stock_settings' and jsonb_typeof(changes->'track_inventory') is distinct from 'boolean' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  if operation='supply_create' then
   if jsonb_typeof(changes->'name') is distinct from 'string' or jsonb_typeof(changes->'unit') is distinct from 'string' or length(trim(changes->>'name')) not between 1 and 120 or length(trim(changes->>'unit')) not between 1 and 40 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  else
   if operation<>'supply_archive' and coalesce(changes->>'kind','') not in ('product','supply') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   if changes->>'kind'='product' then
    select jsonb_build_object('id',id,'name',name,'quantity',inventory_quantity,'revision',stock_revision,'track_inventory',track_inventory,'low_stock_threshold',low_stock_threshold) into before_json from public.salon_products where salon_id=p_salon and id=target and archived_at is null;
   else
    select jsonb_build_object('id',id,'name',name,'quantity',inventory_quantity,'revision',stock_revision,'track_inventory',true,'low_stock_threshold',low_stock_threshold) into before_json from public.business_supplies where salon_id=p_salon and id=target and archived_at is null;
   end if;
   if before_json is null then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
   if operation in ('stock_consumption','stock_restock','stock_correction') and before_json->'track_inventory'<>'true'::jsonb then raise exception 'ASSISTANT_STOCK_NOT_TRACKED';end if;
   if operation='stock_consumption' and (changes->>'quantity')::bigint>(before_json->>'quantity')::bigint then raise exception 'ASSISTANT_STOCK_INSUFFICIENT';end if;
   if operation='stock_settings' and changes->>'kind'='supply' and changes->'track_inventory'<>'true'::jsonb then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   payload:=payload||jsonb_build_object('record_name',before_json->>'name','expected_revision',before_json->'revision');
  end if;
  if coalesce((changes->>'cost_cents')::bigint,0)>0 and not public.p0_actor_has_permission(p_salon,p_actor,'finance_manage') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 elsif permission='photos' then
  select * into business from public.salons where id=p_salon;
  if jsonb_typeof(changes->'url') is distinct from 'string' or not(coalesce(to_jsonb(business.gallery_photos),'[]') ? (changes->>'url')) then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
  before_json:=jsonb_build_object('gallery_photos',business.gallery_photos,'cover_photo_url',business.cover_photo_url,'photo_metadata',coalesce(business.photo_metadata,'{}'));
  if operation='photo_details' then
   if jsonb_typeof(changes->'title') is distinct from 'string' or length(changes->>'title')>120 or jsonb_typeof(changes->'caption') is distinct from 'string' or length(changes->>'caption')>1000 or jsonb_typeof(changes->'featured') is distinct from 'boolean' or coalesce(changes->>'category','') not in ('services','before_after','space','team','client_love','other') or coalesce(changes->>'source_locale','') not in ('en','fr','es','zh-CN') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  elsif operation='photo_remove' and business.cover_photo_url=changes->>'url' then raise exception 'ASSISTANT_REPLACE_COVER_FIRST';end if;
 elsif operation='client_card' then
  card:=public.read_business_client_card(p_salon,p_actor,target);
  if card->'permissions'->'client_edit' is distinct from 'true'::jsonb then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
  if coalesce(changes->>'locale','') not in ('en','fr','es','zh-CN') or jsonb_typeof(changes->'patch') is distinct from 'object' or changes->'patch'='{}'::jsonb or (changes->'patch')-array['preferences','notes','cautions','formula']<>'{}' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  foreach key in array array['notes','cautions','formula'] loop
   if changes->'patch' ? key and card->'permissions'->(case when key='formula' then 'client_formulas' else 'client_'||key end) is distinct from 'true'::jsonb then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
  end loop;
  foreach key in array array['preferences','notes','cautions'] loop
   if changes->'patch' ? key and (jsonb_typeof(changes->'patch'->key) is distinct from 'string' or length(changes->'patch'->>key)>4000) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  end loop;
  if changes->'patch' ? 'formula' then
   if jsonb_typeof(changes->'patch'->'formula') is distinct from 'object' or (changes->'patch'->'formula')-array['instructions','color','size','length','technique','duration_minutes']<>'{}' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   for key in select jsonb_object_keys(changes->'patch'->'formula') loop
    if key='duration_minutes' then
     if changes->'patch'->'formula'->key<>'null'::jsonb and (jsonb_typeof(changes->'patch'->'formula'->key)<>'number' or changes->'patch'->'formula'->>key !~ '^[1-9][0-9]*$' or (changes->'patch'->'formula'->>key)::numeric>1440) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
    elsif jsonb_typeof(changes->'patch'->'formula'->key)<>'string' or length(changes->'patch'->'formula'->>key)>4000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
   end loop;
  end if;
  before_json:=jsonb_build_object('revision',card->'revision','booking_id',target,'preferences',card->'preferences','notes',card->'notes','cautions',card->'cautions','visits',card->'visits');
  payload:=payload||jsonb_build_object('expected_revision',card->'revision');
 else
  select jsonb_build_object('id',id,'written_review',written_review,'salon_reply',salon_reply,'reply_revision',reply_revision,'moderation_status',moderation_status) into before_json from public.reviews where salon_id=p_salon and id=target;
  if before_json is null then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
  if jsonb_typeof(changes->'reply') is distinct from 'string' or length(trim(changes->>'reply')) not between 1 and 2000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
  payload:=payload||jsonb_build_object('expected_revision',before_json->'reply_revision');
 end if;
 return jsonb_build_object('salon_id',p_salon,'before',before_json,'payload',payload);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'ASSISTANT_INVALID_INPUT';
 when others then
  if sqlerrm='CLIENT_NOT_FOUND' then raise exception 'ASSISTANT_RECORD_NOT_FOUND';
  elsif sqlerrm='CLIENT_ACCESS_DENIED' then raise exception 'ASSISTANT_ACCESS_DENIED';else raise;end if;
end $$;

alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_operations;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;fresh jsonb;written jsonb;saved jsonb;operation text;permission text;changes jsonb;payload jsonb;target uuid;failure text;action text;replayed boolean;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool not in ('prepare_stock_change','prepare_photo_change','prepare_client_card_change','prepare_review_reply') then return public.confirm_gc_assistant_request_before_operations(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 operation:=r.arguments->>'operation';permission:=gc_private.assistant_operation_permission(operation);
 if permission is null or r.tool is distinct from (case permission when 'products' then 'prepare_stock_change' when 'photos' then 'prepare_photo_change' when 'client_history' then 'prepare_client_card_change' when 'reviews' then 'prepare_review_reply' end) or r.permission is distinct from permission or r.risk_class<>4 or not public.p0_actor_has_permission(p_salon,p_actor,permission) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 if r.confirmed_at is null and (r.failure_code is not null or r.expires_at<=now()) then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 replayed:=r.confirmed_at is not null;
 -- Replays return the original verified receipt, not stale values described as current.
 -- Fresh reads remain separate tools and must repeat field/tenant authorization.
 if replayed then return jsonb_build_object('verified',true,'replayed',true,'result',r.result);end if;
 begin
  fresh:=public.preview_gc_business_operation(p_salon,p_actor,r.arguments);
  if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  changes:=(r.arguments->>'changes_json')::jsonb;target:=(r.arguments->>'record_id')::uuid;
  if permission='products' then
   action:=case operation when 'supply_create' then 'create_supply' when 'supply_archive' then 'archive_supply' else substr(operation,7) end;
   payload:=changes-'kind';
   if payload->'cost_cents'='0'::jsonb then payload:=payload-'cost_cents';end if;
   if target is not null then payload:=payload||jsonb_build_object(case when changes->>'kind'='product' then 'product_id' else 'supply_id' end,target,'expected_revision',r.execution_payload->'expected_revision');end if;
   written:=public.record_business_stock(p_salon,p_actor,r.id,action,payload);
   if written->'verified' is distinct from 'true'::jsonb then raise exception 'ASSISTANT_READBACK_FAILED';end if;
   saved:=jsonb_build_object('id',written->'id','operation',operation,'verified',true);
  elsif permission='photos' then
   if operation='photo_details' then
    written:=public.update_business_photo_details(p_salon,p_actor,changes->>'url',changes-'url',r.before_summary->'photo_metadata'->(changes->>'url'));
    select photo_metadata->(changes->>'url') into saved from public.salons where id=p_salon;
    if saved is distinct from changes-'url' then raise exception 'ASSISTANT_READBACK_FAILED';end if;
   elsif operation='photo_cover' then
    update public.salons set cover_photo_url=changes->>'url' where id=p_salon returning jsonb_build_object('cover_photo_url',cover_photo_url) into saved;
    if saved->>'cover_photo_url' is distinct from changes->>'url' then raise exception 'ASSISTANT_READBACK_FAILED';end if;
   else
    update public.salons set gallery_photos=gallery_photos-(changes->>'url'),photo_metadata=coalesce(photo_metadata,'{}')-(changes->>'url') where id=p_salon returning jsonb_build_object('photo_count',coalesce(jsonb_array_length(gallery_photos),0),'removed_url',changes->>'url') into saved;
    if exists(select 1 from public.salons where id=p_salon and gallery_photos ? (changes->>'url')) then raise exception 'ASSISTANT_READBACK_FAILED';end if;
   end if;
  elsif operation='client_card' then
   written:=public.save_business_client_card(p_salon,p_actor,target,r.id,(r.execution_payload->>'expected_revision')::integer,changes->>'locale',changes->'patch');
   if written->'verified' is distinct from 'true'::jsonb then raise exception 'ASSISTANT_READBACK_FAILED';end if;
   saved:=public.read_business_client_card(p_salon,p_actor,target);
   if saved->'card_id' is distinct from written->'card_id' or (saved->>'revision')::bigint<(written->>'revision')::bigint then raise exception 'ASSISTANT_READBACK_FAILED';end if;
   saved:=jsonb_build_object('card_id',saved->'card_id','revision',saved->'revision','booking_id',target);
  else
   written:=public.save_business_review_reply(p_salon:=p_salon,p_review:=target,p_actor:=p_actor,p_request:=r.id,p_revision:=(r.execution_payload->>'expected_revision')::integer,p_reply:=changes->>'reply',p_moderation:='Clear',p_reason:=null,p_source:=null);
   saved:=jsonb_build_object('review_id',target,'content_status',written->'content_status','revision',written->'review'->'reply_revision');
   if saved->>'revision' is null then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  end if;
  saved:=jsonb_build_object('operation',operation,'provider_action',false)||saved;
  update public.gc_assistant_requests set confirmed_at=now(),result=saved where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'confirmed',p_actor,jsonb_build_object('after',saved,'risk_class',4));
  return jsonb_build_object('verified',true,'replayed',false,'result',saved);
 exception when others then
  failure:=case when sqlerrm ~ '^ASSISTANT_[A-Z_]+$' then sqlerrm when sqlerrm ~ 'ACCESS_DENIED|FORBIDDEN|PERMISSION' then 'ASSISTANT_ACCESS_DENIED' when sqlerrm ~ 'STALE|CONFLICT' then 'ASSISTANT_PREVIEW_STALE' else 'ASSISTANT_ACTION_FAILED' end;
  update public.gc_assistant_requests set failure_code=failure where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details) values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function gc_private.assistant_operation_permission(text),public.read_gc_business_stock(uuid,uuid),public.preview_gc_business_operation(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_operations(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_gc_business_stock(uuid,uuid),public.preview_gc_business_operation(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_operations(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923143708"'::jsonb,draft_value='"20260923143708"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
