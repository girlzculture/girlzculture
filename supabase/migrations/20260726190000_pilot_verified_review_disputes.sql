begin;

alter table public.reviews
  add column if not exists display_name text,
  add column if not exists dispute_reason text,
  add column if not exists disputed_at timestamptz,
  add column if not exists disputed_by_user_id uuid references auth.users(id) on delete set null;

alter table public.reviews drop constraint if exists reviews_display_name_check;
alter table public.reviews add constraint reviews_display_name_check
  check(display_name is null or length(trim(display_name)) between 1 and 60);

create table if not exists public.review_dispute_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  action text not null check(action in ('disputed','resolved','hidden','restored')),
  reason text not null check(length(trim(reason)) between 10 and 1000),
  actor_role text not null check(actor_role in ('salon_owner','salon_team','admin')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists review_dispute_events_review_created_idx
  on public.review_dispute_events(review_id,created_at desc);

alter table public.review_dispute_events enable row level security;

drop policy if exists reviews_public_read on public.reviews;
create policy reviews_public_read on public.reviews
  for select to anon,authenticated
  using(
    (
      moderation_status='Published'
      and coalesce(dispute_status,'None')<>'Removed'
      and public.is_marketplace_visible(salon_id)
    )
    or public.is_admin()
  );

drop policy if exists review_dispute_events_admin_read on public.review_dispute_events;
create policy review_dispute_events_admin_read
  on public.review_dispute_events for select to authenticated
  using(public.admin_has_permission('reviews'));

drop policy if exists review_dispute_events_salon_read on public.review_dispute_events;
create policy review_dispute_events_salon_read
  on public.review_dispute_events for select to authenticated
  using(public.salon_has_permission(salon_id,'reviews'));

drop policy if exists review_dispute_events_service_write on public.review_dispute_events;
create policy review_dispute_events_service_write
  on public.review_dispute_events for all to service_role
  using(true) with check(true);

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
    or new.display_name is distinct from old.display_name
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

drop function if exists public.submit_verified_guest_review(
  text,integer,integer,integer,integer,integer,boolean,text,jsonb
);

create or replace function public.submit_verified_guest_review(
  p_token_hash text,
  p_display_name text,
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
  v_display_name text := trim(coalesce(p_display_name,''));
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
  if length(v_display_name) not between 1 and 60
    or p_rating_overall not between 1 and 5
    or p_rating_price_accuracy not between 1 and 5
    or p_rating_punctuality not between 1 and 5
    or p_rating_quality not between 1 and 5
    or p_rating_cleanliness not between 1 and 5
    or length(trim(coalesce(p_written_review,''))) not between 10 and 3000 then
    raise exception using errcode='22023',message='REVIEW_INPUT_INVALID';
  end if;
  insert into public.reviews(
    booking_id,customer_id,salon_id,stylist_id,display_name,rating_overall,
    rating_price_accuracy,rating_punctuality,rating_quality,
    rating_cleanliness,would_return,written_review,result_photos
  ) values (
    v_booking.id,v_booking.customer_id,v_booking.salon_id,v_booking.stylist_id,
    left(v_display_name,60),p_rating_overall,p_rating_price_accuracy,
    p_rating_punctuality,p_rating_quality,p_rating_cleanliness,p_would_return,
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

drop function if exists public.dispute_review(uuid);

create or replace function public.dispute_review(
  target_review_id uuid,
  dispute_reason text
)
returns boolean
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_review public.reviews%rowtype;
  v_reason text := trim(coalesce(dispute_reason,''));
  v_role text;
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED';
  end if;
  if length(v_reason) not between 10 and 1000 then
    raise exception using errcode='22023',message='REVIEW_DISPUTE_REASON_INVALID';
  end if;
  select * into v_review from public.reviews where id=target_review_id for update;
  if not found then return false; end if;
  if public.admin_has_permission('reviews') then
    v_role := 'admin';
  elsif public.salon_has_permission(v_review.salon_id,'reviews') then
    v_role := case when exists(
      select 1 from public.salons
      where id=v_review.salon_id and user_id=auth.uid()
    ) then 'salon_owner' else 'salon_team' end;
  else
    raise exception using errcode='42501',message='REVIEW_DISPUTE_FORBIDDEN';
  end if;
  update public.reviews
  set dispute_status='Disputed',
      dispute_reason=v_reason,
      disputed_at=now(),
      disputed_by_user_id=auth.uid()
  where id=target_review_id;
  insert into public.review_dispute_events(
    review_id,booking_id,salon_id,action,reason,actor_role,actor_user_id
  ) values (
    v_review.id,v_review.booking_id,v_review.salon_id,'disputed',
    v_reason,v_role,auth.uid()
  );
  return true;
end;
$$;

create or replace function public.admin_moderate_review(
  target_review_id uuid,
  moderation_action text,
  moderation_reason text,
  acting_admin_id uuid
)
returns public.reviews
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_review public.reviews%rowtype;
  v_action text := lower(trim(coalesce(moderation_action,'')));
  v_reason text := trim(coalesce(moderation_reason,''));
begin
  if not exists(
    select 1 from public.admin_users admin_user
    where coalesce(admin_user.user_id,admin_user.id)=acting_admin_id
      and lower(coalesce(admin_user.status,'active'))='active'
      and (
        coalesce(admin_user.is_super_admin,false)
        or coalesce((admin_user.permissions->>'reviews')::boolean,false)
      )
  ) then
    raise exception using errcode='42501',message='REVIEW_MODERATION_FORBIDDEN';
  end if;
  if v_action not in ('hidden','restored','resolved') then
    raise exception using errcode='22023',message='REVIEW_MODERATION_ACTION_INVALID';
  end if;
  if length(v_reason) not between 10 and 1000 then
    raise exception using errcode='22023',message='REVIEW_MODERATION_REASON_INVALID';
  end if;
  select * into v_review from public.reviews where id=target_review_id for update;
  if not found then
    raise exception using errcode='P0002',message='REVIEW_NOT_FOUND';
  end if;
  update public.reviews
  set moderation_status=case when v_action='hidden' then 'Hidden' else 'Published' end,
      dispute_status=case when v_action='hidden' then 'Removed' else 'Resolved' end,
      moderation_reason=v_reason,
      moderated_by=acting_admin_id,
      moderated_at=now()
  where id=target_review_id
  returning * into v_review;
  insert into public.review_dispute_events(
    review_id,booking_id,salon_id,action,reason,actor_role,actor_user_id
  ) values (
    v_review.id,v_review.booking_id,v_review.salon_id,v_action,
    v_reason,'admin',acting_admin_id
  );
  insert into public.review_moderation_events(
    review_id,action,actor_role,actor_user_id,reason
  ) values (
    v_review.id,
    case when v_action='hidden' then 'hidden' else 'restored' end,
    'admin',acting_admin_id,v_reason
  );
  return v_review;
end;
$$;

revoke all on table public.review_dispute_events from public,anon;
revoke all on function public.submit_verified_guest_review(
  text,text,integer,integer,integer,integer,integer,boolean,text,jsonb
) from public,anon,authenticated;
grant execute on function public.submit_verified_guest_review(
  text,text,integer,integer,integer,integer,integer,boolean,text,jsonb
) to service_role;
revoke all on function public.dispute_review(uuid,text) from public,anon;
grant execute on function public.dispute_review(uuid,text) to authenticated;
revoke all on function public.admin_moderate_review(uuid,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.admin_moderate_review(uuid,text,text,uuid)
  to service_role;

comment on table public.review_dispute_events is
  'Immutable evidence trail for salon review disputes and administrator moderation.';
comment on column public.reviews.display_name is
  'Customer-selected public first name or display name; booking identity remains private.';

update public.engine_settings
set draft_value='"20260726190000"'::jsonb,
    published_value='"20260726190000"'::jsonb,
    status='Published',
    updated_at=now()
where setting_key='integrations.expected_migration';

commit;
