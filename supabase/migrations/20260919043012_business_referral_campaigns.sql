begin;

-- Entitlements reference the canonical billing ledger. They are NOT money,
-- issued credits, a second payment ledger or permission to call Stripe.
create table public.business_referral_campaigns (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 100),
 revision integer not null default 1 check(revision>0), status text not null default 'inactive' check(status in('inactive','active')),
 terms jsonb not null check(jsonb_typeof(terms)='object'), authorized_by uuid references auth.users(id), authorized_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status<>'active' or (authorized_by is not null and authorized_at is not null))
);
create table public.business_referral_codes (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.business_referral_campaigns(id),
 salon_id uuid not null references public.salons(id), owner_id uuid not null references auth.users(id),
 code text not null unique default replace(gen_random_uuid()::text,'-','') check(code~'^[a-f0-9]{32}$'),
 created_at timestamptz not null default now(), unique(campaign_id,salon_id)
);
create table public.business_referral_claims (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.business_referral_campaigns(id),
 campaign_revision integer not null, campaign_title text not null, terms jsonb not null,
 referrer_salon_id uuid not null references public.salons(id), referred_salon_id uuid not null unique references public.salons(id),
 referrer_owner_id uuid not null references auth.users(id), referred_owner_id uuid not null references auth.users(id),
 status text not null default 'pending' check(status in('pending','qualified','on_hold','expired')),
 review_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(referrer_salon_id<>referred_salon_id and referrer_owner_id<>referred_owner_id)
);
create index business_referral_claims_referrer on public.business_referral_claims(referrer_salon_id);
-- Mutable verification observations are separate from immutable canonical
-- financial snapshots. A failed recheck invalidates the previous positive proof.
create table public.business_referral_payment_checks (
 billing_event_id uuid primary key references public.billing_events(id),
 state text not null check(state in('verified','unverified')), proof jsonb,
 checked_at timestamptz not null default now(), generation uuid not null default gen_random_uuid(), last_error text,
 check(state<>'verified' or (proof->>'source'='stripe_verified_payment_v1' and proof->>'livemode'='true') is true)
);
create table public.business_referral_rewards (
 id uuid primary key default gen_random_uuid(), claim_id uuid not null unique references public.business_referral_claims(id),
 beneficiary_salon_id uuid not null references public.salons(id), campaign_id uuid not null references public.business_referral_campaigns(id),
 campaign_title text not null, amount_cents integer not null check(amount_cents>0), currency text not null check(currency='usd'),
 billing_event_id uuid not null unique references public.billing_events(id),
 qualifying_customer_id text not null unique check(qualifying_customer_id~'^cus_[A-Za-z0-9]+$'),
 qualifying_payment_intent_id text not null unique check(qualifying_payment_intent_id~'^pi_[A-Za-z0-9]+$'),
 status text not null default 'pending_review' check(status in('pending_review','on_hold')),
 qualified_at timestamptz not null, eligible_at timestamptz not null, updated_at timestamptz not null default now()
);
create index business_referral_rewards_beneficiary on public.business_referral_rewards(beneficiary_salon_id);
create table public.business_referral_events (
 id bigint generated always as identity primary key, campaign_id uuid references public.business_referral_campaigns(id),
 claim_id uuid references public.business_referral_claims(id), actor_id uuid references auth.users(id), action text not null,
 revision integer, reason text, recorded_at timestamptz not null default now()
);
alter table public.business_referral_campaigns enable row level security;
alter table public.business_referral_codes enable row level security;
alter table public.business_referral_claims enable row level security;
alter table public.business_referral_rewards enable row level security;
alter table public.business_referral_payment_checks enable row level security;
alter table public.business_referral_events enable row level security;
revoke all on public.business_referral_campaigns,public.business_referral_codes,public.business_referral_claims,public.business_referral_rewards,public.business_referral_events,public.business_referral_payment_checks from public,anon,authenticated;
grant select,insert,update on public.business_referral_campaigns,public.business_referral_codes,public.business_referral_claims,public.business_referral_rewards,public.business_referral_payment_checks to service_role;
grant select,insert on public.business_referral_events to service_role;
grant usage,select on sequence public.business_referral_events_id_seq to service_role;
grant select on public.salons,public.subscriptions,public.billing_events,public.admin_users,public.platform_identities to service_role;
grant update(id) on public.salons to service_role;

