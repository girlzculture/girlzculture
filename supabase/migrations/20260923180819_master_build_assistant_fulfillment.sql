-- Reviewed nonfinancial product fulfillment. No provider call, payment,
-- notification or existing order is changed by applying this migration.
begin;
set local lock_timeout='5s';
create function public.preview_gc_product_fulfillment(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare target_id uuid;c jsonb;o public.product_orders%rowtype;next_status text;k text;items jsonb;before_data jsonb;
begin
 if not public.p0_actor_has_permission(p_salon,p_actor,'products') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if jsonb_typeof(p_args) is distinct from 'object' or not p_args?&array['operation','record_id','changes_json'] or p_args-array['operation','record_id','changes_json']<>'{}' or p_args->>'operation' is distinct from 'product_fulfillment' or jsonb_typeof(p_args->'changes_json') is distinct from 'string' or octet_length(p_args->>'changes_json')>24000 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 target_id:=(p_args->>'record_id')::uuid;c:=(p_args->>'changes_json')::jsonb;
 if target_id is null or jsonb_typeof(c) is distinct from 'object' or not c?&array['fulfillment_status','carrier','tracking_number','note'] or c-array['fulfillment_status','carrier','tracking_number','note']<>'{}' or jsonb_typeof(c->'fulfillment_status') is distinct from 'string' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 next_status:=c->>'fulfillment_status';
 if next_status not in('Preparing','Ready for Pickup','Shipped','Delivered','Ready for pickup','Collected','Not collected') then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 foreach k in array array['carrier','tracking_number','note'] loop
  if jsonb_typeof(c->k) not in('string','null') or length(c->>k)>(case k when 'carrier' then 80 when 'tracking_number' then 120 else 500 end) then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 end loop;
 select * into o from public.product_orders where id=target_id and salon_id=p_salon;
 if not found then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
 if o.reservation_status is not null then
  if not ((o.reservation_status='Reserved' and next_status in('Ready for pickup','Not collected')) or (o.reservation_status='Ready for pickup' and next_status in('Collected','Not collected'))) then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 elsif not ((o.fulfillment_status='New' and next_status='Preparing') or (o.fulfillment_status='Preparing' and next_status='Ready for Pickup' and o.fulfillment_method='Pickup') or (o.fulfillment_status='Preparing' and next_status='Shipped' and o.fulfillment_method='Shipping') or (o.fulfillment_status in('Ready for Pickup','Shipped') and next_status='Delivered')) then raise exception 'ASSISTANT_PREVIEW_STALE';
 end if;
 if next_status='Shipped' then
  if coalesce(length(trim(c->>'carrier')),0)=0 or coalesce(length(trim(c->>'tracking_number')),0)=0 then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 elsif c->'carrier'<>'null' or c->'tracking_number'<>'null' then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 -- Canonical pickup release must never adjust a different business's product,
 -- even when a corrupt/moved foreign-key relation is present.
 if exists(select 1 from public.product_order_items i left join public.salon_products p on p.id=i.product_id where i.order_id=o.id and i.product_id is not null and (p.id is null or p.salon_id is distinct from p_salon)) then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'name',i.product_name,'quantity',i.quantity) order by i.id),'[]') into items from public.product_order_items i where order_id=o.id;
 before_data:=jsonb_build_object('order_id',o.id,'public_reference',o.public_reference,'fulfillment_method',o.fulfillment_method,'fulfillment_status',o.fulfillment_status,'reservation_status',o.reservation_status,'fingerprint',md5(to_jsonb(o)::text||items::text));
 return jsonb_build_object('salon_id',p_salon,'before',before_data,'payload',jsonb_build_object('operation','product_fulfillment','record_id',o.id,'record_name',o.public_reference,'changes',c,'provider_action',false,'notification_sent',false));
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'ASSISTANT_INVALID_INPUT';
end $$;

