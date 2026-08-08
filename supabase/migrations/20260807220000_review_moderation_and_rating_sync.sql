begin;

-- Reviews are rendered only by server-authorized routes using explicit public
-- projections. Browser table access would expose booking/customer identifiers
-- and moderation metadata even when row filtering is correct, so remove the
-- historical public SELECT policy and all browser table privileges. Owner and
-- admin workspaces also use server-authorized routes.
drop policy if exists reviews_public_read on public.reviews;

drop policy if exists reviews_admin_update on public.reviews;
drop policy if exists reviews_admin_delete on public.reviews;
revoke all on table public.reviews from public,anon,authenticated;
grant all on table public.reviews to service_role;

-- Review updates and the derived salon rating/count change in the same
-- transaction. The owner dashboard listens to the owner-readable salon summary
-- row, so the private reviews table itself does not need Realtime publication.
do $$
begin
  if exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='reviews'
  ) then
    alter publication supabase_realtime drop table public.reviews;
  end if;
end
$$;
do $$
begin
  alter publication supabase_realtime add table public.salons;
exception when duplicate_object then null;
end
$$;

-- A provider-flagged review still contributes its verified rating. Only the
-- uncertain customer-authored text is held outside public/owner surfaces until
-- an authorized platform moderator makes an audited decision.
create table if not exists public.review_content_moderation_queue (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews(id) on delete cascade,
  submitted_display_name text not null check(length(trim(submitted_display_name)) between 1 and 40),
  submitted_review_title text,
  submitted_written_review text,
  status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')),
  detection_reason text,
  detection_source text not null default 'provider' check(detection_source in ('provider','system')),
  decision_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(submitted_review_title is null or length(trim(submitted_review_title)) between 1 and 100),
  check(submitted_written_review is null or length(trim(submitted_written_review)) between 10 and 3000)
);

create index if not exists review_content_moderation_queue_status_idx
  on public.review_content_moderation_queue(status,created_at desc);

alter table public.review_content_moderation_queue enable row level security;
drop policy if exists review_content_moderation_queue_admin_read on public.review_content_moderation_queue;
create policy review_content_moderation_queue_admin_read
  on public.review_content_moderation_queue for select to authenticated
  using(public.admin_has_permission('reviews'));
drop policy if exists review_content_moderation_queue_service_all on public.review_content_moderation_queue;
create policy review_content_moderation_queue_service_all
  on public.review_content_moderation_queue for all to service_role
  using(true) with check(true);
revoke all on table public.review_content_moderation_queue from public,anon,authenticated;
grant select on table public.review_content_moderation_queue to authenticated;
grant all on table public.review_content_moderation_queue to service_role;

alter table public.review_moderation_events
  drop constraint if exists review_moderation_events_action_check;
alter table public.review_moderation_events
  add constraint review_moderation_events_action_check
  check(action in ('submitted','hidden','restored','flagged','content_pending','content_approved','content_rejected','reply_pending','reply_published','reply_approved','reply_rejected')) not valid;
alter table public.review_moderation_events
  drop constraint if exists review_moderation_events_actor_role_check;
alter table public.review_moderation_events
  add constraint review_moderation_events_actor_role_check
  check(actor_role in ('guest','customer','admin','system','salon_owner','salon_team')) not valid;
alter table public.review_moderation_events
  validate constraint review_moderation_events_action_check;
alter table public.review_moderation_events
  validate constraint review_moderation_events_actor_role_check;

