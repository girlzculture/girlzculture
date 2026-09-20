begin;
-- Private original phase intent, never browser-readable or a second billing ledger.
create table public.subscription_payment_schedule_intents(
 stripe_schedule_id text primary key check(stripe_schedule_id~'^sub_sched_[A-Za-z0-9_]+$'),
 salon_id uuid not null references public.salons(id), stripe_subscription_id text not null,
 stripe_customer_id text not null, livemode boolean not null,
 api_version text not null check(api_version='2025-06-30.basil'),
 source jsonb not null check(jsonb_typeof(source)='object' and length(source::text)<=200000),
 empty_discounts jsonb not null check(jsonb_typeof(empty_discounts)='object' and length(empty_discounts::text)<=20000),
 updated_at timestamptz not null default now()
);
alter table public.subscription_payment_schedule_intents enable row level security;
revoke all on public.subscription_payment_schedule_intents from public,anon,authenticated;
grant select,insert,update on public.subscription_payment_schedule_intents to service_role;
alter table public.subscription_payment_method_attempts add column phase_apply_plan jsonb
 check(phase_apply_plan is null or (jsonb_typeof(phase_apply_plan)='object' and length(phase_apply_plan::text)<=400000));

create function public.archive_payment_phase_intent(p_salon uuid,p_actor uuid,p_subscription text,p_lease uuid,p_source jsonb,p_empty jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare customer text; item jsonb;
begin
 if not public.assert_subscription_mutation(p_salon,p_actor,p_subscription,p_lease) then raise exception 'PAYMENT_METHOD_LEASE_LOST';end if;
 select stripe_customer_id into customer from public.subscriptions where salon_id=p_salon and stripe_subscription_id=p_subscription;
 if jsonb_typeof(p_source) is distinct from 'object' or p_source->>'object' is distinct from 'subscription_schedule' or p_source->>'subscription' is distinct from p_subscription or p_source->>'customer' is distinct from customer or coalesce(p_source->>'id','')!~'^sub_sched_[A-Za-z0-9_]+$' or jsonb_typeof(p_source->'livemode') is distinct from 'boolean' or jsonb_typeof(p_empty) is distinct from 'object' then raise exception 'PAYMENT_SCHEDULE_INTENT_INVALID';end if;
 if exists(select 1 from jsonb_each_text(p_empty) e where e.value not in('inherit','none'))then raise exception 'PAYMENT_SCHEDULE_INTENT_INVALID';end if;
 if not exists(select 1 from public.subscription_mutation_leases l cross join lateral jsonb_array_elements(l.request_evidence)e where l.stripe_subscription_id=p_subscription and l.lease_id=p_lease and e->>'path'='/subscription_schedules/'||(p_source->>'id') and coalesce(e->>'provider_request_id','')~'^req_[A-Za-z0-9]+$')then raise exception 'PAYMENT_SCHEDULE_INTENT_UNVERIFIED';end if;
 insert into public.subscription_payment_schedule_intents(stripe_schedule_id,salon_id,stripe_subscription_id,stripe_customer_id,livemode,api_version,source,empty_discounts)
 values(p_source->>'id',p_salon,p_subscription,customer,(p_source->>'livemode')::boolean,'2025-06-30.basil',p_source,p_empty)
 on conflict(stripe_schedule_id)do update set source=excluded.source,empty_discounts=excluded.empty_discounts,updated_at=now()
 where subscription_payment_schedule_intents.salon_id=excluded.salon_id and subscription_payment_schedule_intents.stripe_subscription_id=excluded.stripe_subscription_id and subscription_payment_schedule_intents.stripe_customer_id=excluded.stripe_customer_id and subscription_payment_schedule_intents.livemode=excluded.livemode;
 if not found then raise exception 'PAYMENT_SCHEDULE_INTENT_IDENTITY_CONFLICT';end if;
 return true;
end $$;

create function public.prepare_payment_phase_apply(p_attempt_id uuid,p_lease_id uuid,p_setup_intent_id text,p_payment_method_id text,p_plan jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.subscription_payment_method_attempts%rowtype; baseline jsonb; source jsonb; expected jsonb; i integer; before_phase jsonb; after_phase jsonb;
begin
 select * into strict a from public.subscription_payment_method_attempts where id=p_attempt_id for update;
 if a.status<>'processing' or a.lease_id is distinct from p_lease_id or a.lease_expires_at<=now()+interval '1 minute' then raise exception 'PAYMENT_METHOD_LEASE_LOST';end if;
 if not exists(select 1 from public.salons s join public.subscriptions b on b.salon_id=s.id where s.id=a.salon_id and s.user_id=a.actor_id and b.stripe_customer_id=a.stripe_customer_id and b.stripe_subscription_id=a.stripe_subscription_id)then raise exception 'PAYMENT_METHOD_OWNER_IDENTITY_CONFLICT';end if;
 if p_setup_intent_id is null or p_setup_intent_id!~'^seti_[A-Za-z0-9_]+$' or p_payment_method_id is null or p_payment_method_id!~'^pm_[A-Za-z0-9_]+$' or (a.stripe_setup_intent_id is not null and a.stripe_setup_intent_id<>p_setup_intent_id) or (a.stripe_payment_method_id is not null and a.stripe_payment_method_id<>p_payment_method_id)then raise exception 'PAYMENT_METHOD_APPLY_IDENTITY_CONFLICT';end if;
 baseline:=a.schedule_baseline;source:=baseline->'schedule';expected:=p_plan->'expected_state';
 if baseline->>'kind' is distinct from 'explicit_phases' or baseline->>'api_version' is distinct from '2025-06-30.basil' or jsonb_typeof(baseline->'empty_discounts') is distinct from 'object' or jsonb_typeof(p_plan) is distinct from 'object' or p_plan->>'api_version' is distinct from '2025-06-30.basil' or p_plan->>'target_method' is distinct from p_payment_method_id or jsonb_typeof(p_plan->'request') is distinct from 'object' or p_plan->'request'->>'proration_behavior' is distinct from 'none' or p_plan->'request'->>'default_settings[default_payment_method]' is distinct from p_payment_method_id or jsonb_typeof(expected) is distinct from 'object' or coalesce(p_plan->>'source_fingerprint','')!~'^[0-9a-f]{64}$' or coalesce(p_plan->>'expected_fingerprint','')!~'^[0-9a-f]{64}$' or coalesce(p_plan->>'request_fingerprint','')!~'^[0-9a-f]{64}$' then raise exception 'PAYMENT_SCHEDULE_PLAN_INVALID';end if;
 if source->>'subscription' is distinct from a.stripe_subscription_id or source->>'customer' is distinct from a.stripe_customer_id or source->>'livemode' is distinct from a.livemode::text or expected->'default_settings'->>'default_payment_method' is distinct from p_payment_method_id or jsonb_typeof(source->'phases') is distinct from 'array' or jsonb_typeof(expected->'phases') is distinct from 'array' or jsonb_array_length(source->'phases')<>jsonb_array_length(expected->'phases')then raise exception 'PAYMENT_SCHEDULE_PLAN_INVALID';end if;
 for i in 0..jsonb_array_length(source->'phases')-1 loop
  before_phase:=source->'phases'->i;after_phase:=expected->'phases'->i;
  if (before_phase->>'end_date')::bigint<=(source->'current_phase'->>'start_date')::bigint then
   if before_phase is distinct from after_phase then raise exception 'PAYMENT_SCHEDULE_PLAN_COMMERCIAL_CHANGE';end if;
  else
   if before_phase-'default_payment_method' is distinct from after_phase-'default_payment_method' or (before_phase->'default_payment_method'='null'::jsonb and after_phase->'default_payment_method' is distinct from 'null'::jsonb) or (before_phase->'default_payment_method'<>'null'::jsonb and after_phase->>'default_payment_method' is distinct from p_payment_method_id)then raise exception 'PAYMENT_SCHEDULE_PLAN_COMMERCIAL_CHANGE';end if;
  end if;
 end loop;
 if source-'phases'-'default_settings' is distinct from expected-'phases'-'default_settings' or (source->'default_settings')-'default_payment_method' is distinct from (expected->'default_settings')-'default_payment_method' then raise exception 'PAYMENT_SCHEDULE_PLAN_COMMERCIAL_CHANGE';end if;
 if a.phase_apply_plan is not null and a.phase_apply_plan is distinct from p_plan then raise exception 'PAYMENT_SCHEDULE_DURABLE_PLAN_CONFLICT';end if;
 if a.phase_apply_plan is null and a.schedule_first_apply_at is not null then raise exception 'PAYMENT_SCHEDULE_DURABLE_PLAN_MISSING';end if;
 insert into public.subscription_payment_schedule_intents(stripe_schedule_id,salon_id,stripe_subscription_id,stripe_customer_id,livemode,api_version,source,empty_discounts)
 values(source->>'id',a.salon_id,a.stripe_subscription_id,a.stripe_customer_id,a.livemode,'2025-06-30.basil',source,baseline->'empty_discounts')on conflict(stripe_schedule_id)do nothing;
 if not exists(select 1 from public.subscription_payment_schedule_intents i where i.stripe_schedule_id=(baseline->'schedule'->>'id') and i.salon_id=a.salon_id and i.stripe_subscription_id=a.stripe_subscription_id and i.stripe_customer_id=a.stripe_customer_id and i.livemode=a.livemode)then raise exception 'PAYMENT_SCHEDULE_INTENT_IDENTITY_CONFLICT';end if;
 update public.subscription_payment_method_attempts set phase_apply_plan=coalesce(phase_apply_plan,p_plan),stripe_setup_intent_id=p_setup_intent_id,stripe_payment_method_id=p_payment_method_id,updated_at=now()where id=a.id returning * into a;
 return to_jsonb(a);
end $$;
revoke all on function public.archive_payment_phase_intent(uuid,uuid,text,uuid,jsonb,jsonb),public.prepare_payment_phase_apply(uuid,uuid,text,text,jsonb)from public,anon,authenticated;
grant execute on function public.archive_payment_phase_intent(uuid,uuid,text,uuid,jsonb,jsonb),public.prepare_payment_phase_apply(uuid,uuid,text,text,jsonb)to service_role;
create or replace function public.mark_payment_schedule_apply(p_attempt_id uuid,p_lease_id uuid,p_setup_intent_id text,p_payment_method_id text,p_verified boolean default false,p_request_id text default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.subscription_payment_method_attempts%rowtype;
begin
 select * into strict a from public.subscription_payment_method_attempts where id=p_attempt_id for update;
 if a.status<>'processing' or a.lease_id is distinct from p_lease_id or a.lease_expires_at<=now()+interval '1 minute' or a.schedule_baseline is null then raise exception 'PAYMENT_METHOD_LEASE_LOST';end if;
 if not exists(select 1 from public.salons s join public.subscriptions b on b.salon_id=s.id where s.id=a.salon_id and s.user_id=a.actor_id and b.stripe_customer_id=a.stripe_customer_id and b.stripe_subscription_id=a.stripe_subscription_id) then raise exception 'PAYMENT_METHOD_OWNER_IDENTITY_CONFLICT';end if;
 if a.schedule_baseline->>'kind'='explicit_phases' and a.phase_apply_plan is null then raise exception 'PAYMENT_SCHEDULE_DURABLE_PLAN_MISSING';end if;
 if p_setup_intent_id is null or p_setup_intent_id !~ '^seti_[A-Za-z0-9_]+$' or p_payment_method_id is null or p_payment_method_id !~ '^pm_[A-Za-z0-9_]+$' or (a.stripe_setup_intent_id is not null and a.stripe_setup_intent_id<>p_setup_intent_id) or (a.stripe_payment_method_id is not null and a.stripe_payment_method_id<>p_payment_method_id) then raise exception 'PAYMENT_METHOD_APPLY_IDENTITY_CONFLICT';end if;
 update public.subscription_payment_method_attempts set stripe_setup_intent_id=p_setup_intent_id,stripe_payment_method_id=p_payment_method_id,
 schedule_first_apply_at=case when p_verified then schedule_first_apply_at else coalesce(schedule_first_apply_at,now()) end,
 schedule_verified_at=case when p_verified then now() else schedule_verified_at end,
 schedule_request_id=case when p_request_id ~ '^req_[A-Za-z0-9]+$' then p_request_id else schedule_request_id end,updated_at=now()
 where id=a.id returning * into a;
 return to_jsonb(a);
end $$;
update public.engine_settings set published_value='"20260919144513"'::jsonb,draft_value='"20260919144513"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