alter function public.preview_gc_business_operation(uuid,uuid,jsonb) rename to preview_gc_business_operation_before_fulfillment;
create function public.preview_gc_business_operation(p_salon uuid,p_actor uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$begin
 if p_args->>'operation'='product_fulfillment' then return public.preview_gc_product_fulfillment(p_salon,p_actor,p_args);end if;
 return public.preview_gc_business_operation_before_fulfillment(p_salon,p_actor,p_args);
end $$;

alter function public.confirm_gc_assistant_request(uuid,uuid,uuid,text) rename to confirm_gc_assistant_request_before_fulfillment;
create function public.confirm_gc_assistant_request(p_request uuid,p_salon uuid,p_actor uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.gc_assistant_requests%rowtype;fresh jsonb;c jsonb;o public.product_orders%rowtype;actual public.product_orders%rowtype;receipt jsonb;target_id uuid;failure text;role_name text;
begin
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor;
 if not found then raise exception 'ASSISTANT_REQUEST_NOT_FOUND';end if;
 if r.tool<>'prepare_stock_change' or r.arguments->>'operation' is distinct from 'product_fulfillment' then return public.confirm_gc_assistant_request_before_fulfillment(p_request,p_salon,p_actor,p_digest);end if;
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
 perform 1 from public.subscriptions where salon_id=p_salon for share;
 if not public.p0_actor_has_permission(p_salon,p_actor,'products') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 select * into r from public.gc_assistant_requests where id=p_request and salon_id=p_salon and requested_by=p_actor for update;
 if r.risk_class<>4 or r.permission<>'products' then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if r.digest is distinct from p_digest then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
 target_id:=(r.arguments->>'record_id')::uuid;
 select * into o from public.product_orders where id=target_id and salon_id=p_salon for update;
 if not found then raise exception 'ASSISTANT_RECORD_NOT_FOUND';end if;
 if r.confirmed_at is not null then return jsonb_build_object('verified',true,'replayed',true,'result',r.result);end if;
 if r.failure_code is not null or r.expires_at<=now() then raise exception 'ASSISTANT_PREVIEW_EXPIRED';end if;
 begin
  perform 1 from public.product_order_items where order_id=o.id order by id for share;
  perform 1 from public.salon_products where id in(select product_id from public.product_order_items where order_id=o.id) order by id for update;
  fresh:=public.preview_gc_product_fulfillment(p_salon,p_actor,r.arguments);
  if fresh->'before' is distinct from r.before_summary or fresh->'payload' is distinct from r.execution_payload then raise exception 'ASSISTANT_PREVIEW_STALE';end if;
  c:=r.execution_payload->'changes';
  role_name:=case when exists(select 1 from public.salons where id=p_salon and user_id=p_actor) then 'salon_owner' else 'salon_team' end;
  if o.reservation_status is not null then
   perform public.advance_product_pickup_reservation(o.id,c->>'fulfillment_status',p_actor,role_name,c->>'note');
  else
   update public.product_orders set fulfillment_status=c->>'fulfillment_status',
    carrier=case when c->>'fulfillment_status'='Shipped' then c->>'carrier' else o.carrier end,
    tracking_number=case when c->>'fulfillment_status'='Shipped' then c->>'tracking_number' else o.tracking_number end,
    fulfillment_note=c->>'note',fulfilled_at=case when c->>'fulfillment_status'='Delivered' then now() else o.fulfilled_at end,updated_at=now() where id=o.id and salon_id=p_salon;
   insert into public.product_order_events(order_id,salon_id,event_type,previous_status,new_status,note,actor_id,actor_role,metadata)values(o.id,p_salon,'fulfillment_status_changed',o.fulfillment_status,c->>'fulfillment_status',c->>'note',p_actor,role_name,jsonb_build_object('assistant_request_id',r.id,'carrier',c->'carrier','tracking_number',c->'tracking_number','notification_sent',false));
  end if;
  select * into actual from public.product_orders where id=o.id and salon_id=p_salon;
  if not found or actual.fulfillment_status is distinct from c->>'fulfillment_status' or o.reservation_status is not null and actual.reservation_status is distinct from c->>'fulfillment_status' or c->>'fulfillment_status'='Shipped' and (actual.carrier is distinct from c->>'carrier' or actual.tracking_number is distinct from c->>'tracking_number') then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  -- Fulfillment may change only these fields; payment/refund/price/address and
  -- provider evidence are immutable through this action.
  if to_jsonb(actual)-array['fulfillment_status','reservation_status','carrier','tracking_number','fulfillment_note','fulfilled_at','updated_at'] is distinct from to_jsonb(o)-array['fulfillment_status','reservation_status','carrier','tracking_number','fulfillment_note','fulfilled_at','updated_at'] then raise exception 'ASSISTANT_READBACK_FAILED';end if;
  receipt:=jsonb_build_object('operation','product_fulfillment','record_id',o.id,'public_reference',o.public_reference,'fulfillment_status',actual.fulfillment_status,'reservation_status',actual.reservation_status,'carrier',actual.carrier,'tracking_number',actual.tracking_number,'provider_action',false,'notification_sent',false);
  update public.gc_assistant_requests set confirmed_at=now(),result=receipt where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'confirmed',p_actor,jsonb_build_object('after',receipt,'risk_class',4));
  return jsonb_build_object('verified',true,'replayed',false,'result',receipt);
 exception when others then
  failure:=case when sqlerrm~'^ASSISTANT_[A-Z_]+$' then sqlerrm when sqlerrm~'CONFLICT|STALE' then 'ASSISTANT_PREVIEW_STALE' when sqlerrm~'INVALID|check constraint' then 'ASSISTANT_INVALID_INPUT' else 'ASSISTANT_ACTION_FAILED' end;
  update public.gc_assistant_requests set failure_code=failure where id=r.id;
  insert into public.gc_assistant_audit(request_id,event,actor_id,details)values(r.id,'failed',p_actor,jsonb_build_object('code',failure));
  return jsonb_build_object('verified',false,'code',failure);
 end;
end $$;
revoke all on function public.preview_gc_product_fulfillment(uuid,uuid,jsonb),public.preview_gc_business_operation(uuid,uuid,jsonb),public.preview_gc_business_operation_before_fulfillment(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_fulfillment(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.preview_gc_product_fulfillment(uuid,uuid,jsonb),public.preview_gc_business_operation(uuid,uuid,jsonb),public.preview_gc_business_operation_before_fulfillment(uuid,uuid,jsonb),public.confirm_gc_assistant_request(uuid,uuid,uuid,text),public.confirm_gc_assistant_request_before_fulfillment(uuid,uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260923180819"',draft_value='"20260923180819"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
