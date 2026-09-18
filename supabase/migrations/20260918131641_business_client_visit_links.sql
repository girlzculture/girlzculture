begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- This is an explicit, reversible business record association, never an Auth
-- identity merge. Names/email are not identity evidence. Original cards survive.
create table public.business_client_visit_links (
 id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id) on delete cascade,
 subject_a text not null, subject_b text not null, booking_a uuid not null references public.bookings(id), booking_b uuid not null references public.bookings(id),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), check(subject_a<subject_b),unique(salon_id,subject_a,subject_b)
);
create table public.business_client_link_state (
 salon_id uuid primary key references public.salons(id) on delete cascade, revision integer not null default 0
);
create table public.business_client_link_events (
 id uuid primary key default gen_random_uuid(),salon_id uuid not null references public.salons(id) on delete cascade,
 actor_id uuid not null references auth.users(id),request_id uuid not null,input jsonb not null,result jsonb not null,created_at timestamptz not null default now(),unique(salon_id,actor_id,request_id)
);
alter table public.business_client_visit_links enable row level security;
alter table public.business_client_link_state enable row level security;
alter table public.business_client_link_events enable row level security;
revoke all on public.business_client_visit_links,public.business_client_link_state,public.business_client_link_events from public,anon,authenticated,service_role;

-- Internal only: callers first establish the business and field permissions.
create function public.business_client_linked_subjects(p_salon uuid,p_subject text) returns text[]
language plpgsql security definer set search_path=pg_catalog,public as $$
declare subjects text[];
begin
 with recursive related(subject) as (
  select p_subject union
  select case when l.subject_a=r.subject then l.subject_b else l.subject_a end
  from related r join public.business_client_visit_links l on l.salon_id=p_salon and (l.subject_a=r.subject or l.subject_b=r.subject)
 ) select array_agg(subject order by subject) into subjects from (select subject from related limit 201) bounded;
 if cardinality(subjects)>200 then raise exception 'CLIENT_LINK_LIMIT'; end if;
 return subjects;
end $$;
revoke all on function public.business_client_linked_subjects(uuid,text) from public,anon,authenticated,service_role;

create function public.read_business_client_links(p_salon uuid,p_actor uuid,p_booking uuid,p_search text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare scope jsonb; subjects text[]; links jsonb; candidates jsonb:='[]';
begin
 scope:=public.business_client_scope(p_salon,p_actor,p_booking);
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor) then raise exception 'CLIENT_ACCESS_DENIED'; end if;
 if p_search is null or length(p_search)>120 then raise exception 'CLIENT_INVALID'; end if;
 subjects:=public.business_client_linked_subjects(p_salon,scope->>'subject_key');
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'from_name',coalesce(a.guest_name,ca.name),'from_date',a.appointment_datetime,
  'to_name',coalesce(b.guest_name,cb.name),'to_date',b.appointment_datetime) order by l.created_at),'[]') into links
 from public.business_client_visit_links l join public.bookings a on a.id=l.booking_a and a.salon_id=p_salon
 join public.bookings b on b.id=l.booking_b and b.salon_id=p_salon
 left join public.customers ca on ca.id=a.customer_id left join public.customers cb on cb.id=b.customer_id
 where l.salon_id=p_salon and l.subject_a=any(subjects);
 if length(trim(p_search))>=2 then
  select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.date desc),'[]') into candidates from (
   select b.id booking_id,coalesce(b.guest_name,c.name) name,b.appointment_datetime date,coalesce(b.manual_service_name,s.name) service
   from public.bookings b left join public.customers c on c.id=b.customer_id left join public.styles s on s.id=b.style_id and s.salon_id=p_salon
   where b.salon_id=p_salon and coalesce(b.payment_mode,'live')<>'test'
     and not ((case when b.customer_id is null then 'booking:'||b.id else 'customer:'||b.customer_id end)=any(subjects))
     and (scope->>'customer_id' is null or b.customer_id is null)
     and strpos(lower(coalesce(b.guest_name,c.name,'')),lower(trim(p_search)))>0
   order by b.appointment_datetime desc,b.id limit 20
  ) candidate;
 end if;
 return jsonb_build_object('revision',coalesce((select revision from public.business_client_link_state where salon_id=p_salon),0),'links',links,'candidates',candidates);
end $$;

