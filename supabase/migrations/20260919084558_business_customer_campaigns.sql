begin;
-- Selection/approval records reference the existing notification ledger. They
-- are not a new inbox, consent source or independently retryable delivery queue.
create table public.business_customer_campaigns (
 id uuid primary key, salon_id uuid not null references public.salons(id) on delete cascade,
 created_by uuid not null, confirmed_by uuid, post_id uuid not null references public.business_marketing_posts(id),
 post_revision integer not null, copies jsonb not null, booking_path text not null,
 revision integer not null default 1, status text not null default 'draft' check(status in('draft','confirmed','cancelled')),
 confirmed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index business_customer_campaigns_business on public.business_customer_campaigns(salon_id,created_at desc);
create table public.business_customer_campaign_recipients (
 campaign_id uuid not null references public.business_customer_campaigns(id) on delete cascade,
 customer_id uuid not null references auth.users(id), preference_id uuid not null references public.business_communication_preferences(id),
 preference_revision integer not null, booking_id uuid not null references public.bookings(id),
 locale text not null check(locale in('en','fr','es','zh-CN')), destination text not null, display_name text not null,
 status text not null default 'pending' check(status in('pending','processing','accepted','skipped','uncertain')),
 attempt_id uuid, attempted_at timestamptz, delivery_log_id uuid references public.notification_delivery_log(id),
 outcome_code text, support_reference uuid, updated_at timestamptz not null default now(),
 primary key(campaign_id,customer_id),
 check((attempt_id is null)=(attempted_at is null)),
 check(status not in('processing','accepted','uncertain') or attempt_id is not null)
);
alter table public.business_customer_campaigns enable row level security;
alter table public.business_customer_campaign_recipients enable row level security;
revoke all on public.business_customer_campaigns,public.business_customer_campaign_recipients from public,anon,authenticated;
grant select,insert,update on public.business_customer_campaigns,public.business_customer_campaign_recipients to service_role;
grant usage on schema auth to service_role;
grant select(id,email,email_confirmed_at) on auth.users to service_role;
grant select on public.customers,public.platform_identities,public.engine_settings,public.test_data_registry to service_role;
grant select,update(id) on public.salons,public.bookings,public.business_communication_preferences to service_role;
grant select,update on public.notification_delivery_log to service_role;

create function public.assert_customer_campaign_owner(p_salon uuid,p_actor uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor)
  or not public.p0_actor_has_permission(p_salon,p_actor,'promotions') then raise exception 'CAMPAIGN_FORBIDDEN';end if;
end $$;

-- Private, service-only source. A guest's booking permission is deliberately
-- insufficient: this requires the registered customer's business-level opt-in.
create function public.customer_campaign_eligible(p_salon uuid)
returns table(customer_id uuid,preference_id uuid,preference_revision integer,booking_id uuid,locale text,destination text,display_name text)
language sql stable security invoker set search_path=public,pg_temp as $$
 select p.customer_id,p.id,p.revision,b.id,p.locale,u.email::text,coalesce(nullif(c.name,''),nullif(b.guest_name,''),left(u.email,1)||'***')
 from public.business_communication_preferences p
 join auth.users u on u.id=p.customer_id and u.email_confirmed_at is not null and u.email is not null and u.email<>''
 join public.customers c on c.id=p.customer_id and c.status='Active'
 join public.platform_identities i on i.user_id=u.id and i.primary_role='customer' and i.status='Active'
 join lateral(select x.id,x.guest_name from public.bookings x where x.salon_id=p_salon and x.customer_id=p.customer_id and x.status='Completed'
  and not exists(select 1 from public.test_data_registry t where t.record_type='booking' and t.record_id=x.id::text)
  order by x.appointment_datetime desc,x.id limit 1)b on true
 where p.salon_id=p_salon and p.customer_id is not null and p.guest_booking_id is null and p.marketing and p.email_enabled;
$$;

create function public.customer_campaign_source_current(p public.business_customer_campaigns) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.business_marketing_posts m join public.salons s on s.id=m.salon_id
 where m.id=p.post_id and m.salon_id=p.salon_id and m.revision=p.post_revision and m.status='published' and m.expires_at>now()
 and m.approved_by=s.user_id and m.copies=p.copies and m.booking_path=p.booking_path
 and public.p0_actor_has_permission(m.salon_id,m.approved_by,'promotions')
 and public.is_salon_profile_public(m.salon_id) and public.business_marketing_sources_current(m.salon_id,m.source,m.snapshot));
