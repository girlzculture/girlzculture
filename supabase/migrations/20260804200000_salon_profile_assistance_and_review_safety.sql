begin;

-- Public profile copy is intentionally concise, and any AI help remains an
-- explicitly reviewed draft instead of silently changing salon content.
alter table public.salons
  add column if not exists description_ai_assisted boolean not null default false,
  add column if not exists stylist_section_fallback jsonb not null default '{"mode":"empty"}'::jsonb;

alter table public.reviews
  add column if not exists review_title text;

-- Customer support and safety reports must never be silently discarded when
-- they quote unsafe language. Store a non-secret moderation decision so the
-- administrative queue can prioritize human review.
alter table public.support_tickets
  add column if not exists content_moderation_status text not null default 'Clear',
  add column if not exists content_moderation_reason text,
  add column if not exists content_moderation_source text;

alter table public.complaints_log
  add column if not exists content_moderation_status text not null default 'Clear',
  add column if not exists content_moderation_reason text,
  add column if not exists content_moderation_source text;

alter table public.support_tickets drop constraint if exists support_tickets_content_moderation_status_check;
alter table public.support_tickets add constraint support_tickets_content_moderation_status_check
  check(content_moderation_status in ('Clear','Flagged','Reviewed')) not valid;
alter table public.complaints_log drop constraint if exists complaints_log_content_moderation_status_check;
alter table public.complaints_log add constraint complaints_log_content_moderation_status_check
  check(content_moderation_status in ('Clear','Flagged','Reviewed')) not valid;

create index if not exists support_tickets_moderation_queue_idx
  on public.support_tickets(content_moderation_status,created_at desc)
  where content_moderation_status='Flagged';
create index if not exists complaints_log_moderation_queue_idx
  on public.complaints_log(content_moderation_status,created_at desc)
  where content_moderation_status='Flagged';

alter table public.salons drop constraint if exists salons_stylist_section_fallback_shape;
alter table public.salons add constraint salons_stylist_section_fallback_shape
  check(
    jsonb_typeof(stylist_section_fallback) = 'object'
    and coalesce(stylist_section_fallback->>'mode', 'empty') in ('empty','image','product','promotion')
    and case coalesce(stylist_section_fallback->>'mode', 'empty')
      when 'empty' then true
      when 'image' then coalesce(stylist_section_fallback->>'image_url', '') ~ '^https://'
      when 'product' then coalesce(stylist_section_fallback->>'product_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      when 'promotion' then coalesce(stylist_section_fallback->>'promotion_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      else false
    end
  ) not valid;

alter table public.reviews drop constraint if exists reviews_review_title_check;
alter table public.reviews add constraint reviews_review_title_check
  check(review_title is null or length(trim(review_title)) between 1 and 100) not valid;

create or replace function public.enforce_salon_profile_assistance_controls()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_mode text := coalesce(new.stylist_section_fallback->>'mode', 'empty');
  v_word_count integer := 0;
begin
  if trim(coalesce(new.description, '')) <> '' then
    v_word_count := coalesce(
      array_length(regexp_split_to_array(trim(new.description), E'\\s+'), 1),
      0
    );
  end if;
  if v_word_count > 300 then
    raise exception using errcode='22023', message='SALON_DESCRIPTION_WORD_LIMIT';
  end if;
  if trim(coalesce(new.description, '')) = '' then
    new.description_ai_assisted := false;
  end if;

  -- A plan downgrade must never leave a paid-only public placement visible.
  if v_mode <> 'empty' and public.plan_rank(new.subscription_tier) < 2 then
    if tg_op = 'UPDATE'
      and new.subscription_tier is distinct from old.subscription_tier
      and new.stylist_section_fallback is not distinct from old.stylist_section_fallback then
      new.stylist_section_fallback := '{"mode":"empty"}'::jsonb;
    else
      raise exception using errcode='23514', message='STYLIST_FALLBACK_REQUIRES_GROWTH';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists salons_profile_assistance_controls on public.salons;
create trigger salons_profile_assistance_controls
before insert or update of description,description_ai_assisted,stylist_section_fallback,subscription_tier
on public.salons
for each row execute function public.enforce_salon_profile_assistance_controls();

-- The customer-authored review fields remain immutable after submission.
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
    or new.review_title is distinct from old.review_title
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
  text,text,integer,integer,integer,integer,integer,boolean,text,jsonb
);

create or replace function public.submit_verified_guest_review(
  p_token_hash text,
  p_display_name text,
  p_review_title text,
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
  v_review_title text := nullif(trim(coalesce(p_review_title,'')), '');
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
  if length(v_display_name) not between 1 and 40
    or v_display_name ~ '[[:space:][:digit:][:cntrl:]]'
    or (v_review_title is not null and length(v_review_title) > 100)
    or p_rating_overall not between 1 and 5
    or p_rating_price_accuracy not between 1 and 5
    or p_rating_punctuality not between 1 and 5
    or p_rating_quality not between 1 and 5
    or p_rating_cleanliness not between 1 and 5
    or length(trim(coalesce(p_written_review,''))) not between 10 and 3000 then
    raise exception using errcode='22023',message='REVIEW_INPUT_INVALID';
  end if;
  insert into public.reviews(
    booking_id,customer_id,salon_id,stylist_id,display_name,review_title,rating_overall,
    rating_price_accuracy,rating_punctuality,rating_quality,
    rating_cleanliness,would_return,written_review,result_photos
  ) values (
    v_booking.id,v_booking.customer_id,v_booking.salon_id,v_booking.stylist_id,
    v_display_name,v_review_title,p_rating_overall,p_rating_price_accuracy,
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

revoke all on function public.submit_verified_guest_review(
  text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb
) from public,anon,authenticated;
grant execute on function public.submit_verified_guest_review(
  text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb
) to service_role;

insert into public.engine_settings(
  setting_key,category,display_name,description,value_type,draft_value,
  published_value,status,impact_level,validation,help_text,impact_description,
  is_public,is_secret_status,sort_order,affected_surfaces
) values (
  'owner.image_resizer_resource_url','media','Salon setup image-resizer resource',
  'Optional administrator-approved open-source HTTPS image-resizing resource shown in the salon setup guide.',
  'text','""'::jsonb,'""'::jsonb,'Published','customer',
  '{"maxLength":600,"pattern":"^$|^https://"}'::jsonb,
  'Use only a reviewed open-source HTTPS service with acceptable privacy terms. The built-in uploader remains available.',
  'Changes only the external help link shown in the salon owner setup guide.',
  true,false,75,array['Salon dashboard','Salon setup guide']
)
on conflict(setting_key) do nothing;

update public.ai_automation_features
set human_review_required=true,
    fallback_behavior='manual'
where feature_key='salon_description';

comment on column public.salons.description_ai_assisted is
  'True only when the saved description began from an AI-assisted draft and the owner explicitly saved it.';
comment on column public.salons.stylist_section_fallback is
  'Growth+ salon-page-only replacement shown only when no active stylist profiles are published.';
comment on column public.reviews.review_title is
  'Optional customer-authored review heading, moderated with the public first name and review body.';
comment on function public.submit_verified_guest_review(
  text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb
) is 'Atomically submits one verified review with required first name and optional moderated title.';

update public.engine_settings
set draft_value='"20260804200000"'::jsonb,
    published_value='"20260804200000"'::jsonb,
    status='Published',
    updated_at=now()
where setting_key='integrations.expected_migration';

commit;
