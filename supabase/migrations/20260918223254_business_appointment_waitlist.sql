begin;

-- Appointment requests are distinct from the future-category application waitlist.
-- Writes go through authenticated server routes; clients have no direct table access.
create table public.appointment_waitlist (
 id uuid primary key,
 salon_id uuid not null references public.salons(id) on delete cascade,
 customer_id uuid not null references public.customers(id) on delete cascade,
 style_id uuid not null references public.styles(id) on delete cascade,
 stylist_id uuid references public.stylists(id) on delete cascade,
 starts_after timestamptz not null,
 starts_before timestamptz not null,
 locale text not null check(locale in ('en','fr','es','zh-CN')),
 status text not null default 'waiting' check(status in ('waiting','cancelled','fulfilled','expired')),
 created_at timestamptz not null default now(),
 next_check_at timestamptz not null default now(),
 check(starts_before > starts_after and starts_before <= starts_after + interval '31 days')
);
create index appointment_waitlist_business_due on public.appointment_waitlist(salon_id,starts_before) where status='waiting';
create index appointment_waitlist_customer on public.appointment_waitlist(customer_id,created_at desc);
create table public.appointment_waitlist_offers (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.appointment_waitlist(id) on delete cascade,
 source_booking_id uuid not null references public.bookings(id) on delete cascade,
 appointment_at timestamptz not null,
 stylist_id uuid references public.stylists(id) on delete cascade,
 expires_at timestamptz not null,
 status text not null default 'offered' check(status in ('offered','claimed','booked','expired','withdrawn')),
 intent_id uuid references public.booking_checkout_intents(id),
 booking_id uuid references public.bookings(id),
 created_at timestamptz not null default now(),
 unique(request_id,source_booking_id)
);
create index appointment_waitlist_offer_expiry on public.appointment_waitlist_offers(expires_at) where status in ('offered','claimed');
create unique index appointment_waitlist_one_claim_per_opening on public.appointment_waitlist_offers(source_booking_id) where status in ('claimed','booked');
alter table public.bookings add column waitlist_offer_id uuid references public.appointment_waitlist_offers(id);
alter table public.appointment_waitlist enable row level security;
alter table public.appointment_waitlist_offers enable row level security;
revoke all on public.appointment_waitlist,public.appointment_waitlist_offers from public,anon,authenticated;
grant all on public.appointment_waitlist,public.appointment_waitlist_offers to service_role;