$$;

create function public.customer_campaign_workspace(p_salon uuid,p_actor uuid,p_search text default '') returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v_clients jsonb; v_posts jsonb; v_campaigns jsonb;
begin
 perform public.assert_customer_campaign_owner(p_salon,p_actor);
 if p_search is null or length(p_search)>100 then raise exception 'CAMPAIGN_INVALID';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',customer_id,'name',display_name,'locale',locale,'email_hint',left(destination,1)||'***@'||split_part(destination,'@',2))),'[]') into v_clients
 from (select * from public.customer_campaign_eligible(p_salon) where position(lower(p_search) in lower(display_name))>0 order by lower(display_name),customer_id limit 201)e;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'revision',m.revision,'copies',m.copies,'booking_path',m.booking_path)),'[]') into v_posts
 from (select * from public.business_marketing_posts where salon_id=p_salon and status='published' and expires_at>now() order by updated_at desc limit 50)m
 where public.business_marketing_sources_current(p_salon,m.source,m.snapshot) and public.is_salon_profile_public(p_salon)
 and exists(select 1 from public.salons where id=p_salon and user_id=m.approved_by);
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'revision',c.revision,'status',c.status,'copies',c.copies,'booking_path',c.booking_path,
  'created_at',c.created_at,'recipients',(select coalesce(jsonb_agg(jsonb_build_object('id',r.customer_id,'name',r.display_name,'locale',r.locale,
    'email_hint',left(r.destination,1)||'***@'||split_part(r.destination,'@',2),'status',r.status,'outcome_code',r.outcome_code,'support_reference',r.support_reference) order by r.display_name,r.customer_id),'[]')
    from public.business_customer_campaign_recipients r where r.campaign_id=c.id)) order by c.created_at desc),'[]') into v_campaigns
 from (select * from public.business_customer_campaigns where salon_id=p_salon order by created_at desc limit 50)c;
 return jsonb_build_object('clients',v_clients,'clients_capped',jsonb_array_length(v_clients)>200,'posts',v_posts,'campaigns',v_campaigns,'channel','email');
end $$;

create function public.save_customer_campaign(p_salon uuid,p_actor uuid,p_id uuid,p_post uuid,p_post_revision integer,p_customers uuid[]) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare m public.business_marketing_posts%rowtype;c public.business_customer_campaigns%rowtype;v_count integer;
begin
 perform 1 from public.salons where id=p_salon for update;
 perform public.assert_customer_campaign_owner(p_salon,p_actor);
 if p_id is null or cardinality(p_customers) is null or cardinality(p_customers) not between 1 and 20
 or array_position(p_customers,null) is not null or (select count(distinct x) from unnest(p_customers)x)<>cardinality(p_customers) then raise exception 'CAMPAIGN_INVALID';end if;
 select * into c from public.business_customer_campaigns where id=p_id for update;
 if found then
  if c.salon_id<>p_salon or c.created_by<>p_actor or c.post_id<>p_post or c.post_revision<>p_post_revision
   or (select array_agg(customer_id order by customer_id) from public.business_customer_campaign_recipients where campaign_id=p_id) is distinct from (select array_agg(x order by x) from unnest(p_customers)x) then raise exception 'CAMPAIGN_REQUEST_REUSED';end if;
  return c.id;
 end if;
 select * into m from public.business_marketing_posts where id=p_post and salon_id=p_salon for share;
 if not found or m.revision is distinct from p_post_revision then raise exception 'CAMPAIGN_SOURCE_CHANGED';end if;
 insert into public.business_customer_campaigns(id,salon_id,created_by,post_id,post_revision,copies,booking_path)
 values(p_id,p_salon,p_actor,m.id,m.revision,m.copies,m.booking_path) returning * into c;
 if not public.customer_campaign_source_current(c) then raise exception 'CAMPAIGN_SOURCE_CHANGED';end if;
 insert into public.business_customer_campaign_recipients(campaign_id,customer_id,preference_id,preference_revision,booking_id,locale,destination,display_name)
 select p_id,e.customer_id,e.preference_id,e.preference_revision,e.booking_id,e.locale,e.destination,e.display_name from public.customer_campaign_eligible(p_salon)e where e.customer_id=any(p_customers);
 get diagnostics v_count=row_count;
 if v_count<>cardinality(p_customers) then raise exception 'CAMPAIGN_CONSENT_CHANGED';end if;
 return p_id;
