begin;
set local lock_timeout='5s';
create table public.business_travel_quotes(
 id uuid primary key default gen_random_uuid(),salon_id uuid not null references public.salons(id),
 customer_id uuid references auth.users(id),email_hash text not null check(email_hash~'^[0-9a-f]{64}$'),
 address jsonb not null check(jsonb_typeof(address)='object'),location_revision bigint not null,
 origin_fingerprint text not null,fee_cents integer not null check(fee_cents between 0 and 100000),
 distance_miles double precision not null check(distance_miles>=0),created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '15 minutes',
 intent_id uuid unique references public.booking_checkout_intents(id) deferrable initially deferred
);
alter table public.business_travel_quotes enable row level security;
revoke all on public.business_travel_quotes from public,anon,authenticated;
grant select,insert,delete on public.business_travel_quotes to service_role;
create index business_travel_quotes_expiry on public.business_travel_quotes(expires_at);

create function public.create_business_travel_quote(p_salon uuid,p_customer uuid,p_email_hash text,p_address jsonb,p_lat double precision,p_lng double precision) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.salons%rowtype;l public.business_verification_locations%rowtype;q public.business_travel_quotes%rowtype;d double precision;
begin
 select * into s from public.salons where id=p_salon for share;
 if not found or not public.is_marketplace_visible(s.id) or s.is_demo or not (s.service_location_type='mobile' or s.offers_mobile) then raise exception 'TRAVEL_NOT_AVAILABLE';end if;
 if p_customer is not null and not exists(select 1 from public.platform_identities i join auth.users u on u.id=i.user_id where i.user_id=p_customer and i.primary_role='customer' and i.status='Active' and i.email_normalized=lower(trim(u.email))) then raise exception 'TRAVEL_CUSTOMER_REQUIRED';end if;
 if p_email_hash is null or p_email_hash!~'^[0-9a-f]{64}$' or jsonb_typeof(p_address) is distinct from 'object'
  or p_address-array['address_street','address_line2','address_city','address_state','address_zip']<>'{}'
  or not p_address?&array['address_street','address_city','address_state','address_zip']
  or length(p_address::text)>1200 or p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
 then raise exception 'TRAVEL_ADDRESS_INVALID';end if;
 select * into l from public.business_verification_locations where salon_id=s.id for share;
 if not found or l.geocode_status is distinct from 'success' or l.latitude is null or l.longitude is null or s.travel_radius_miles is null then raise exception 'TRAVEL_NOT_AVAILABLE';end if;
 d:=public.distance_miles(p_lat,p_lng,l.latitude,l.longitude);
 if d>s.travel_radius_miles then raise exception 'TRAVEL_OUTSIDE_RADIUS';end if;
 insert into public.business_travel_quotes(salon_id,customer_id,email_hash,address,location_revision,origin_fingerprint,fee_cents,distance_miles)
 values(s.id,p_customer,p_email_hash,p_address,s.location_settings_revision,md5(concat_ws('|',l.latitude,l.longitude,l.address_fingerprint)),s.travel_fee_cents,d)
 returning * into q;
 -- Never return the business's hidden location, fingerprint or exact distance.
 return jsonb_build_object('id',q.id,'address',q.address,'fee_cents',q.fee_cents,'expires_at',q.expires_at);
end $$;
revoke all on function public.create_business_travel_quote(uuid,uuid,text,jsonb,double precision,double precision) from public,anon,authenticated;
grant execute on function public.create_business_travel_quote(uuid,uuid,text,jsonb,double precision,double precision) to service_role;

create function public.attach_business_travel_quote() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare s public.salons%rowtype;l public.business_verification_locations%rowtype;q public.business_travel_quotes%rowtype;
begin
 if TG_OP='UPDATE' then
  if (new.payload->'service_visit_mode',new.payload->'travel_quote_id',new.payload->'travel_fee_cents',new.payload->'service_location_snapshot')
   is distinct from (old.payload->'service_visit_mode',old.payload->'travel_quote_id',old.payload->'travel_fee_cents',old.payload->'service_location_snapshot')
   then raise exception 'TRAVEL_TERMS_IMMUTABLE';end if;
  return new;
 end if;
 select * into s from public.salons where id=new.salon_id for share;
 if s.service_location_type='mobile' and new.payload->>'service_visit_mode' is distinct from 'mobile' then raise exception 'TRAVEL_ADDRESS_REQUIRED';end if;
 if new.payload->>'service_visit_mode'='mobile' then
  if s.is_demo or not(s.service_location_type='mobile' or s.offers_mobile) then raise exception 'TRAVEL_NOT_AVAILABLE';end if;
  select * into q from public.business_travel_quotes where id=(new.payload->>'travel_quote_id')::uuid and salon_id=s.id for update;
  if not found or q.expires_at<=now() or q.intent_id is not null then raise exception 'TRAVEL_QUOTE_EXPIRED';end if;
  if q.customer_id is distinct from nullif(new.payload->>'customer_id','')::uuid
   or q.email_hash is distinct from encode(sha256(convert_to(lower(trim(new.payload->>'guest_email')),'UTF8')),'hex')
  then raise exception 'TRAVEL_QUOTE_FORBIDDEN';end if;
  select * into l from public.business_verification_locations where salon_id=s.id for share;
  if q.location_revision<>s.location_settings_revision or q.fee_cents<>s.travel_fee_cents
   or q.origin_fingerprint<>md5(concat_ws('|',l.latitude,l.longitude,l.address_fingerprint))
   or q.distance_miles>s.travel_radius_miles or l.geocode_status is distinct from 'success'
  then raise exception 'TRAVEL_TERMS_CHANGED';end if;
  if (new.payload->>'travel_fee_cents')::integer is distinct from q.fee_cents then raise exception 'TRAVEL_TERMS_CHANGED';end if;
  new.payload:=new.payload||jsonb_build_object('service_location_snapshot',jsonb_build_object(
   'mode','mobile','address',q.address,'travel_fee_cents',q.fee_cents,'quote_id',q.id,'reviewed_at',now()));
  update public.business_travel_quotes set intent_id=new.id where id=q.id;
 elsif new.payload ? 'travel_quote_id' or coalesce((new.payload->>'travel_fee_cents')::integer,0)<>0 or new.payload ? 'service_location_snapshot' then
  raise exception 'TRAVEL_NOT_AVAILABLE';
 end if;
 return new;