create function public.manage_appointment_waitlist(p_customer uuid,p_action text,p_id uuid default null,p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.appointment_waitlist%rowtype; s public.salons%rowtype; a timestamptz; b timestamptz;
begin
 if not exists(select 1 from public.platform_identities where user_id=p_customer and primary_role='customer' and status='Active')
   or not exists(select 1 from public.customers where id=p_customer) then raise exception 'WAITLIST_ACCESS_DENIED'; end if;
 if p_action='join' then
  select * into s from public.salons where id=(p_args->>'salon_id')::uuid;
  if not found or not public.is_marketplace_visible(s.id) or s.accepting_bookings=false then raise exception 'WAITLIST_BUSINESS_UNAVAILABLE'; end if;
  if not exists(select 1 from public.styles where id=(p_args->>'style_id')::uuid and salon_id=s.id and archived_at is null and not is_draft) then raise exception 'WAITLIST_SERVICE_UNAVAILABLE'; end if;
  if p_args->>'stylist_id' is not null and not exists(select 1 from public.stylists where id=(p_args->>'stylist_id')::uuid and salon_id=s.id and is_active and not is_draft and archived_at is null
    and (assigned_service_ids is null or (p_args->>'style_id')::uuid=any(assigned_service_ids))) then raise exception 'WAITLIST_SERVICE_UNAVAILABLE'; end if;
  a:=(p_args->>'starts_after')::timestamptz; b:=(p_args->>'starts_before')::timestamptz;
  if p_id is null or a is null or b is null or a<=now() or b<=a or b>a+interval '31 days' or b>now()+interval '180 days' or p_args->>'locale' not in ('en','fr','es','zh-CN') then raise exception 'WAITLIST_INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('waitlist-customer:'||p_customer::text,0));
  select * into r from public.appointment_waitlist where id=p_id;
  if found then
   if r.customer_id<>p_customer or r.salon_id<>s.id or r.style_id<>(p_args->>'style_id')::uuid or r.stylist_id is distinct from (p_args->>'stylist_id')::uuid or r.starts_after<>a or r.starts_before<>b then raise exception 'WAITLIST_REQUEST_CONFLICT'; end if;
  else
   if (select count(*) from public.appointment_waitlist where customer_id=p_customer and status='waiting' and starts_before>now())>=20 then raise exception 'WAITLIST_LIMIT'; end if;
   insert into public.appointment_waitlist(id,salon_id,customer_id,style_id,stylist_id,starts_after,starts_before,locale)
    values(p_id,s.id,p_customer,(p_args->>'style_id')::uuid,(p_args->>'stylist_id')::uuid,a,b,p_args->>'locale');
  end if;
 elsif p_action='leave' then
  update public.appointment_waitlist set status='cancelled' where id=p_id and customer_id=p_customer and status='waiting';
  update public.appointment_waitlist_offers o set status='withdrawn' from public.appointment_waitlist w where o.request_id=w.id and w.id=p_id and w.customer_id=p_customer and o.status='offered';
 elsif p_action<>'list' then raise exception 'WAITLIST_INVALID_INPUT'; end if;
 return coalesce((select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
  select w.id,w.salon_id,w.style_id,w.stylist_id,w.starts_after,w.starts_before,w.created_at,
   case when w.status='waiting' and w.starts_before<=now() then 'expired' else w.status end as status,
   business.name as business_name,business.slug,business.time_zone,st.name as service_name,p.name as professional_name,
   coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'appointment_at',o.appointment_at,'stylist_id',o.stylist_id,'expires_at',o.expires_at,
     'status',case when o.status='offered' and o.expires_at<=now() then 'expired' else o.status end,'booking_id',o.booking_id) order by o.created_at desc)
     from public.appointment_waitlist_offers o where o.request_id=w.id),'[]'::jsonb) as offers
  from public.appointment_waitlist w join public.salons business on business.id=w.salon_id join public.styles st on st.id=w.style_id
  left join public.stylists p on p.id=w.stylist_id where w.customer_id=p_customer order by w.created_at desc limit 100
 ) x),'[]'::jsonb);
end $$;

create function public.read_business_waitlist(p_salon uuid,p_user uuid) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if not public.p0_actor_has_permission(p_salon,p_user,'bookings') or not public.p0_business_plan_active(p_salon) then raise exception 'WAITLIST_ACCESS_DENIED'; end if;
 return coalesce((select jsonb_agg(row_to_json(x) order by x.starts_after) from (
  select w.id,w.style_id,w.stylist_id,w.starts_after,w.starts_before,
   case when w.status='waiting' and w.starts_before<=now() then 'expired' else w.status end as status,
   st.name as service_name,p.name as professional_name,c.name as customer_name,
   (select count(*) from public.appointment_waitlist_offers o where o.request_id=w.id and o.status='offered' and o.expires_at>now()) as open_offers,
   (select count(*) from public.appointment_waitlist_offers o where o.request_id=w.id and o.status='booked') as booked_offers
  from public.appointment_waitlist w join public.styles st on st.id=w.style_id and st.salon_id=p_salon
   join public.customers c on c.id=w.customer_id left join public.stylists p on p.id=w.stylist_id and p.salon_id=p_salon
  where w.salon_id=p_salon and public.p0_actor_can_manage_professional(p_salon,p_user,w.stylist_id)
  order by w.created_at desc limit 200
 ) x),'[]'::jsonb);
