begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- New rules are bounded; historical versions and agreed booking snapshots are
-- deliberately unchanged. An active rule above the new bound needs review,
-- never a silent reduction in a business's agreed deposit requirement.
do $$begin
 if exists(select 1 from public.current_business_deposit_rules where rate>80 or threshold_rate>80 or repeat_incident_rate>80) then
  raise exception 'DEPOSIT_CURRENT_RULE_REVIEW_REQUIRED';
 end if;
end $$;
alter table public.business_deposit_rules add constraint business_deposit_new_rate_cap
 check(rate<=80 and (threshold_rate is null or threshold_rate<=80) and (repeat_incident_rate is null or repeat_incident_rate<=80)) not valid;

create or replace function public.save_business_deposit_rule(p_salon uuid,p_user uuid,p_request uuid,p_expected uuid,p_rule jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_current public.business_deposit_rules%rowtype; v_prior public.business_deposit_rules%rowtype; v_row public.business_deposit_rules%rowtype;
begin
  perform 1 from public.salons where id=p_salon and user_id=p_user for update;
  if not found then raise exception 'DEPOSIT_OWNER_REQUIRED'; end if;
  perform 1 from public.platform_identities where user_id=p_user for share;
  if not public.p0_actor_has_permission(p_salon,p_user,'finance_manage') or not public.p0_business_plan_active(p_salon) then raise exception 'DEPOSIT_ACCESS_DENIED'; end if;
  if p_request is null or p_rule is null or jsonb_typeof(p_rule)<>'object' or octet_length(p_rule::text)>2000
    or exists(select 1 from jsonb_object_keys(p_rule) k where k not in ('rate','threshold_amount','threshold_rate','repeat_incident_count','repeat_incident_rate','incident_window_days'))
    or not (p_rule ?& array['rate','threshold_amount','threshold_rate','repeat_incident_count','repeat_incident_rate','incident_window_days'])
    or exists(select 1 from jsonb_each(p_rule) where value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+(\.[0-9]{1,2})?$'))
    or p_rule->>'repeat_incident_count' is not null and p_rule->>'repeat_incident_count' !~ '^[0-9]+$'
    or p_rule->>'incident_window_days' is null or p_rule->>'incident_window_days' !~ '^[0-9]+$' then raise exception 'DEPOSIT_RULE_INVALID'; end if;
  select * into v_prior from public.business_deposit_rules where salon_id=p_salon and created_by=p_user and request_id=p_request;
  if found then
    if (to_jsonb(v_prior)-array['id','salon_id','created_by','request_id','previous_version','created_at'])<>p_rule or v_prior.previous_version is distinct from p_expected then raise exception 'DEPOSIT_REQUEST_CONFLICT'; end if;
    return to_jsonb(v_prior);
  end if;
  select * into v_current from public.business_deposit_rules where salon_id=p_salon order by created_at desc,id desc limit 1;
  if v_current.id is distinct from p_expected then raise exception 'DEPOSIT_RULE_CHANGED'; end if;
  if (p_rule->>'rate')::numeric>80 or (p_rule->>'threshold_rate')::numeric>80 or (p_rule->>'repeat_incident_rate')::numeric>80 then raise exception 'DEPOSIT_RULE_INVALID'; end if;
  insert into public.business_deposit_rules(salon_id,created_by,request_id,previous_version,rate,threshold_amount,threshold_rate,repeat_incident_count,repeat_incident_rate,incident_window_days)
  values(p_salon,p_user,p_request,p_expected,(p_rule->>'rate')::numeric,(p_rule->>'threshold_amount')::numeric,(p_rule->>'threshold_rate')::numeric,(p_rule->>'repeat_incident_count')::integer,(p_rule->>'repeat_incident_rate')::numeric,(p_rule->>'incident_window_days')::integer) returning * into v_row;
  return to_jsonb(v_row);
end $$;

-- Update the underlying deposit implementation. The later workspace wrappers
-- must keep profile, notifications, booking and location controls available.
create or replace function gc_private.assistant_controls_schema_before_workspace(p_section text) returns jsonb language sql immutable set search_path=pg_catalog as $schema$
 select '{"deposits":{"rate":{"type":"number","minimum":0,"maximum":80},"threshold_amount":{"type":["number","null"],"minimum":0,"maximum":10000},"threshold_rate":{"type":["number","null"],"minimum":0,"maximum":80},"repeat_incident_count":{"type":["integer","null"],"minimum":1,"maximum":100},"repeat_incident_rate":{"type":["number","null"],"minimum":0,"maximum":80},"incident_window_days":{"type":"integer","minimum":1,"maximum":730}},"growth":{"reminder_hours":{"type":["array","null"],"maxItems":6,"items":{"type":"integer","minimum":1,"maximum":336}},"waitlist_service_ids":{"type":"array","maxItems":100,"items":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"}},"waitlist_professional_ids":{"type":"array","maxItems":100,"items":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"}}},"rebooking":{"enabled":{"type":"boolean"},"absence_days":{"type":"integer","minimum":30,"maximum":180},"minimum_visits":{"type":"integer","minimum":1,"maximum":20},"service_ids":{"type":"array","maxItems":100,"items":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"}}}}'::jsonb->p_section;
$schema$;

create or replace function public.read_gc_business_controls_before_workspace(p_salon uuid,p_actor uuid,p_section text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r jsonb;values_json jsonb;fields text[];plan text;rate numeric;
begin
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor)
  or not public.p0_actor_has_permission(p_salon,p_actor,'settings') then raise exception 'ASSISTANT_ACCESS_DENIED';end if;
 if not public.p0_business_plan_active(p_salon) then raise exception 'ASSISTANT_PLAN_REQUIRED';end if;
 if gc_private.assistant_controls_schema(p_section) is null then raise exception 'ASSISTANT_INVALID_INPUT';end if;
 plan:=public.salon_effective_plan_key(p_salon);
 if p_section='deposits' then
  select to_jsonb(d)-array['salon_id'] into r from public.current_business_deposit_rules d where salon_id=p_salon;
  if r is null then
   rate:=public.engine_number_setting('booking.deposit_percentage',10);if rate not between 0 and 80 then rate:=10;end if;
   r:=jsonb_build_object('id',null,'rate',rate,'threshold_amount',null,'threshold_rate',null,'repeat_incident_count',null,'repeat_incident_rate',null,'incident_window_days',365);
  end if;
  r:=(r-'id')||jsonb_build_object('version',r->'id');
 elsif p_section='growth' then r:=public.read_business_growth_settings(p_salon,p_actor);
 else r:=public.read_business_rebooking_settings(p_salon,p_actor)-array['attempts','salon_id'];end if;
 select array_agg(k) into fields from jsonb_object_keys(gc_private.assistant_controls_schema(p_section)) k;
 select jsonb_object_agg(k,r->k) into values_json from unnest(fields) k;
 return jsonb_build_object('salon_id',p_salon,'section',p_section,'plan',plan,'values',values_json,'state',r-fields);
end $$;


update public.engine_settings set published_value='"20260924194000"',draft_value='"20260924194000"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