create function public.change_business_client_link(p_salon uuid,p_actor uuid,p_booking uuid,p_request uuid,p_revision integer,p_action text,p_target uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare scope jsonb; target_scope jsonb; subjects text[]; a text; b text; link_id uuid; rev integer; input jsonb; result jsonb; prior public.business_client_link_events%rowtype;
begin
 perform 1 from public.salons where id=p_salon for update;
 perform 1 from public.platform_identities where user_id=p_actor for share;
 perform 1 from public.bookings where salon_id=p_salon and id in (p_booking,p_target) for share;
 scope:=public.business_client_scope(p_salon,p_actor,p_booking);
 if not exists(select 1 from public.salons where id=p_salon and user_id=p_actor) then raise exception 'CLIENT_ACCESS_DENIED'; end if;
 if p_request is null or p_target is null or p_revision is null or p_revision<0 or p_action is null or p_action not in ('link','unlink') then raise exception 'CLIENT_INVALID'; end if;
 input:=jsonb_build_object('booking_id',p_booking,'revision',p_revision,'action',p_action,'target',p_target);
 select * into prior from public.business_client_link_events where salon_id=p_salon and actor_id=p_actor and request_id=p_request;
 if found then
  if prior.input<>input then raise exception 'CLIENT_REQUEST_CONFLICT'; end if;
  return prior.result;
 end if;
 insert into public.business_client_link_state(salon_id) values(p_salon) on conflict do nothing;
 select revision into rev from public.business_client_link_state where salon_id=p_salon for update;
 if rev<>p_revision then raise exception 'CLIENT_CHANGED'; end if;
 subjects:=public.business_client_linked_subjects(p_salon,scope->>'subject_key');
 if p_action='link' then
  target_scope:=public.business_client_scope(p_salon,p_actor,p_target);
  -- Do not allow a record association to join two authenticated identities,
  -- directly OR through an intermediate guest group.
  a:=least(scope->>'subject_key',target_scope->>'subject_key'); b:=greatest(scope->>'subject_key',target_scope->>'subject_key');
  if a=b or target_scope->>'subject_key'=any(subjects) then raise exception 'CLIENT_ALREADY_LINKED'; end if;
  if (select count(distinct subject) from unnest(subjects||public.business_client_linked_subjects(p_salon,target_scope->>'subject_key')) subject where subject like 'customer:%')>1 then raise exception 'CLIENT_IDENTITY_CONFLICT'; end if;
  insert into public.business_client_visit_links(salon_id,subject_a,subject_b,booking_a,booking_b,created_by) values(p_salon,a,b,p_booking,p_target,p_actor) returning id into link_id;
  perform public.business_client_linked_subjects(p_salon,a); -- bound the component or roll back
 else
  delete from public.business_client_visit_links where id=p_target and salon_id=p_salon and subject_a=any(subjects) returning id into link_id;
  if link_id is null then raise exception 'CLIENT_NOT_FOUND'; end if;
 end if;
 update public.business_client_link_state set revision=revision+1 where salon_id=p_salon returning revision into rev;
 result:=jsonb_build_object('verified',true,'link_id',link_id,'revision',rev,'action',p_action);
 insert into public.business_client_link_events(salon_id,actor_id,request_id,input,result) values(p_salon,p_actor,p_request,input,result);
 return result;
end $$;
revoke all on function public.read_business_client_links(uuid,uuid,uuid,text),public.change_business_client_link(uuid,uuid,uuid,uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.read_business_client_links(uuid,uuid,uuid,text),public.change_business_client_link(uuid,uuid,uuid,uuid,integer,text,uuid) to service_role;

create or replace function public.read_business_client_card(p_salon uuid,p_actor uuid,p_booking uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare scope jsonb; permissions jsonb; c public.business_client_cards%rowtype; visits jsonb; photos jsonb:='[]'; total integer; spend jsonb; subjects text[]; related jsonb;
begin
  scope:=public.business_client_scope(p_salon,p_actor,p_booking); permissions:=scope->'permissions';
  subjects:=public.business_client_linked_subjects(p_salon,scope->>'subject_key');
  select * into c from public.business_client_cards where salon_id=p_salon and subject_key=scope->>'subject_key';
  with permitted as (
    select b.*,s.name service_name from public.bookings b left join public.styles s on s.id=b.style_id and s.salon_id=p_salon
    where b.salon_id=p_salon and (case when b.customer_id is null then 'booking:'||b.id else 'customer:'||b.customer_id end)=any(subjects)
      and (scope->>'stylist_id' is null or b.stylist_id=(scope->>'stylist_id')::uuid)
      and coalesce(b.payment_mode,'live')<>'test'
  ), excerpt as (select * from permitted order by appointment_datetime desc,id limit 200)
  select (select count(*) from permitted), coalesce(jsonb_agg(jsonb_build_object('booking_id',b.id,'date',b.appointment_datetime,'name',coalesce(b.manual_service_name,b.service_name),
    'status',b.status,'duration_hours',b.duration_hours,'size',b.selected_size,'length',b.selected_length,'options',b.selected_options,
    'formula',case when (permissions->>'client_formulas')::boolean then f.formula else null end,
    'formula_locale',case when (permissions->>'client_formulas')::boolean then f.source_locale else null end,
    'agreed_amount',case when (permissions->>'client_spend')::boolean then b.estimated_total else null end) order by b.appointment_datetime desc,b.id),'[]')
    into total,visits from excerpt b left join public.business_client_formulas f on f.salon_id=p_salon and f.booking_id=b.id;
  if (permissions->>'client_photos')::boolean then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'booking_id',p.booking_id,'caption',p.caption,'source_locale',p.source_locale,'created_at',p.created_at) order by p.created_at desc),'[]') into photos
      from public.business_client_photos p join public.bookings b on b.id=p.booking_id and b.salon_id=p_salon
      where p.salon_id=p_salon and p.card_id in (select id from public.business_client_cards where salon_id=p_salon and subject_key=any(subjects)) and p.removed_at is null and (scope->>'stylist_id' is null or b.stylist_id=(scope->>'stylist_id')::uuid);
  end if;
  if (permissions->>'client_spend')::boolean then
    with permitted as (select b.* from public.bookings b where b.salon_id=p_salon
      and (case when b.customer_id is null then 'booking:'||b.id else 'customer:'||b.customer_id end)=any(subjects)
      and (scope->>'stylist_id' is null or b.stylist_id=(scope->>'stylist_id')::uuid) and coalesce(b.payment_mode,'live')<>'test')
    select jsonb_build_object('completed_agreed_cents',coalesce(sum(case when lower(b.status)='completed' then round(coalesce(b.estimated_total,0)*100) else 0 end),0),
      'recorded_payment_cents',coalesce(sum(case when b.deposit_status='Paid' then round(coalesce(b.deposit_amount,0)*100) else 0 end
        -case when b.refund_completed_at is not null then round(coalesce(b.refund_amount,0)*100) else 0 end
        +coalesce((select sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end) from public.business_finance_receipts r where r.salon_id=p_salon and r.booking_id=b.id),0)),0),
      'currency','USD','basis','linked_bookings_and_recorded_chair_payments','period','all_time') into spend from permitted b;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('card_id',other.id,'booking_id',permitted.id,'date',permitted.appointment_datetime,
    'source_locale',other.source_locale,'field_locales',other.field_locales,
    'preferences',case when (permissions->>'client_notes')::boolean then other.preferences else null end,
    'notes',case when (permissions->>'client_notes')::boolean then other.notes else null end,
    'cautions',case when (permissions->>'client_cautions')::boolean then other.cautions else null end) order by permitted.appointment_datetime desc),'[]') into related
  from public.business_client_cards other cross join lateral (
    select b.id,b.appointment_datetime from public.bookings b where b.salon_id=p_salon
      and (case when b.customer_id is null then 'booking:'||b.id else 'customer:'||b.customer_id end)=other.subject_key
      and (scope->>'stylist_id' is null or b.stylist_id=(scope->>'stylist_id')::uuid)
      and coalesce(b.payment_mode,'live')<>'test' order by b.appointment_datetime desc,b.id limit 1
  ) permitted where other.salon_id=p_salon and other.subject_key=any(subjects) and other.subject_key<>scope->>'subject_key';
  return jsonb_build_object('card_id',c.id,'revision',coalesce(c.revision,0),'booking_id',p_booking,'permissions',permissions,
    'scope',case when scope->>'stylist_id' is null then 'this_business_only' else 'assigned_stylist_only' end,
    'scope_stylist_id',scope->>'stylist_id','source_locale',coalesce(c.source_locale,'en'),
    'field_locales',case when (permissions->>'client_notes')::boolean then jsonb_build_object('preferences',c.field_locales->'preferences','notes',c.field_locales->'notes') else '{}'::jsonb end
      ||case when (permissions->>'client_cautions')::boolean then jsonb_build_object('cautions',c.field_locales->'cautions') else '{}'::jsonb end,
    'preferences',case when (permissions->>'client_notes')::boolean then coalesce(c.preferences,'') else null end,
    'notes',case when (permissions->>'client_notes')::boolean then coalesce(c.notes,'') else null end,
    'cautions',case when (permissions->>'client_cautions')::boolean then coalesce(c.cautions,'') else null end,
    'related_profiles',related,'can_link_visits',exists(select 1 from public.salons where id=p_salon and user_id=p_actor),'visits',visits,'visit_count',total,'capped_at',200,'photos',photos,'spend',spend);
end $$;

create or replace function public.read_business_client_photo(p_salon uuid,p_actor uuid,p_booking uuid,p_photo uuid)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare scope jsonb; path text;
begin
  scope:=public.business_client_scope(p_salon,p_actor,p_booking);
  if not (scope->'permissions'->>'client_photos')::boolean then raise exception 'CLIENT_ACCESS_DENIED'; end if;
  select p.object_path into path from public.business_client_photos p join public.business_client_cards c on c.id=p.card_id and c.salon_id=p_salon
    join public.bookings b on b.id=p.booking_id and b.salon_id=p_salon
    where p.id=p_photo and p.salon_id=p_salon and c.subject_key=any(public.business_client_linked_subjects(p_salon,scope->>'subject_key')) and p.removed_at is null
      and (scope->>'stylist_id' is null or b.stylist_id=(scope->>'stylist_id')::uuid);
  if path is null then raise exception 'CLIENT_NOT_FOUND'; end if;
  return path;
end $$;

update public.engine_settings set published_value='"20260918131641"',draft_value='"20260918131641"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