end $$;

-- Called by the existing protected booking scheduler. No messages, bookings or charges
-- are emitted by listing candidates; each offer is rechecked against live availability.
create function public.due_appointment_waitlist() returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare batch jsonb;
begin
 update public.appointment_waitlist set status='expired' where status='waiting' and starts_before<=now();
 update public.appointment_waitlist_offers o set status='expired' where
  (status='offered' and expires_at<=now()) or (status='claimed' and exists(select 1 from public.booking_checkout_intents i where i.id=o.intent_id and (i.status in ('Expired','Failed','Cancelled') or (i.status='Pending' and i.expires_at<=now()))));
 select coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) into batch from (
  select w.id as request_id,w.salon_id,w.style_id,w.customer_id,w.locale,b.id as source_booking_id,b.appointment_datetime as appointment_at,
   coalesce(w.stylist_id,b.stylist_id) as stylist_id,s.time_zone
  from public.appointment_waitlist w join public.bookings b on b.salon_id=w.salon_id
   join public.salons s on s.id=w.salon_id
  where w.status='waiting' and w.starts_before>now() and w.next_check_at<=now() and lower(b.status) in ('cancelled','canceled') and b.payment_mode is distinct from 'test'
   and b.appointment_datetime>now()+interval '30 minutes' and b.appointment_datetime between w.starts_after and w.starts_before
   and (w.stylist_id is null or w.stylist_id is not distinct from b.stylist_id)
   and not exists(select 1 from public.appointment_waitlist_offers o where o.request_id=w.id and o.source_booking_id=b.id)
  order by w.next_check_at,b.appointment_datetime,w.created_at limit 3
 ) x;
 update public.appointment_waitlist set next_check_at=now()+interval '5 minutes' where id in(select (value->>'request_id')::uuid from jsonb_array_elements(batch));
 return batch;
end $$;

create function public.offer_appointment_waitlist(p_request uuid,p_source uuid,p_stylist uuid,p_copy jsonb) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare w public.appointment_waitlist%rowtype; b public.bookings%rowtype; s public.salons%rowtype; offer_id uuid;
begin
 select * into w from public.appointment_waitlist where id=p_request for update;
 if not found or w.status<>'waiting' then return null; end if;
 select * into b from public.bookings where id=p_source and salon_id=w.salon_id;
 if not found or lower(b.status) not in ('cancelled','canceled') or b.payment_mode='test'
  or b.appointment_datetime<=now()+interval '30 minutes' or b.appointment_datetime not between w.starts_after and w.starts_before
  or (w.stylist_id is not null and w.stylist_id is distinct from p_stylist) then return null; end if;
 select * into s from public.salons where id=w.salon_id;
 if not public.is_marketplace_visible(s.id) or s.accepting_bookings=false then return null; end if;
 if p_stylist is not null and not exists(select 1 from public.stylists where id=p_stylist and salon_id=w.salon_id and is_active and archived_at is null) then return null; end if;
 insert into public.appointment_waitlist_offers(request_id,source_booking_id,appointment_at,stylist_id,expires_at)
  values(w.id,b.id,b.appointment_datetime,p_stylist,least(now()+interval '1 hour',b.appointment_datetime-interval '30 minutes'))
  on conflict(request_id,source_booking_id) do nothing returning id into offer_id;
 if offer_id is not null then
  perform public.upsert_dashboard_notification(w.customer_id,w.salon_id,null,'customer','bookings','info',p_copy->>'title',p_copy->>'body','/account/waitlist','waitlist:'||offer_id::text,'{}');
  perform public.upsert_dashboard_notification(s.user_id,w.salon_id,null,'salon','bookings','info','Waitlist opening offered','A matching customer can review the available appointment. No booking or payment has been made.','/salon/dashboard/bookings?view=waitlist','waitlist-owner:'||offer_id::text,'{}');
 end if;
 return offer_id;