create function public.business_referral_terms_valid(p_terms jsonb,p_complete boolean default false)
returns boolean language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare key text; value text; lower_bound integer; upper_bound integer;
begin
 if jsonb_typeof(p_terms) is distinct from 'object' or p_terms->>'currency' is distinct from 'usd' or (select count(*) from jsonb_object_keys(p_terms))<>9
  or exists(select 1 from jsonb_object_keys(p_terms) k where k not in('currency','recipient','amount_cents','starts_at','ends_at','minimum_payment_cents','qualifying_days','hold_days','max_rewards_per_referrer')) then return false; end if;
 if p_terms->>'recipient' is not null and p_terms->>'recipient' not in('referrer','referred') then return false; end if;
 foreach key in array array['amount_cents','minimum_payment_cents','qualifying_days','hold_days','max_rewards_per_referrer'] loop
  value:=p_terms->>key;
  if value is null then if p_complete then return false; end if; continue; end if;
  lower_bound:=1; upper_bound:=case key when 'amount_cents' then 100000 when 'minimum_payment_cents' then 1000000 when 'qualifying_days' then 365 when 'hold_days' then 180 else 100 end;
  if jsonb_typeof(p_terms->key)<>'number' or value!~'^\d+$' or value::numeric not between lower_bound and upper_bound then return false; end if;
 end loop;
 if p_complete and (p_terms->>'recipient' is null or p_terms->>'starts_at' is null or p_terms->>'ends_at' is null) then return false; end if;
 foreach key in array array['starts_at','ends_at'] loop
  value:=p_terms->>key;
  if value is not null and (jsonb_typeof(p_terms->key)<>'string' or value!~'(Z|[+-][0-9]{2}:[0-9]{2})$') then return false; end if;
  if value is not null then perform value::timestamptz; end if;
 end loop;
 if p_terms->>'starts_at' is not null and p_terms->>'ends_at' is not null and (p_terms->>'ends_at')::timestamptz <= (p_terms->>'starts_at')::timestamptz then return false; end if;
 return true;
exception when others then return false;
end $$;
alter table public.business_referral_campaigns add constraint business_referral_terms_check check(public.business_referral_terms_valid(terms,status='active'));
insert into public.business_referral_campaigns(title,terms) values('Referral campaign draft','{"currency":"usd","recipient":null,"amount_cents":null,"starts_at":null,"ends_at":null,"minimum_payment_cents":null,"qualifying_days":null,"hold_days":null,"max_rewards_per_referrer":null}');

