begin;
-- A method attempt owns its generation until terminal reconciliation. Plan and
-- cancellation writes use the same short transaction mutex and durable lease.
create table public.subscription_mutation_leases (
 stripe_subscription_id text primary key, salon_id uuid not null references public.salons(id),
 actor_id uuid not null, lease_id uuid not null, expires_at timestamptz not null,write_started boolean not null default false,
 request_evidence jsonb not null default '[]'
);
alter table public.subscription_mutation_leases enable row level security;
revoke all on public.subscription_mutation_leases from public,anon,authenticated;
grant select,insert,update on public.subscription_mutation_leases to service_role;
alter table public.subscription_payment_method_attempts add column schedule_baseline jsonb,
 add column schedule_first_apply_at timestamptz,add column schedule_verified_at timestamptz,
 add column schedule_request_id text;

create function public.acquire_subscription_mutation(p_salon uuid,p_actor uuid,p_subscription text,p_lease uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('payment-method:'||p_salon::text,0));
 perform pg_advisory_xact_lock(hashtextextended('subscription-mutation:'||p_subscription,0));
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor) or not exists(select 1 from public.subscriptions where salon_id=p_salon and stripe_subscription_id=p_subscription) then raise exception 'SUBSCRIPTION_MUTATION_IDENTITY_CONFLICT'; end if;
 if exists(select 1 from public.subscription_payment_method_attempts where (salon_id=p_salon or stripe_subscription_id=p_subscription) and status in('reserved','open','processing')) then raise exception 'SUBSCRIPTION_MUTATION_BUSY';end if;
 if exists(select 1 from public.subscription_mutation_leases where stripe_subscription_id=p_subscription and write_started and expires_at<=now()) then raise exception 'SUBSCRIPTION_MUTATION_REVIEW_REQUIRED';end if;
 insert into public.subscription_mutation_leases values(p_subscription,p_salon,p_actor,p_lease,now()+interval '2 minutes',false,'[]')
 on conflict(stripe_subscription_id) do update set salon_id=excluded.salon_id,actor_id=excluded.actor_id,lease_id=excluded.lease_id,expires_at=excluded.expires_at,write_started=false,request_evidence='[]'
 where subscription_mutation_leases.expires_at<=now() and not subscription_mutation_leases.write_started;
 if not found then raise exception 'SUBSCRIPTION_MUTATION_BUSY';end if;
 return true;
end $$;
create function public.assert_subscription_mutation(p_salon uuid,p_actor uuid,p_subscription text,p_lease uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.subscription_mutation_leases l join public.salons s on s.id=l.salon_id join public.subscriptions b on b.salon_id=s.id
 where l.salon_id=p_salon and l.actor_id=p_actor and s.user_id=p_actor and l.stripe_subscription_id=p_subscription and b.stripe_subscription_id=p_subscription and l.lease_id=p_lease and l.expires_at>now()+interval '1 minute');