end $$;

create function public.confirm_customer_campaign(p_salon uuid,p_actor uuid,p_id uuid,p_revision integer,p_reviewed text[]) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.business_customer_campaigns%rowtype;
begin
 perform 1 from public.salons where id=p_salon for update;
 perform public.assert_customer_campaign_owner(p_salon,p_actor);
 select * into c from public.business_customer_campaigns where id=p_id and salon_id=p_salon for update;
 if not found then raise exception 'CAMPAIGN_NOT_FOUND';end if;
 if c.status='confirmed' and c.revision=p_revision+1 and c.confirmed_by=p_actor then return;end if;
 if c.status<>'draft' or c.revision is distinct from p_revision then raise exception 'CAMPAIGN_STALE';end if;
 if not public.customer_campaign_source_current(c) then raise exception 'CAMPAIGN_SOURCE_CHANGED';end if;
 if p_reviewed is null or cardinality(p_reviewed) not between 1 and 4 or array_position(p_reviewed,null) is not null
  or not p_reviewed <@ array['en','fr','es','zh-CN'] or exists(select 1 from public.business_customer_campaign_recipients r where r.campaign_id=p_id and not(r.locale=any(p_reviewed))) then raise exception 'CAMPAIGN_REVIEW_REQUIRED';end if;
 if exists(select 1 from public.business_customer_campaign_recipients r where r.campaign_id=p_id and not exists(select 1 from public.customer_campaign_eligible(p_salon)e
  where e.customer_id=r.customer_id and e.preference_id=r.preference_id and e.preference_revision=r.preference_revision and e.destination=r.destination and e.locale=r.locale)) then raise exception 'CAMPAIGN_CONSENT_CHANGED';end if;
 update public.business_customer_campaigns set status='confirmed',confirmed_by=p_actor,confirmed_at=now(),revision=revision+1,updated_at=now() where id=p_id;
end $$;