end $$;

-- Runs in the same transaction as the existing chair/customer reservation. A valid
-- offer never bypasses policy consent, current prices/deposit terms or calendar guards.
create function public.claim_appointment_waitlist_offer() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.appointment_waitlist_offers%rowtype; w public.appointment_waitlist%rowtype;
begin
 if new.payload->>'waitlist_offer_id' is null then return new; end if;
 if not exists(select 1 from public.platform_identities where user_id=new.customer_id and primary_role='customer' and status='Active') then raise exception 'WAITLIST_OFFER_UNAVAILABLE'; end if;
 select * into o from public.appointment_waitlist_offers where id=(new.payload->>'waitlist_offer_id')::uuid;
 if not found then raise exception 'WAITLIST_OFFER_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('waitlist-opening:'||o.source_booking_id::text,0));
 if exists(select 1 from public.appointment_waitlist_offers where source_booking_id=o.source_booking_id and status in ('claimed','booked')) then raise exception 'WAITLIST_OFFER_UNAVAILABLE'; end if;
 select * into w from public.appointment_waitlist where id=o.request_id for update;
 select * into o from public.appointment_waitlist_offers where id=o.id for update;
 if not found or o.status<>'offered' or o.expires_at<=now() then raise exception 'WAITLIST_OFFER_UNAVAILABLE'; end if;
 if w.status<>'waiting' or w.customer_id is distinct from new.customer_id or w.salon_id<>new.salon_id or w.style_id<>new.style_id
  or o.appointment_at<>new.appointment_datetime or o.stylist_id is distinct from new.stylist_id
  or not exists(select 1 from public.bookings where id=o.source_booking_id and salon_id=w.salon_id and lower(status) in ('cancelled','canceled'))
  then raise exception 'WAITLIST_OFFER_UNAVAILABLE'; end if;
 update public.appointment_waitlist_offers set status='claimed',intent_id=new.id where id=o.id;
 return new;
end $$;
-- AFTER insertion satisfies the intent foreign key; failure rolls the entire hold back.
create trigger zz_waitlist_claim after insert on public.booking_checkout_intents for each row execute function public.claim_appointment_waitlist_offer();
create function public.complete_appointment_waitlist_offer() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_request uuid;
begin
 if new.origin_checkout_intent_id is null then return new; end if;
 select request_id into v_request from public.appointment_waitlist_offers where intent_id=new.origin_checkout_intent_id and status='claimed';
 if v_request is not null then
  perform 1 from public.appointment_waitlist where id=v_request for update;
  update public.appointment_waitlist_offers set status='booked',booking_id=new.id where intent_id=new.origin_checkout_intent_id and status='claimed';
  update public.appointment_waitlist set status='fulfilled' where id=v_request;
  update public.appointment_waitlist_offers set status='withdrawn' where status='offered' and (request_id=v_request or source_booking_id in(select source_booking_id from public.appointment_waitlist_offers where intent_id=new.origin_checkout_intent_id));
 end if;
 return new;
end $$;
create trigger zz_waitlist_booked after insert on public.bookings for each row execute function public.complete_appointment_waitlist_offer();
revoke all on function public.manage_appointment_waitlist(uuid,text,uuid,jsonb),public.read_business_waitlist(uuid,uuid),public.due_appointment_waitlist(),public.offer_appointment_waitlist(uuid,uuid,uuid,jsonb),public.claim_appointment_waitlist_offer(),public.complete_appointment_waitlist_offer() from public,anon,authenticated;
grant execute on function public.manage_appointment_waitlist(uuid,text,uuid,jsonb),public.read_business_waitlist(uuid,uuid),public.due_appointment_waitlist(),public.offer_appointment_waitlist(uuid,uuid,uuid,jsonb) to service_role;
update public.engine_settings set published_value='"20260918223254"'::jsonb,draft_value='"20260918223254"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