$$;
create function public.release_subscription_mutation(p_salon uuid,p_actor uuid,p_subscription text,p_lease uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.subscription_mutation_leases set expires_at=now(),write_started=false where salon_id=p_salon and actor_id=p_actor and stripe_subscription_id=p_subscription and lease_id=p_lease;
 return found;
end $$;
create function public.record_subscription_mutation_request(p_salon uuid,p_actor uuid,p_subscription text,p_lease uuid,p_intent jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_intent is null or jsonb_typeof(p_intent)<>'object' or length(p_intent::text)>100000 then raise exception 'SUBSCRIPTION_MUTATION_INTENT_INVALID';end if;
 if not public.assert_subscription_mutation(p_salon,p_actor,p_subscription,p_lease) then return false;end if;
 update public.subscription_mutation_leases set write_started=true,request_evidence=request_evidence||jsonb_build_array(p_intent||jsonb_build_object('sent_at',now())) where stripe_subscription_id=p_subscription and lease_id=p_lease and jsonb_array_length(request_evidence)<12;
 return found;
end $$;
create function public.record_subscription_mutation_response(p_salon uuid,p_actor uuid,p_subscription text,p_lease uuid,p_request_id text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.subscription_mutation_leases set request_evidence=jsonb_set(request_evidence,array[(jsonb_array_length(request_evidence)-1)::text,'provider_request_id'],to_jsonb(coalesce(case when p_request_id~'^req_[A-Za-z0-9]+$' then p_request_id end,'')))
 where salon_id=p_salon and actor_id=p_actor and stripe_subscription_id=p_subscription and lease_id=p_lease and write_started and jsonb_array_length(request_evidence)>0;
 return found;
end $$;

-- A trigger also protects the already deployed reservation RPC, avoiding a
-- permissive legacy entry point. Both paths acquire the mutex before this row.
create function public.guard_payment_method_reservation() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('payment-method:'||new.salon_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('subscription-mutation:'||new.stripe_subscription_id,0));
 if exists(select 1 from public.subscription_mutation_leases where (salon_id=new.salon_id or stripe_subscription_id=new.stripe_subscription_id) and (expires_at>now() or write_started)) then raise exception 'SUBSCRIPTION_MUTATION_BUSY';end if;
 return new;
end $$;
create trigger subscription_method_reservation_guard before insert on public.subscription_payment_method_attempts for each row execute function public.guard_payment_method_reservation();

create function public.reserve_scheduled_payment_method_attempt(p_salon_id uuid,p_actor_id uuid,p_customer_id text,p_subscription_id text,p_livemode boolean,p_baseline_method_id text,p_schedule jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.subscription_payment_method_attempts%rowtype; result jsonb;
begin
 if p_schedule is null or jsonb_typeof(p_schedule) is distinct from 'object' or length(p_schedule::text)>200000 or coalesce(p_schedule->>'fingerprint','') !~ '^[0-9a-f]{64}$' or coalesce(p_schedule->>'subscription_fingerprint','') !~ '^[0-9a-f]{64}$' or coalesce(p_schedule->'schedule'->>'id','') !~ '^sub_sched_[A-Za-z0-9_]+$' or p_schedule->'schedule'->>'subscription' is distinct from p_subscription_id or p_schedule->'schedule'->>'customer' is distinct from p_customer_id or p_schedule->'schedule'->>'livemode' is distinct from p_livemode::text then raise exception 'PAYMENT_SCHEDULE_BASELINE_INVALID';end if;
 result:=public.reserve_subscription_payment_method_attempt(p_salon_id,p_actor_id,p_customer_id,p_subscription_id,p_livemode,p_baseline_method_id);
 select * into a from public.subscription_payment_method_attempts where id=(result->>'id')::uuid for update;
 if a.schedule_baseline is null then
  if a.status<>'reserved' or a.stripe_checkout_session_id is not null then raise exception 'PAYMENT_SCHEDULE_BASELINE_CHANGED';end if;
  update public.subscription_payment_method_attempts set schedule_baseline=p_schedule where id=a.id returning * into a;
 elsif a.schedule_baseline->'schedule'->>'id' is distinct from p_schedule->'schedule'->>'id' then raise exception 'PAYMENT_SCHEDULE_BASELINE_CHANGED';end if;
 return to_jsonb(a);
end $$;

create function public.mark_payment_schedule_apply(p_attempt_id uuid,p_lease_id uuid,p_setup_intent_id text,p_payment_method_id text,p_verified boolean default false,p_request_id text default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.subscription_payment_method_attempts%rowtype;
begin
 select * into strict a from public.subscription_payment_method_attempts where id=p_attempt_id for update;
 if a.status<>'processing' or a.lease_id is distinct from p_lease_id or a.lease_expires_at<=now()+interval '1 minute' or a.schedule_baseline is null then raise exception 'PAYMENT_METHOD_LEASE_LOST';end if;
 if not exists(select 1 from public.salons s join public.subscriptions b on b.salon_id=s.id where s.id=a.salon_id and s.user_id=a.actor_id and b.stripe_customer_id=a.stripe_customer_id and b.stripe_subscription_id=a.stripe_subscription_id) then raise exception 'PAYMENT_METHOD_OWNER_IDENTITY_CONFLICT';end if;
 if p_setup_intent_id is null or p_setup_intent_id !~ '^seti_[A-Za-z0-9_]+$' or p_payment_method_id is null or p_payment_method_id !~ '^pm_[A-Za-z0-9_]+$' or (a.stripe_setup_intent_id is not null and a.stripe_setup_intent_id<>p_setup_intent_id) or (a.stripe_payment_method_id is not null and a.stripe_payment_method_id<>p_payment_method_id) then raise exception 'PAYMENT_METHOD_APPLY_IDENTITY_CONFLICT';end if;
 update public.subscription_payment_method_attempts set stripe_setup_intent_id=p_setup_intent_id,stripe_payment_method_id=p_payment_method_id,
 schedule_first_apply_at=case when p_verified then schedule_first_apply_at else coalesce(schedule_first_apply_at,now()) end,
 schedule_verified_at=case when p_verified then now() else schedule_verified_at end,
 schedule_request_id=case when p_request_id ~ '^req_[A-Za-z0-9]+$' then p_request_id else schedule_request_id end,updated_at=now()
 where id=a.id returning * into a;
 return to_jsonb(a);
end $$;

revoke all on function public.acquire_subscription_mutation(uuid,uuid,text,uuid),public.assert_subscription_mutation(uuid,uuid,text,uuid),public.release_subscription_mutation(uuid,uuid,text,uuid),public.record_subscription_mutation_request(uuid,uuid,text,uuid,jsonb),public.record_subscription_mutation_response(uuid,uuid,text,uuid,text),public.guard_payment_method_reservation(),public.reserve_scheduled_payment_method_attempt(uuid,uuid,text,text,boolean,text,jsonb),public.mark_payment_schedule_apply(uuid,uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.acquire_subscription_mutation(uuid,uuid,text,uuid),public.assert_subscription_mutation(uuid,uuid,text,uuid),public.release_subscription_mutation(uuid,uuid,text,uuid),public.record_subscription_mutation_request(uuid,uuid,text,uuid,jsonb),public.record_subscription_mutation_response(uuid,uuid,text,uuid,text),public.guard_payment_method_reservation(),public.reserve_scheduled_payment_method_attempt(uuid,uuid,text,text,boolean,text,jsonb),public.mark_payment_schedule_apply(uuid,uuid,text,text,boolean,text) to service_role;
update public.engine_settings set published_value='"20260919052907"'::jsonb,draft_value='"20260919052907"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