create function public.cancel_customer_campaign(p_salon uuid,p_actor uuid,p_id uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform 1 from public.salons where id=p_salon for update;perform public.assert_customer_campaign_owner(p_salon,p_actor);
 update public.business_customer_campaigns set status='cancelled',revision=revision+case when status='cancelled' then 0 else 1 end,updated_at=now() where id=p_id and salon_id=p_salon;
 if not found then raise exception 'CAMPAIGN_NOT_FOUND';end if;
 update public.business_customer_campaign_recipients set status='skipped',outcome_code='cancelled',updated_at=now() where campaign_id=p_id and status='pending' and attempt_id is null;
end $$;

create function public.claim_customer_campaign_email(p_salon uuid,p_actor uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.business_customer_campaigns%rowtype;r public.business_customer_campaign_recipients%rowtype;v_log uuid;v_attempt uuid:=gen_random_uuid();v_code text;
begin
 perform 1 from public.salons where id=p_salon for update;perform public.assert_customer_campaign_owner(p_salon,p_actor);
 select * into c from public.business_customer_campaigns where id=p_id and salon_id=p_salon for update;
 if not found then raise exception 'CAMPAIGN_NOT_FOUND';end if;
 if c.status<>'confirmed' or c.confirmed_by is distinct from p_actor then raise exception 'CAMPAIGN_REVIEW_REQUIRED';end if;
 select * into r from public.business_customer_campaign_recipients where campaign_id=p_id and status='pending' and attempt_id is null order by customer_id for update limit 1;
 if not found then return null;end if;
 -- Lock in the same order as the canonical delivery/consent path.
 perform 1 from public.bookings where id=r.booking_id and salon_id=p_salon for update;
 perform 1 from public.business_communication_preferences where id=r.preference_id for share;
 if not public.customer_campaign_source_current(c) then v_code:='source_changed';
 elsif not exists(select 1 from public.engine_settings where setting_key='notifications.channels' and published_value @> '["email"]'::jsonb) then v_code:='channel_unavailable';
 elsif not exists(select 1 from public.customer_campaign_eligible(p_salon)e where e.customer_id=r.customer_id and e.preference_id=r.preference_id and e.preference_revision=r.preference_revision and e.destination=r.destination and e.locale=r.locale) then v_code:='consent_changed';
 end if;
 if v_code is null then
  v_log:=public.claim_notification_delivery(r.booking_id,'business_campaign:'||p_id,'customer','email',r.destination,'business-campaign:'||p_id||':'||r.customer_id||':email');
  if v_log is null then v_code:='consent_changed';end if;
 end if;
 if v_code is not null then
  update public.business_customer_campaign_recipients set status='skipped',outcome_code=v_code,updated_at=now() where campaign_id=p_id and customer_id=r.customer_id;
  return jsonb_build_object('skipped',true);
 end if;
 -- This latch is never reclaimed, including after process death, provider
 -- timeout or provider idempotency retention expiry. Only finish may change it.
 update public.business_customer_campaign_recipients set status='processing',attempt_id=v_attempt,attempted_at=now(),delivery_log_id=v_log,updated_at=now() where campaign_id=p_id and customer_id=r.customer_id;
 return jsonb_build_object('attempt_id',v_attempt,'customer_id',r.customer_id,'preference_id',r.preference_id,'destination',r.destination,'locale',r.locale,'copy',c.copies->r.locale,'booking_path',c.booking_path,'business_name',(select name from public.salons where id=p_salon));
end $$;

create function public.finish_customer_campaign_email(p_salon uuid,p_id uuid,p_customer uuid,p_attempt uuid,p_status text,p_reference uuid default null) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.business_customer_campaign_recipients%rowtype;
begin
 if p_status is null or p_status not in('accepted','uncertain') then raise exception 'CAMPAIGN_INVALID';end if;
 select r0.* into r from public.business_customer_campaign_recipients r0 join public.business_customer_campaigns c on c.id=r0.campaign_id
 where c.salon_id=p_salon and r0.campaign_id=p_id and r0.customer_id=p_customer and r0.attempt_id=p_attempt for update of r0;
 if not found then raise exception 'CAMPAIGN_NOT_FOUND';end if;
 if r.status=p_status then return;end if;
 if r.status<>'processing' then raise exception 'CAMPAIGN_STALE';end if;
 update public.business_customer_campaign_recipients set status=p_status,outcome_code=case when p_status='uncertain' then 'review_required' end,support_reference=case when p_status='uncertain' then p_reference end,updated_at=now() where campaign_id=p_id and customer_id=p_customer;
 update public.notification_delivery_log set delivery_status=case when p_status='accepted' then 'delivered' else 'failed' end,error_message=case when p_status='uncertain' then 'CAMPAIGN_OUTCOME_UNCERTAIN_NO_RETRY'||coalesce('_REFERENCE:'||p_reference,'') end,lease_expires_at=null,updated_at=now() where id=r.delivery_log_id;
end $$;

revoke all on function public.assert_customer_campaign_owner(uuid,uuid),public.customer_campaign_eligible(uuid),public.customer_campaign_source_current(public.business_customer_campaigns),public.customer_campaign_workspace(uuid,uuid,text),public.save_customer_campaign(uuid,uuid,uuid,uuid,integer,uuid[]),public.confirm_customer_campaign(uuid,uuid,uuid,integer,text[]),public.cancel_customer_campaign(uuid,uuid,uuid),public.claim_customer_campaign_email(uuid,uuid,uuid),public.finish_customer_campaign_email(uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.assert_customer_campaign_owner(uuid,uuid),public.customer_campaign_eligible(uuid),public.customer_campaign_source_current(public.business_customer_campaigns),public.customer_campaign_workspace(uuid,uuid,text),public.save_customer_campaign(uuid,uuid,uuid,uuid,integer,uuid[]),public.confirm_customer_campaign(uuid,uuid,uuid,integer,text[]),public.cancel_customer_campaign(uuid,uuid,uuid),public.claim_customer_campaign_email(uuid,uuid,uuid),public.finish_customer_campaign_email(uuid,uuid,uuid,uuid,text,uuid) to service_role;
update public.engine_settings set published_value='"20260919084558"'::jsonb,draft_value='"20260919084558"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