create function public.save_business_referral_campaign(p_actor uuid,p_id uuid,p_revision integer,p_title text,p_terms jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.business_referral_campaigns%rowtype;
begin
 if not exists(select 1 from public.admin_users a join public.platform_identities i on i.user_id=a.user_id where a.user_id=p_actor and a.is_super_admin and a.status='Active' and i.primary_role='admin' and i.status='Active') then raise exception 'REFERRAL_FORBIDDEN'; end if;
 if not public.business_referral_terms_valid(p_terms,false) or p_title is null or length(trim(p_title)) not between 1 and 100 or p_id is null or p_revision is null or p_revision<0 then raise exception 'REFERRAL_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('referral-campaign:'||p_id::text,0));
 select * into c from public.business_referral_campaigns where id=p_id for update;
 if found then
  if c.revision<>p_revision then raise exception 'REFERRAL_CHANGED'; end if;
  update public.business_referral_campaigns set title=trim(p_title),terms=p_terms,revision=revision+1,status='inactive',authorized_by=null,authorized_at=null,updated_at=now() where id=p_id returning * into c;
 else
  if p_revision<>0 then raise exception 'REFERRAL_CHANGED'; end if;
  insert into public.business_referral_campaigns(id,title,terms) values(p_id,trim(p_title),p_terms) returning * into c;
 end if;
 insert into public.business_referral_events(campaign_id,actor_id,action,revision) values(c.id,p_actor,'draft_saved',c.revision);
 return to_jsonb(c);
end $$;

-- No production call to this function is authorized by this migration. It
-- provides a reviewed future activation boundary; saving always pauses a draft.
create function public.authorize_business_referral_campaign(p_actor uuid,p_id uuid,p_revision integer,p_confirm boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.business_referral_campaigns%rowtype;
begin
 if not exists(select 1 from public.admin_users a join public.platform_identities i on i.user_id=a.user_id where a.user_id=p_actor and a.is_super_admin and a.status='Active' and i.primary_role='admin' and i.status='Active') then raise exception 'REFERRAL_FORBIDDEN'; end if;
 select * into c from public.business_referral_campaigns where id=p_id for update;
 if not found or p_revision is null or c.revision<>p_revision then raise exception 'REFERRAL_CHANGED'; end if;
 if p_confirm is distinct from true or not public.business_referral_terms_valid(c.terms,true) or (c.terms->>'ends_at')::timestamptz<=now() then raise exception 'REFERRAL_REVIEW_REQUIRED'; end if;
 if c.status='active' then return to_jsonb(c); end if;
 update public.business_referral_campaigns set status='active',authorized_by=p_actor,authorized_at=now(),updated_at=now() where id=p_id returning * into c;
 insert into public.business_referral_events(campaign_id,actor_id,action,revision) values(c.id,p_actor,'terms_authorized',c.revision);
 return to_jsonb(c);
end $$;

create function public.create_business_referral_code(p_salon uuid,p_actor uuid,p_campaign uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.business_referral_campaigns%rowtype; r public.business_referral_codes%rowtype;
begin
 perform 1 from public.salons where id=p_salon and user_id=p_actor for update;
 if not found then raise exception 'REFERRAL_FORBIDDEN'; end if;
 select * into c from public.business_referral_campaigns where id=p_campaign and status='active' for share;
 if not found or now() not between (c.terms->>'starts_at')::timestamptz and (c.terms->>'ends_at')::timestamptz then raise exception 'REFERRAL_CODE_UNAVAILABLE'; end if;
 insert into public.business_referral_codes(campaign_id,salon_id,owner_id) values(p_campaign,p_salon,p_actor) on conflict(campaign_id,salon_id) do nothing;
 select * into r from public.business_referral_codes where campaign_id=p_campaign and salon_id=p_salon;
 if r.owner_id<>p_actor then raise exception 'REFERRAL_REVIEW_REQUIRED'; end if;
 return jsonb_build_object('campaign_id',p_campaign,'code',r.code);
end $$;

create function public.claim_business_referral(p_salon uuid,p_actor uuid,p_code text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.business_referral_campaigns%rowtype; r public.business_referral_codes%rowtype; cl public.business_referral_claims%rowtype; owner_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('referral-claim:'||p_salon::text,0));
 perform 1 from public.salons where id=p_salon and user_id=p_actor for update;
 if not found then raise exception 'REFERRAL_FORBIDDEN'; end if;
 select * into r from public.business_referral_codes where code=p_code;
 if not found then raise exception 'REFERRAL_CODE_UNAVAILABLE'; end if;
 select * into cl from public.business_referral_claims where referred_salon_id=p_salon;
 if found then
  if cl.campaign_id=r.campaign_id and cl.referrer_salon_id=r.salon_id and cl.referred_owner_id=p_actor then return jsonb_build_object('id',cl.id,'status',cl.status); end if;
  raise exception 'REFERRAL_ALREADY_RECORDED';
 end if;
 select * into c from public.business_referral_campaigns where id=r.campaign_id for share;
 select user_id into owner_id from public.salons where id=r.salon_id;
 if c.status<>'active' or now() not between (c.terms->>'starts_at')::timestamptz and (c.terms->>'ends_at')::timestamptz or r.salon_id=p_salon or owner_id=p_actor or owner_id is distinct from r.owner_id then raise exception 'REFERRAL_CODE_UNAVAILABLE'; end if;
 if exists(select 1 from public.subscriptions a join public.subscriptions b on b.salon_id=r.salon_id and a.stripe_customer_id=b.stripe_customer_id where a.salon_id=p_salon and a.stripe_customer_id is not null)
  or exists(select 1 from public.billing_events where salon_id=p_salon and amount_collected>0 and payment_status='paid')
  or exists(select 1 from public.subscriptions where salon_id=p_salon and lower(status)='active') then raise exception 'REFERRAL_CODE_UNAVAILABLE'; end if;
 insert into public.business_referral_claims(campaign_id,campaign_revision,campaign_title,terms,referrer_salon_id,referred_salon_id,referrer_owner_id,referred_owner_id)
 values(c.id,c.revision,c.title,c.terms,r.salon_id,p_salon,r.owner_id,p_actor) returning * into cl;
 insert into public.business_referral_events(campaign_id,claim_id,actor_id,action) values(c.id,cl.id,p_actor,'claim_recorded');
 return jsonb_build_object('id',cl.id,'status',cl.status);
end $$;

-- Internal-only provider inputs for a bounded refresh. Never forward this
-- result to the owner or assistant. Oldest checks run first so retries progress.
create function public.business_referral_check_inputs(p_salon uuid,p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor) then raise exception 'REFERRAL_FORBIDDEN'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (
  select b.id billing_event_id,b.salon_id,b.stripe_invoice_id,b.stripe_subscription_id,s.stripe_customer_id,b.amount_collected,b.currency
  from public.business_referral_claims cl join public.subscriptions s on s.salon_id=cl.referred_salon_id
  join public.billing_events b on b.salon_id=cl.referred_salon_id and b.stripe_subscription_id=s.stripe_subscription_id
  left join public.business_referral_payment_checks ch on ch.billing_event_id=b.id
  where (cl.referrer_salon_id=p_salon or cl.referred_salon_id=p_salon) and b.payment_status='paid' and b.amount_collected>0 and b.stripe_invoice_id is not null
  and b.event_date>=cl.created_at and b.event_date<=least((cl.terms->>'ends_at')::timestamptz,cl.created_at+make_interval(days=>(cl.terms->>'qualifying_days')::integer))
  order by ch.checked_at nulls first,b.event_date,b.id limit 21
 ) q),'[]');
end $$;

create function public.reconcile_business_referrals(p_salon uuid,p_actor uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare cl public.business_referral_claims%rowtype; evidence public.billing_events%rowtype; subscription_row public.subscriptions%rowtype; reason text; next_status text; beneficiary uuid; proof jsonb;
begin
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor) then raise exception 'REFERRAL_FORBIDDEN'; end if;
 -- A single bounded mutex serializes campaign caps and cross-owner refreshes.
 -- No provider call or financial mutation occurs while this lock is held.
 perform pg_advisory_xact_lock(hashtextextended('business-referral-qualification',0));
 for cl in select * from public.business_referral_claims where referrer_salon_id=p_salon or referred_salon_id=p_salon order by created_at,id for update loop
  reason:=null; next_status:='pending'; evidence:=null;
  select * into subscription_row from public.subscriptions where salon_id=cl.referred_salon_id;
  if (select user_id from public.salons where id=cl.referrer_salon_id) is distinct from cl.referrer_owner_id or (select user_id from public.salons where id=cl.referred_salon_id) is distinct from cl.referred_owner_id then reason:='ownership_review';
  elsif exists(select 1 from public.subscriptions where salon_id=cl.referrer_salon_id and stripe_customer_id=subscription_row.stripe_customer_id and stripe_customer_id is not null) then reason:='identity_review';
  end if;
  select b.* into evidence from public.billing_events b join public.business_referral_payment_checks ch on ch.billing_event_id=b.id
   where b.salon_id=cl.referred_salon_id and b.stripe_subscription_id=subscription_row.stripe_subscription_id
   and (not exists(select 1 from public.business_referral_rewards w where w.claim_id=cl.id) or b.id=(select w.billing_event_id from public.business_referral_rewards w where w.claim_id=cl.id))
   and b.payment_status='paid' and b.amount_collected>=(cl.terms->>'minimum_payment_cents')::bigint and b.currency='usd'
   and ch.state='verified' and ch.checked_at>now()-interval '5 minutes'
   and ch.proof->>'source'='stripe_verified_payment_v1' and ch.proof->>'livemode'='true'
   and ch.proof->>'customer_id'=subscription_row.stripe_customer_id and ch.proof->>'payment_intent_id'~'^pi_[A-Za-z0-9]+$' and ch.proof->>'charge_id'~'^ch_[A-Za-z0-9]+$'
   and (ch.proof->>'amount_cents')::bigint=b.amount_collected
   and (ch.proof->>'subscription_created_at')::timestamptz>=cl.created_at
   and (ch.proof->>'paid_at')::timestamptz between cl.created_at and least((cl.terms->>'ends_at')::timestamptz,cl.created_at+make_interval(days=>(cl.terms->>'qualifying_days')::integer))
   order by b.event_date,b.id limit 1;
  if evidence.id is not null then
   select ch.proof into proof from public.business_referral_payment_checks ch where ch.billing_event_id=evidence.id;
   if lower(subscription_row.status)<>'active' or subscription_row.cancel_at_period_end or subscription_row.ended_at is not null then reason:=coalesce(reason,'subscription_review'); end if;
   if exists(select 1 from public.billing_events b where b.salon_id=cl.referred_salon_id and b.stripe_invoice_id=evidence.stripe_invoice_id and (b.amount_refunded>0 or b.amount_credited>0)) then reason:=coalesce(reason,'payment_reversal_review'); end if;
   if not exists(select 1 from public.business_referral_rewards where claim_id=cl.id) and (select count(*) from public.business_referral_rewards w join public.business_referral_claims x on x.id=w.claim_id where x.campaign_id=cl.campaign_id and x.referrer_salon_id=cl.referrer_salon_id)>=(cl.terms->>'max_rewards_per_referrer')::integer then reason:=coalesce(reason,'campaign_limit_review'); end if;
   if exists(select 1 from public.business_referral_rewards where claim_id<>cl.id and (qualifying_customer_id=proof->>'customer_id' or qualifying_payment_intent_id=proof->>'payment_intent_id')) then reason:='duplicate_payment_identity'; end if;
   next_status:=case when reason is null then 'qualified' else 'on_hold' end;
   beneficiary:=case cl.terms->>'recipient' when 'referrer' then cl.referrer_salon_id else cl.referred_salon_id end;
   if reason is distinct from 'duplicate_payment_identity' then
   insert into public.business_referral_rewards(claim_id,beneficiary_salon_id,campaign_id,campaign_title,amount_cents,currency,billing_event_id,qualifying_customer_id,qualifying_payment_intent_id,status,qualified_at,eligible_at)
    values(cl.id,beneficiary,cl.campaign_id,cl.campaign_title,(cl.terms->>'amount_cents')::integer,'usd',evidence.id,proof->>'customer_id',proof->>'payment_intent_id',case when reason is null then 'pending_review' else 'on_hold' end,now(),(proof->>'paid_at')::timestamptz+make_interval(days=>(cl.terms->>'hold_days')::integer))
    on conflict(claim_id) do update set status=case when reason is null then 'pending_review' else 'on_hold' end,updated_at=now();
   end if;
  elsif reason is not null then next_status:='on_hold';
  elsif now()>least((cl.terms->>'ends_at')::timestamptz,cl.created_at+make_interval(days=>(cl.terms->>'qualifying_days')::integer)) then next_status:='expired';
  end if;
  if evidence.id is null and exists(select 1 from public.business_referral_rewards where claim_id=cl.id) then
   next_status:='on_hold'; reason:=coalesce(reason,'payment_review'); update public.business_referral_rewards set status='on_hold',updated_at=now() where claim_id=cl.id;
  end if;
  if cl.status is distinct from next_status or cl.review_reason is distinct from reason then
   update public.business_referral_claims set status=next_status,review_reason=reason,updated_at=now() where id=cl.id;
   insert into public.business_referral_events(campaign_id,claim_id,actor_id,action,reason) values(cl.campaign_id,cl.id,p_actor,next_status,reason);
  end if;
 end loop;
end $$;

create function public.business_referral_workspace(p_salon uuid,p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor) then raise exception 'REFERRAL_FORBIDDEN'; end if;
 return jsonb_build_object('issuance_enabled',false,
 'campaigns',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'status',c.status,'revision',c.revision,'terms',c.terms)) from public.business_referral_campaigns c where c.status='active' and now() between (c.terms->>'starts_at')::timestamptz and (c.terms->>'ends_at')::timestamptz),'[]'),
 'codes',coalesce((select jsonb_agg(jsonb_build_object('campaign_id',c.campaign_id,'code',c.code)) from public.business_referral_codes c where c.salon_id=p_salon and c.owner_id=p_actor),'[]'),
 'claim',(select jsonb_build_object('id',c.id,'status',c.status,'campaign_title',c.campaign_title,'created_at',c.created_at) from public.business_referral_claims c where c.referred_salon_id=p_salon and c.referred_owner_id=p_actor),
 'rewards',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'status',case when ch.state='verified' and ch.checked_at>now()-interval '5 minutes' then w.status else 'on_hold' end,'amount_cents',w.amount_cents,'currency',w.currency,'campaign_title',w.campaign_title,'qualified_at',w.qualified_at,'eligible_at',w.eligible_at) order by w.qualified_at desc) from public.business_referral_rewards w left join public.business_referral_payment_checks ch on ch.billing_event_id=w.billing_event_id where w.beneficiary_salon_id=p_salon),'[]'));
end $$;

revoke all on function public.business_referral_terms_valid(jsonb,boolean),public.save_business_referral_campaign(uuid,uuid,integer,text,jsonb),public.authorize_business_referral_campaign(uuid,uuid,integer,boolean),public.create_business_referral_code(uuid,uuid,uuid),public.claim_business_referral(uuid,uuid,text),public.business_referral_check_inputs(uuid,uuid),public.reconcile_business_referrals(uuid,uuid),public.business_referral_workspace(uuid,uuid) from public,anon,authenticated;
grant execute on function public.business_referral_terms_valid(jsonb,boolean),public.save_business_referral_campaign(uuid,uuid,integer,text,jsonb),public.authorize_business_referral_campaign(uuid,uuid,integer,boolean),public.create_business_referral_code(uuid,uuid,uuid),public.claim_business_referral(uuid,uuid,text),public.business_referral_check_inputs(uuid,uuid),public.reconcile_business_referrals(uuid,uuid),public.business_referral_workspace(uuid,uuid) to service_role;
update public.engine_settings set published_value='"20260919043012"'::jsonb,draft_value='"20260919043012"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