create table if not exists public.review_reply_moderation_queue (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews(id) on delete cascade,
  submitted_reply text not null check(length(trim(submitted_reply)) between 1 and 2000),
  status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')),
  detection_reason text,
  detection_source text not null default 'provider' check(detection_source in ('provider','system')),
  submitted_by uuid references auth.users(id) on delete set null,
  decision_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Keep queued moderation evidence when an employee account is removed. The
-- actor UUID is useful while the account exists, but identity deletion must not
-- delete or strand the review workflow.
alter table public.review_reply_moderation_queue
  alter column submitted_by drop not null;
alter table public.review_reply_moderation_queue
  drop constraint if exists review_reply_moderation_queue_submitted_by_fkey;
alter table public.review_reply_moderation_queue
  add constraint review_reply_moderation_queue_submitted_by_fkey
  foreign key(submitted_by) references auth.users(id) on delete set null not valid;
alter table public.review_reply_moderation_queue
  validate constraint review_reply_moderation_queue_submitted_by_fkey;
create index if not exists review_reply_moderation_queue_status_idx
  on public.review_reply_moderation_queue(status,created_at desc);
alter table public.review_reply_moderation_queue enable row level security;
drop policy if exists review_reply_moderation_queue_admin_read on public.review_reply_moderation_queue;
create policy review_reply_moderation_queue_admin_read
  on public.review_reply_moderation_queue for select to authenticated
  using(public.admin_has_permission('reviews'));
drop policy if exists review_reply_moderation_queue_service_all on public.review_reply_moderation_queue;
create policy review_reply_moderation_queue_service_all
  on public.review_reply_moderation_queue for all to service_role
  using(true) with check(true);
revoke all on table public.review_reply_moderation_queue from public,anon,authenticated;
grant select on table public.review_reply_moderation_queue to authenticated;
grant all on table public.review_reply_moderation_queue to service_role;

-- Customer ratings and original clear content remain immutable. The sole
-- exception is promotion of an exact, already-approved queue record by the
-- guarded service-role RPC below.
create or replace function public.protect_customer_review_content()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_approved_content boolean := false;
begin
  if new.display_name is distinct from old.display_name
    or new.review_title is distinct from old.review_title
    or new.written_review is distinct from old.written_review then
    select exists(
      select 1
      from public.review_content_moderation_queue queue
      where queue.review_id=old.id
        and queue.status='Approved'
        and old.display_name='Verified Client'
        and old.review_title is null
        and old.written_review is null
        and new.display_name=queue.submitted_display_name
        and new.review_title is not distinct from queue.submitted_review_title
        and new.written_review is not distinct from queue.submitted_written_review
    ) into v_approved_content;
    if not v_approved_content then
      raise exception using errcode='42501',message='REVIEW_CUSTOMER_CONTENT_IMMUTABLE';
    end if;
  end if;
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

-- All review creation now passes through the server-only verified-link RPC so
-- eligibility, immutability, moderation, and one-review-per-booking checks are
-- atomic. Remove the older direct authenticated INSERT path entirely.
drop policy if exists reviews_customer_insert on public.reviews;
revoke insert on table public.reviews from public,anon,authenticated;
grant all on table public.reviews to service_role;

-- The legacy authenticated reply RPC bypasses the content-moderation queue.
-- Keep its definition only for migration compatibility, but make it unusable
-- by public clients and route all replies through submit_salon_review_reply.
revoke all on function public.reply_to_review(uuid,text)
  from public,anon,authenticated;

drop function if exists public.submit_verified_guest_review(
  text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb
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
  p_result_photos jsonb default '[]'::jsonb,
  p_content_moderation_status text default 'Clear',
  p_pending_reason text default null,
  p_pending_source text default null
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
  v_written_review text := nullif(trim(coalesce(p_written_review,'')), '');
  v_content_status text := initcap(lower(trim(coalesce(p_content_moderation_status,'Clear'))));
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='REVIEW_LINK_INVALID';
  end if;
  if v_content_status not in ('Clear','Pending') then
    raise exception using errcode='22023',message='REVIEW_MODERATION_STATE_INVALID';
  end if;
  select * into v_link from public.booking_review_links
    where token_hash=p_token_hash for update;
  if not found or v_link.expires_at<=now() or v_link.used_at is not null then
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
    or (v_review_title is not null and length(v_review_title)>100)
    or (v_written_review is not null and length(v_written_review) not between 10 and 3000)
    or p_rating_overall not between 1 and 5
    or p_rating_price_accuracy not between 1 and 5
    or p_rating_punctuality not between 1 and 5
    or p_rating_quality not between 1 and 5
    or p_rating_cleanliness not between 1 and 5 then
    raise exception using errcode='22023',message='REVIEW_INPUT_INVALID';
  end if;
  insert into public.reviews(
    booking_id,customer_id,salon_id,stylist_id,display_name,review_title,rating_overall,
    rating_price_accuracy,rating_punctuality,rating_quality,rating_cleanliness,
    would_return,written_review,result_photos,moderation_status
  ) values (
    v_booking.id,v_booking.customer_id,v_booking.salon_id,v_booking.stylist_id,
    case when v_content_status='Pending' then 'Verified Client' else v_display_name end,
    case when v_content_status='Pending' then null else v_review_title end,
    p_rating_overall,p_rating_price_accuracy,p_rating_punctuality,p_rating_quality,
    p_rating_cleanliness,p_would_return,
    case when v_content_status='Pending' then null else v_written_review end,
    coalesce(p_result_photos,'[]'::jsonb),'Published'
  ) returning * into v_review;
  if v_content_status='Pending' then
    insert into public.review_content_moderation_queue(
      review_id,submitted_display_name,submitted_review_title,
      submitted_written_review,detection_reason,detection_source
    ) values (
      v_review.id,v_display_name,v_review_title,v_written_review,
      left(nullif(trim(coalesce(p_pending_reason,'')),''),500),
      case when lower(coalesce(p_pending_source,''))='system' then 'system' else 'provider' end
    );
  end if;
  update public.booking_review_links set used_at=now(),updated_at=now() where id=v_link.id;
  insert into public.review_moderation_events(review_id,action,actor_role,reason)
    values(
      v_review.id,
      case when v_content_status='Pending' then 'content_pending' else 'submitted' end,
      case when v_booking.customer_id is null then 'guest' else 'customer' end,
      case when v_content_status='Pending' then 'Written content held for human moderation; verified rating published.' else null end
    );
  return v_review;
exception when unique_violation then
  select * into v_review from public.reviews where booking_id=v_link.booking_id;
  return v_review;
end;
$$;

revoke all on function public.submit_verified_guest_review(
  text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb,text,text,text
) from public,anon,authenticated;
grant execute on function public.submit_verified_guest_review(
  text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb,text,text,text
) to service_role;

create or replace function public.admin_moderate_review_content(
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
  v_queue public.review_content_moderation_queue%rowtype;
  v_action text := lower(trim(coalesce(moderation_action,'')));
  v_reason text := trim(coalesce(moderation_reason,''));
begin
  if not exists(
    select 1 from public.admin_users admin_user
    where coalesce(admin_user.user_id,admin_user.id)=acting_admin_id
      and lower(coalesce(admin_user.status,'active'))='active'
      and (coalesce(admin_user.is_super_admin,false)
        or coalesce((admin_user.permissions->>'reviews')::boolean,false))
  ) then
    raise exception using errcode='42501',message='REVIEW_MODERATION_FORBIDDEN';
  end if;
  if v_action not in ('approve_content','reject_content') then
    raise exception using errcode='22023',message='REVIEW_MODERATION_ACTION_INVALID';
  end if;
  if length(v_reason) not between 10 and 1000 then
    raise exception using errcode='22023',message='REVIEW_MODERATION_REASON_INVALID';
  end if;
  -- Use the same parent-review -> child-queue lock order as review/reply
  -- submission and moderation. This prevents review deletion or competing
  -- moderation from acquiring the same records in the opposite order.
  select * into v_review from public.reviews
    where id=target_review_id for update;
  if not found then raise exception using errcode='P0002',message='REVIEW_NOT_FOUND'; end if;
  select * into v_queue from public.review_content_moderation_queue
    where review_id=target_review_id for update;
  if not found then raise exception using errcode='P0002',message='REVIEW_CONTENT_QUEUE_NOT_FOUND'; end if;
  if v_queue.status<>'Pending' then
    raise exception using errcode='23514',message='REVIEW_CONTENT_ALREADY_MODERATED';
  end if;
  update public.review_content_moderation_queue
  set status=case when v_action='approve_content' then 'Approved' else 'Rejected' end,
      decision_reason=v_reason,reviewed_by=acting_admin_id,reviewed_at=now(),updated_at=now()
  where review_id=target_review_id
  returning * into v_queue;
  if v_action='approve_content' then
    update public.reviews
    set display_name=v_queue.submitted_display_name,
        review_title=v_queue.submitted_review_title,
        written_review=v_queue.submitted_written_review
    where id=target_review_id
    returning * into v_review;
  end if;
  insert into public.review_moderation_events(review_id,action,actor_role,actor_user_id,reason)
  values(v_review.id,case when v_action='approve_content' then 'content_approved' else 'content_rejected' end,'admin',acting_admin_id,v_reason);
  return v_review;
end;
$$;

revoke all on function public.admin_moderate_review_content(uuid,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.admin_moderate_review_content(uuid,text,text,uuid)
  to service_role;

create or replace function public.submit_salon_review_reply(
  target_review_id uuid,
  reply_text text,
  content_moderation_status text,
  detection_reason text,
  detection_source text,
  acting_user_id uuid
)
returns public.reviews
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_review public.reviews%rowtype;
  v_reply text := trim(coalesce(reply_text,''));
  v_status text := initcap(lower(trim(coalesce(content_moderation_status,'Clear'))));
  v_actor_role text;
  v_queue_status text;
begin
  if length(v_reply) not between 1 and 2000 or v_status not in ('Clear','Pending') then
    raise exception using errcode='22023',message='REVIEW_REPLY_INPUT_INVALID';
  end if;
  select * into v_review from public.reviews where id=target_review_id for update;
  if not found then raise exception using errcode='P0002',message='REVIEW_NOT_FOUND'; end if;
  if exists(select 1 from public.salons where id=v_review.salon_id and user_id=acting_user_id) then
    v_actor_role:='salon_owner';
  elsif exists(
    select 1 from public.salon_team_members member
    where member.salon_id=v_review.salon_id and member.user_id=acting_user_id
      and member.status='Active'
      and coalesce((member.permissions->>'reviews')::boolean,false)
  ) then
    v_actor_role:='salon_team';
  else
    raise exception using errcode='42501',message='REVIEW_REPLY_FORBIDDEN';
  end if;
  if v_review.moderation_status<>'Published' or coalesce(v_review.dispute_status,'None')='Removed' then
    raise exception using errcode='23514',message='REVIEW_REPLY_NOT_VISIBLE';
  end if;
  if v_review.salon_reply is not null then
    raise exception using errcode='23514',message='REVIEW_REPLY_ALREADY_EXISTS';
  end if;
  -- Always inspect/lock a pre-existing queue row after locking the review.
  -- A later clear retry must supersede a pending provider-held version before
  -- publication, otherwise an admin could approve stale text afterward.
  select status into v_queue_status from public.review_reply_moderation_queue
    where review_id=v_review.id for update;
  if v_status='Clear' then
    if v_queue_status='Pending' then
      update public.review_reply_moderation_queue
      set status='Rejected',
          decision_reason='Superseded by a later clear salon reply.',
          reviewed_by=null,
          reviewed_at=now(),
          updated_at=now()
      where review_id=v_review.id and status='Pending';
      insert into public.review_moderation_events(review_id,action,actor_role,reason)
      values(
        v_review.id,'reply_rejected','system',
        'Pending salon reply superseded by a later clear publication.'
      );
    end if;
    update public.reviews set salon_reply=v_reply where id=v_review.id returning * into v_review;
  else
    if v_queue_status='Pending' then
      raise exception using errcode='23514',message='REVIEW_REPLY_PENDING';
    end if;
    insert into public.review_reply_moderation_queue(
      review_id,submitted_reply,detection_reason,detection_source,submitted_by
    ) values(
      v_review.id,v_reply,left(nullif(trim(coalesce(detection_reason,'')),''),500),
      case when lower(coalesce(detection_source,''))='system' then 'system' else 'provider' end,
      acting_user_id
    ) on conflict(review_id) do update
      set submitted_reply=excluded.submitted_reply,
          status='Pending',
          detection_reason=excluded.detection_reason,
          detection_source=excluded.detection_source,
          submitted_by=excluded.submitted_by,
          decision_reason=null,reviewed_by=null,reviewed_at=null,updated_at=now();
  end if;
  insert into public.review_moderation_events(review_id,action,actor_role,actor_user_id,reason)
  values(
    v_review.id,case when v_status='Pending' then 'reply_pending' else 'reply_published' end,
    v_actor_role,acting_user_id,
    case when v_status='Pending' then 'Salon reply held for human moderation.' else null end
  );
  return v_review;
end;
$$;
revoke all on function public.submit_salon_review_reply(uuid,text,text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.submit_salon_review_reply(uuid,text,text,text,text,uuid)
  to service_role;

create or replace function public.admin_moderate_review_reply(
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
  v_queue public.review_reply_moderation_queue%rowtype;
  v_action text := lower(trim(coalesce(moderation_action,'')));
  v_reason text := trim(coalesce(moderation_reason,''));
begin
  if not exists(
    select 1 from public.admin_users admin_user
    where coalesce(admin_user.user_id,admin_user.id)=acting_admin_id
      and lower(coalesce(admin_user.status,'active'))='active'
      and (coalesce(admin_user.is_super_admin,false)
        or coalesce((admin_user.permissions->>'reviews')::boolean,false))
  ) then raise exception using errcode='42501',message='REVIEW_MODERATION_FORBIDDEN'; end if;
  if v_action not in ('approve_reply','reject_reply') then
    raise exception using errcode='22023',message='REVIEW_MODERATION_ACTION_INVALID';
  end if;
  if length(v_reason) not between 10 and 1000 then
    raise exception using errcode='22023',message='REVIEW_MODERATION_REASON_INVALID';
  end if;
  -- Match the salon reply path's review -> queue lock order. Keeping one lock
  -- order prevents a moderator and salon user from deadlocking each other.
  select * into v_review from public.reviews
    where id=target_review_id for update;
  if not found then raise exception using errcode='P0002',message='REVIEW_NOT_FOUND'; end if;
  select * into v_queue from public.review_reply_moderation_queue
    where review_id=target_review_id for update;
  if not found then raise exception using errcode='P0002',message='REVIEW_REPLY_QUEUE_NOT_FOUND'; end if;
  if v_queue.status<>'Pending' then
    raise exception using errcode='23514',message='REVIEW_REPLY_ALREADY_MODERATED';
  end if;
  update public.review_reply_moderation_queue
  set status=case when v_action='approve_reply' then 'Approved' else 'Rejected' end,
      decision_reason=v_reason,reviewed_by=acting_admin_id,reviewed_at=now(),updated_at=now()
  where review_id=target_review_id returning * into v_queue;
  if v_action='approve_reply' then
    update public.reviews set salon_reply=v_queue.submitted_reply
      where id=target_review_id returning * into v_review;
  end if;
  insert into public.review_moderation_events(review_id,action,actor_role,actor_user_id,reason)
  values(v_review.id,case when v_action='approve_reply' then 'reply_approved' else 'reply_rejected' end,'admin',acting_admin_id,v_reason);
  return v_review;
end;
$$;
revoke all on function public.admin_moderate_review_reply(uuid,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.admin_moderate_review_reply(uuid,text,text,uuid)
  to service_role;

-- Ratings are derived solely from visible reviews. A hidden/removed review is
-- excluded immediately and a restored review is included by the same trigger.
create or replace function public.refresh_salon_review_summary()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  affected_salon_id uuid;
  previous_salon_id uuid;
  next_rating numeric;
  next_count integer;
begin
  affected_salon_id:=case when tg_op='DELETE' then old.salon_id else new.salon_id end;
  previous_salon_id:=case when tg_op='UPDATE' then old.salon_id else null end;
  -- Serialize summary refreshes per salon before taking the aggregate snapshot.
  -- Sorting the lock set also prevents cross-salon UPDATE triggers from
  -- acquiring the same two salon rows in opposite orders.
  perform 1 from public.salons
    where id in (affected_salon_id,previous_salon_id)
    order by id
    for no key update;
  select coalesce(avg(rating_overall),0),count(*)::integer into next_rating,next_count
  from public.reviews where salon_id=affected_salon_id
    and moderation_status='Published'
    and coalesce(dispute_status,'None')<>'Removed'
    and archived_at is null;
  update public.salons set rating_overall=round(next_rating,2),review_count=next_count
    where id=affected_salon_id;
  if previous_salon_id is not null and previous_salon_id<>affected_salon_id then
    select coalesce(avg(rating_overall),0),count(*)::integer into next_rating,next_count
    from public.reviews where salon_id=previous_salon_id
      and moderation_status='Published'
      and coalesce(dispute_status,'None')<>'Removed'
      and archived_at is null;
    update public.salons set rating_overall=round(next_rating,2),review_count=next_count
      where id=previous_salon_id;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

-- Reconcile pre-existing summaries deterministically when this trigger logic is
-- introduced. This covers reviews hidden or removed before the trigger was
-- replaced and also resets salons with no currently visible reviews to zero.
with review_summaries as (
  select
    salon.id as salon_id,
    round(coalesce(avg(review.rating_overall) filter(
      where review.moderation_status='Published'
        and coalesce(review.dispute_status,'None')<>'Removed'
        and review.archived_at is null
    ),0),2) as rating_overall,
    count(review.id) filter(
      where review.moderation_status='Published'
        and coalesce(review.dispute_status,'None')<>'Removed'
        and review.archived_at is null
    )::integer as review_count
  from public.salons salon
  left join public.reviews review on review.salon_id=salon.id
  group by salon.id
)
update public.salons salon
set rating_overall=summary.rating_overall,
    review_count=summary.review_count
from review_summaries summary
where salon.id=summary.salon_id
  and (
    salon.rating_overall is distinct from summary.rating_overall
    or salon.review_count is distinct from summary.review_count
  );

-- Reserve every provider delivery before the provider is called. Delivered and
-- skipped rows are terminal, failed rows are retryable, and an abandoned
-- processing row may be reclaimed only after its lease. The unique key and
-- atomic conditional upsert prevent two workers from owning the same attempt.
alter table public.notification_delivery_log
  add column if not exists deduplication_key text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
alter table public.notification_delivery_log
  drop constraint if exists notification_delivery_log_attempt_count_check;
alter table public.notification_delivery_log
  add constraint notification_delivery_log_attempt_count_check
  check(attempt_count>=0) not valid;
alter table public.notification_delivery_log
  validate constraint notification_delivery_log_attempt_count_check;
alter table public.notification_delivery_log
  drop constraint if exists notification_delivery_log_delivery_status_check;
alter table public.notification_delivery_log
  add constraint notification_delivery_log_delivery_status_check
  check(delivery_status in ('processing','delivered','failed','skipped')) not valid;
alter table public.notification_delivery_log
  validate constraint notification_delivery_log_delivery_status_check;
create unique index if not exists notification_delivery_deduplication_idx
  on public.notification_delivery_log(deduplication_key);

create or replace function public.claim_notification_delivery(
  p_booking_id uuid,
  p_event_type text,
  p_recipient_type text,
  p_channel text,
  p_destination text,
  p_deduplication_key text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_delivery_id uuid;
begin
  if p_booking_id is null
    or nullif(trim(coalesce(p_deduplication_key,'')),'') is null
    or length(p_deduplication_key)>240 then
    raise exception using errcode='22023',message='NOTIFICATION_DELIVERY_CLAIM_INVALID';
  end if;
  insert into public.notification_delivery_log as delivery(
    booking_id,recipient_type,channel,destination,event_type,
    delivery_status,deduplication_key,attempt_count,lease_expires_at,updated_at
  ) values(
    p_booking_id,p_recipient_type,p_channel,p_destination,p_event_type,
    'processing',p_deduplication_key,1,now()+interval '15 minutes',now()
  )
  on conflict(deduplication_key) do update
  set destination=excluded.destination,
      delivery_status='processing',
      error_message=null,
      attempt_count=delivery.attempt_count+1,
      lease_expires_at=now()+interval '15 minutes',
      updated_at=now()
  -- A failed attempt may be retried, and an abandoned processing reservation
  -- may be reclaimed after the bounded lease. Delivered/skipped reservations
  -- remain terminal. The unique key plus this atomic conditional update means
  -- only one concurrent worker can acquire a retry.
  where delivery.delivery_status='failed'
     or (
       delivery.delivery_status='processing'
       and coalesce(
         delivery.lease_expires_at,
         delivery.updated_at+interval '15 minutes'
       )<=now()
     )
  returning id into v_delivery_id;
  return v_delivery_id;
end;
$$;
revoke all on function public.claim_notification_delivery(uuid,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.claim_notification_delivery(uuid,text,text,text,text,text)
  to service_role;

comment on table public.review_content_moderation_queue is
  'Private immutable source text for uncertain review content. Verified rating remains public while text awaits an audited admin decision.';
comment on function public.admin_moderate_review_content(uuid,text,text,uuid) is
  'Reviews uncertain written content without allowing salon owners to alter customer ratings or authored text.';

-- The canonical processor already safely resizes animated GIFs. Keep every
-- public image placement and Engine profile aligned with that supported type.
update public.media_upload_profiles profile
set accepted_mime_types=(
  select array_agg(mime order by mime)
  from (
    select distinct unnest(coalesce(profile.accepted_mime_types,array[]::text[]) || array['image/gif']) as mime
  ) supported
);
update storage.buckets bucket
set allowed_mime_types=(
  select array_agg(mime order by mime)
  from (
    select distinct unnest(coalesce(bucket.allowed_mime_types,array[]::text[]) || array['image/gif']) as mime
  ) supported
)
where bucket.id in ('salon-photos','stylist-photos','style-photos','review-photos','content-media','media-originals');

update public.engine_settings
set published_value='"20260807220000"'::jsonb,
    draft_value='"20260807220000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';

commit;