end $$;
revoke all on function public.attach_business_travel_quote() from public,anon,authenticated;
create trigger attach_business_travel_quote before insert or update on public.booking_checkout_intents for each row execute function public.attach_business_travel_quote();

alter table public.bookings add column service_location_snapshot jsonb;
create function public.preserve_booking_service_location() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare payload jsonb;
begin
 if TG_OP='UPDATE' then
  if new.service_location_snapshot is distinct from old.service_location_snapshot then raise exception 'BOOKING_LOCATION_IMMUTABLE';end if;
  return new;
 end if;
 if new.origin_checkout_intent_id is not null then
  select i.payload into payload from public.booking_checkout_intents i where i.id=new.origin_checkout_intent_id and i.salon_id=new.salon_id;
  new.service_location_snapshot:=payload->'service_location_snapshot';
 elsif new.service_location_snapshot is not null then raise exception 'BOOKING_LOCATION_INVALID';end if;
 return new;
end $$;
revoke all on function public.preserve_booking_service_location() from public,anon,authenticated;
create trigger preserve_booking_service_location before insert or update on public.bookings for each row execute function public.preserve_booking_service_location();
create or replace function public.confirmed_business_booking_location(p_booking uuid,p_customer uuid,p_guest_token uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype;s public.salons%rowtype;l public.business_verification_locations%rowtype;confirmed boolean;
begin
 select * into b from public.bookings where id=p_booking;
 if not found then raise insufficient_privilege using message='BOOKING_LOCATION_FORBIDDEN';end if;
 if p_guest_token is not null then
  if not exists(select 1 from public.booking_guest_access_tokens where id=p_guest_token and booking_id=b.id and purpose='manage' and revoked_at is null and expires_at>now()) then raise insufficient_privilege using message='BOOKING_LOCATION_FORBIDDEN';end if;
 elsif p_customer is null or b.customer_id is distinct from p_customer or not exists(select 1 from public.platform_identities i join auth.users u on u.id=i.user_id where i.user_id=p_customer and i.primary_role='customer' and i.status='Active' and i.email_normalized=lower(trim(u.email))) then raise insufficient_privilege using message='BOOKING_LOCATION_FORBIDDEN';end if;
 select * into s from public.salons where id=b.salon_id;
 confirmed:=lower(regexp_replace(b.status,'[ _-]','','g')) in ('confirmed','arrivingsoon','arrived','inprogress','completed');
 if b.service_location_snapshot->>'mode'='mobile' and confirmed then
  return (b.service_location_snapshot->'address')||jsonb_build_object('location_type','mobile','travel_fee_cents',b.service_location_snapshot->'travel_fee_cents','revealed_after_confirmation',false);
 end if;
 if s.service_location_type='home' and not s.home_address_public and confirmed then
  select * into l from public.business_verification_locations where salon_id=b.salon_id;
  return jsonb_build_object('location_type','home','address_street',l.address_street,'address_line2',l.address_line2,'address_city',l.address_city,'address_state',l.address_state,'address_zip',l.address_zip,'revealed_after_confirmation',true);
 end if;
 return jsonb_build_object('location_type',coalesce(s.service_location_type,'storefront'),'address_street',s.address_street,'address_line2',s.address_line2,'address_city',s.address_city,'address_state',s.address_state,'address_zip',s.address_zip,'public_neighborhood',s.public_neighborhood,'travel_radius_miles',s.travel_radius_miles,'revealed_after_confirmation',false);
end $$;

-- The durable booking terms remain on the intent/booking; short-lived quote
-- duplicates and abandoned customer addresses do not need indefinite retention.
create function public.expire_business_travel_quotes() returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare removed integer;
begin
 delete from public.business_travel_quotes where id in
  (select id from public.business_travel_quotes where expires_at<now()-interval '1 day' order by expires_at limit 1000 for update skip locked);
 get diagnostics removed=row_count;return removed;
end $$;
revoke all on function public.expire_business_travel_quotes() from public,anon,authenticated;
grant execute on function public.expire_business_travel_quotes() to service_role;
update public.engine_settings set published_value='"20260923090918"'::jsonb,draft_value='"20260923090918"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
