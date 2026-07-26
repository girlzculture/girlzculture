begin;

alter table public.reviews
  alter column customer_id drop not null,
  add column if not exists moderation_status text not null default 'Published',
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_reason text;

alter table public.reviews drop constraint if exists reviews_moderation_status_check;
alter table public.reviews add constraint reviews_moderation_status_check
  check(moderation_status in ('Published','Hidden','Under review'));

create unique index if not exists reviews_one_per_booking_idx
  on public.reviews(booking_id);

create table if not exists public.booking_review_links (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  first_opened_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_review_links_expiry_idx
  on public.booking_review_links(expires_at)
  where used_at is null;

create table if not exists public.review_moderation_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  action text not null check(action in ('submitted','hidden','restored','flagged')),
  actor_role text not null check(actor_role in ('guest','customer','admin','system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists review_moderation_events_review_idx
  on public.review_moderation_events(review_id,created_at desc);

alter table public.booking_review_links enable row level security;
alter table public.review_moderation_events enable row level security;

drop policy if exists booking_review_links_service_only on public.booking_review_links;
create policy booking_review_links_service_only on public.booking_review_links
  for all to service_role using(true) with check(true);

drop policy if exists review_moderation_events_admin_read on public.review_moderation_events;
create policy review_moderation_events_admin_read on public.review_moderation_events
  for select to authenticated using(public.is_admin());
drop policy if exists review_moderation_events_service_write on public.review_moderation_events;
create policy review_moderation_events_service_write on public.review_moderation_events
  for insert to service_role with check(true);

create or replace function public.protect_customer_review_content()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.booking_id is distinct from old.booking_id
    or new.customer_id is distinct from old.customer_id
    or new.salon_id is distinct from old.salon_id
    or new.stylist_id is distinct from old.stylist_id
    or new.rating_overall is distinct from old.rating_overall
    or new.rating_price_accuracy is distinct from old.rating_price_accuracy
    or new.rating_punctuality is distinct from old.rating_punctuality
    or new.rating_quality is distinct from old.rating_quality
    or new.rating_cleanliness is distinct from old.rating_cleanliness
    or new.would_return is distinct from old.would_return
    or new.written_review is distinct from old.written_review
    or new.result_photos is distinct from old.result_photos then
    raise exception using errcode='42501',message='REVIEW_CUSTOMER_CONTENT_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_protect_customer_content on public.reviews;
create trigger reviews_protect_customer_content
before update on public.reviews
for each row execute function public.protect_customer_review_content();

create or replace function public.submit_verified_guest_review(
  p_token_hash text,
  p_rating_overall integer,
  p_rating_price_accuracy integer,
  p_rating_punctuality integer,
  p_rating_quality integer,
  p_rating_cleanliness integer,
  p_would_return boolean,
  p_written_review text,
  p_result_photos jsonb default '[]'::jsonb
)
returns public.reviews
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_link public.booking_review_links%rowtype;
  v_booking public.bookings%rowtype;
  v_review public.reviews%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='REVIEW_LINK_INVALID';
  end if;
  select * into v_link from public.booking_review_links
    where token_hash=p_token_hash for update;
  if not found or v_link.expires_at<=now() then
    raise exception using errcode='22023',message='REVIEW_LINK_INVALID_OR_EXPIRED';
  end if;
  select * into v_booking from public.bookings
    where id=v_link.booking_id for share;
  if not found or v_booking.status<>'Completed'
    or v_booking.cancelled_at is not null
    or lower(coalesce(v_booking.refund_status,'')) in ('pending','succeeded','refunded') then
    raise exception using errcode='23514',message='REVIEW_BOOKING_NOT_ELIGIBLE';
  end if;
  select * into v_review from public.reviews where booking_id=v_booking.id;
  if found then return v_review; end if;
  if p_rating_overall not between 1 and 5
    or p_rating_price_accuracy not between 1 and 5
    or p_rating_punctuality not between 1 and 5
    or p_rating_quality not between 1 and 5
    or p_rating_cleanliness not between 1 and 5
    or length(trim(coalesce(p_written_review,''))) not between 10 and 3000 then
    raise exception using errcode='22023',message='REVIEW_INPUT_INVALID';
  end if;
  insert into public.reviews(
    booking_id,customer_id,salon_id,stylist_id,rating_overall,
    rating_price_accuracy,rating_punctuality,rating_quality,
    rating_cleanliness,would_return,written_review,result_photos
  ) values (
    v_booking.id,v_booking.customer_id,v_booking.salon_id,v_booking.stylist_id,
    p_rating_overall,p_rating_price_accuracy,p_rating_punctuality,
    p_rating_quality,p_rating_cleanliness,p_would_return,
    trim(p_written_review),coalesce(p_result_photos,'[]'::jsonb)
  ) returning * into v_review;
  update public.booking_review_links set used_at=now(),updated_at=now()
    where id=v_link.id;
  insert into public.review_moderation_events(review_id,action,actor_role)
    values(v_review.id,'submitted',
      case when v_booking.customer_id is null then 'guest' else 'customer' end);
  return v_review;
exception when unique_violation then
  select * into v_review from public.reviews where booking_id=v_link.booking_id;
  return v_review;
end;
$$;

revoke all on table public.booking_review_links from public,anon,authenticated;
revoke all on table public.review_moderation_events from public,anon;
revoke all on function public.submit_verified_guest_review(
  text,integer,integer,integer,integer,integer,boolean,text,jsonb
) from public,anon,authenticated;
grant execute on function public.submit_verified_guest_review(
  text,integer,integer,integer,integer,integer,boolean,text,jsonb
) to service_role;

comment on table public.booking_review_links is
  'Hashed, expiring bearer links issued only after an authoritative Completed transition.';
comment on function public.submit_verified_guest_review(
  text,integer,integer,integer,integer,integer,boolean,text,jsonb
) is 'Atomically enforces booking eligibility and exactly one immutable customer review per booking.';

commit;
