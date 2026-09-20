begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Client identity is derived from an authorized booking at this business. A
-- customer shared with another business never implies a shared client card.
create table public.business_client_cards (
  id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
  subject_key text not null, revision integer not null default 0 check(revision>=0),
  preferences text not null default '' check(length(preferences)<=4000),
  notes text not null default '' check(length(notes)<=4000),
  cautions text not null default '' check(length(cautions)<=4000),
  source_locale text not null default 'en' check(source_locale in ('en','fr','es','zh-CN')),
  field_locales jsonb not null default '{}',
  updated_at timestamptz not null default now(), updated_by uuid not null references auth.users(id),
  unique(salon_id,subject_key), unique(salon_id,id)
);
create table public.business_client_formulas (
  salon_id uuid not null references public.salons(id), card_id uuid not null,
  booking_id uuid not null references public.bookings(id),
  formula jsonb not null default '{}', source_locale text not null,
  updated_at timestamptz not null default now(), updated_by uuid not null references auth.users(id),
  primary key(salon_id,booking_id), foreign key(salon_id,card_id) references public.business_client_cards(salon_id,id)
);
create table public.business_client_photos (
  id uuid primary key, salon_id uuid not null references public.salons(id), card_id uuid not null,
  booking_id uuid not null references public.bookings(id), object_path text not null unique,
  caption text not null default '' check(length(caption)<=300), source_locale text not null,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  removed_at timestamptz, removed_by uuid references auth.users(id), foreign key(salon_id,card_id) references public.business_client_cards(salon_id,id)
);
create index business_client_photos_card on public.business_client_photos(salon_id,card_id) where removed_at is null;
create table public.business_client_events (
  id uuid primary key default gen_random_uuid(), salon_id uuid not null references public.salons(id),
  actor_id uuid not null references auth.users(id), request_id uuid not null,
  booking_id uuid not null references public.bookings(id), card_id uuid not null,
  input jsonb not null, before_values jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(), unique(salon_id,actor_id,request_id),
  foreign key(salon_id,card_id) references public.business_client_cards(salon_id,id)
);
alter table public.business_client_cards enable row level security;
alter table public.business_client_formulas enable row level security;
alter table public.business_client_photos enable row level security;
alter table public.business_client_events enable row level security;
revoke all on public.business_client_cards,public.business_client_formulas,public.business_client_photos,public.business_client_events from public,anon,authenticated,service_role;
-- Even server code uses the guarded projections, not raw private field reads.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('business-client-work','business-client-work',false,10485760,array['image/webp']) on conflict(id) do nothing;

create function public.business_client_scope(p_salon uuid,p_actor uuid,p_booking uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.bookings%rowtype; own boolean; staff_stylist uuid; permissions jsonb:='{}'; k text;
begin
  if not public.p0_actor_has_permission(p_salon,p_actor,'client_history') or not public.p0_business_plan_active(p_salon) then raise exception 'CLIENT_ACCESS_DENIED'; end if;
  own:=exists(select 1 from public.salons where id=p_salon and user_id=p_actor);
  if not own then select stylist_id into staff_stylist from public.salon_team_members where salon_id=p_salon and user_id=p_actor and status='Active'; end if;
  select * into b from public.bookings where salon_id=p_salon and id=p_booking;
  if not found or (staff_stylist is not null and b.stylist_id is distinct from staff_stylist) then raise exception 'CLIENT_NOT_FOUND'; end if;
  foreach k in array array['client_history','client_formulas','client_notes','client_cautions','client_photos','client_spend','client_edit'] loop
    permissions:=permissions||jsonb_build_object(k,public.p0_actor_has_permission(p_salon,p_actor,k));
  end loop;
  return jsonb_build_object('subject_key',case when b.customer_id is not null then 'customer:'||b.customer_id else 'booking:'||b.id end,
    'customer_id',b.customer_id,'stylist_id',staff_stylist,'permissions',permissions);
end $$;

create function public.read_business_client_card(p_salon uuid,p_actor uuid,p_booking uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare scope jsonb; permissions jsonb; c public.business_client_cards%rowtype; visits jsonb; photos jsonb:='[]'; total integer; spend jsonb;
begin
  scope:=public.business_client_scope(p_salon,p_actor,p_booking); permissions:=scope->'permissions';
  select * into c from public.business_client_cards where salon_id=p_salon and subject_key=scope->>'subject_key';
  with permitted as (
    select b.*,s.name service_name from public.bookings b left join public.styles s on s.id=b.style_id and s.salon_id=p_salon
    where b.salon_id=p_salon and (b.id=p_booking or (scope->>'customer_id' is not null and b.customer_id=(scope->>'customer_id')::uuid))
      and (scope->>'stylist_id' is null or b.stylist_id=(scope->>'stylist_id')::uuid)
      and coalesce(b.payment_mode,'live')<>'test'
  ), excerpt as (select * from permitted order by appointment_datetime desc,id limit 200)
  select (select count(*) from permitted), coalesce(jsonb_agg(jsonb_build_object('booking_id',b.id,'date',b.appointment_datetime,'name',coalesce(b.manual_service_name,b.service_name),
    'status',b.status,'duration_hours',b.duration_hours,'size',b.selected_size,'length',b.selected_length,'options',b.selected_options,
    'formula',case when (permissions->>'client_formulas')::boolean then f.formula else null end,
    'formula_locale',case when (permissions->>'client_formulas')::boolean then f.source_locale else null end,
    'agreed_amount',case when (permissions->>'client_spend')::boolean then b.estimated_total else null end) order by b.appointment_datetime desc,b.id),'[]')
    into total,visits from excerpt b left join public.business_client_formulas f on f.salon_id=p_salon and f.booking_id=b.id and f.card_id=c.id;
  if (permissions->>'client_photos')::boolean then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'booking_id',p.booking_id,'caption',p.caption,'source_locale',p.source_locale,'created_at',p.created_at) order by p.created_at desc),'[]') into photos
      from public.business_client_photos p join public.bookings b on b.id=p.booking_id and b.salon_id=p_salon
      where p.salon_id=p_salon and p.card_id=c.id and p.removed_at is null and (scope->>'stylist_id' is null or b.stylist_id=(scope->>'stylist_id')::uuid);
  end if;
  if (permissions->>'client_spend')::boolean then
    with permitted as (select b.* from public.bookings b where b.salon_id=p_salon
      and (b.id=p_booking or (scope->>'customer_id' is not null and b.customer_id=(scope->>'customer_id')::uuid))
      and (scope->>'stylist_id' is null or b.stylist_id=(scope->>'stylist_id')::uuid) and coalesce(b.payment_mode,'live')<>'test')
    select jsonb_build_object('completed_agreed_cents',coalesce(sum(case when lower(b.status)='completed' then round(coalesce(b.estimated_total,0)*100) else 0 end),0),
      'recorded_payment_cents',coalesce(sum(case when b.deposit_status='Paid' then round(coalesce(b.deposit_amount,0)*100) else 0 end
        -case when b.refund_completed_at is not null then round(coalesce(b.refund_amount,0)*100) else 0 end
        +coalesce((select sum(case when r.stage='refund' then -r.amount_cents else r.amount_cents end) from public.business_finance_receipts r where r.salon_id=p_salon and r.booking_id=b.id),0)),0),
      'currency','USD','basis','linked_bookings_and_recorded_chair_payments','period','all_time') into spend from permitted b;
  end if;
  return jsonb_build_object('card_id',c.id,'revision',coalesce(c.revision,0),'booking_id',p_booking,'permissions',permissions,
    'scope',case when scope->>'stylist_id' is null then 'this_business_only' else 'assigned_stylist_only' end,
    'scope_stylist_id',scope->>'stylist_id','source_locale',coalesce(c.source_locale,'en'),
    'field_locales',case when (permissions->>'client_notes')::boolean then jsonb_build_object('preferences',c.field_locales->'preferences','notes',c.field_locales->'notes') else '{}'::jsonb end
      ||case when (permissions->>'client_cautions')::boolean then jsonb_build_object('cautions',c.field_locales->'cautions') else '{}'::jsonb end,
    'preferences',case when (permissions->>'client_notes')::boolean then coalesce(c.preferences,'') else null end,
    'notes',case when (permissions->>'client_notes')::boolean then coalesce(c.notes,'') else null end,
    'cautions',case when (permissions->>'client_cautions')::boolean then coalesce(c.cautions,'') else null end,
    'visits',visits,'visit_count',total,'capped_at',200,'photos',photos,'spend',spend);
end $$;

create function public.save_business_client_card(p_salon uuid,p_actor uuid,p_booking uuid,p_request uuid,p_revision integer,p_locale text,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare scope jsonb; permissions jsonb; c public.business_client_cards%rowtype; prior public.business_client_events%rowtype; input jsonb; before_values jsonb; result jsonb; k text; f jsonb;
begin
  perform 1 from public.salons where id=p_salon for update;
  perform 1 from public.platform_identities where user_id=p_actor for share;
  perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
  perform 1 from public.bookings where id=p_booking and salon_id=p_salon for share;
  scope:=public.business_client_scope(p_salon,p_actor,p_booking); permissions:=scope->'permissions';
  if not (permissions->>'client_edit')::boolean then raise exception 'CLIENT_ACCESS_DENIED'; end if;
  if p_request is null or p_revision is null or p_revision<0 or p_locale is null or p_locale not in ('en','fr','es','zh-CN')
    or p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or octet_length(p_patch::text)>24000
    or exists(select 1 from jsonb_object_keys(p_patch) key where key not in ('preferences','notes','cautions','formula')) then raise exception 'CLIENT_INVALID'; end if;
  foreach k in array array['preferences','notes','cautions','formula'] loop
    if p_patch ? k then
      if not (permissions->>case when k='formula' then 'client_formulas' when k='cautions' then 'client_cautions' else 'client_notes' end)::boolean then raise exception 'CLIENT_ACCESS_DENIED'; end if;
      if k<>'formula' and (jsonb_typeof(p_patch->k)<>'string' or length(p_patch->>k)>4000) then raise exception 'CLIENT_INVALID'; end if;
    end if;
  end loop;
  if p_patch ? 'formula' then
    f:=p_patch->'formula';
    if jsonb_typeof(f)<>'object' or exists(select 1 from jsonb_object_keys(f) key where key not in ('instructions','color','size','length','technique','duration_minutes'))
      or exists(select 1 from jsonb_each(f) where key<>'duration_minutes' and (jsonb_typeof(value)<>'string' or length(value#>>'{}')>4000))
      or (f ? 'duration_minutes' and (f->'duration_minutes'<>'null'::jsonb and (jsonb_typeof(f->'duration_minutes')<>'number' or (f->>'duration_minutes') !~ '^[0-9]+$' or (f->>'duration_minutes')::numeric not between 1 and 1440))) then raise exception 'CLIENT_INVALID'; end if;
  end if;
  input:=jsonb_build_object('booking_id',p_booking,'revision',p_revision,'locale',p_locale,'patch',p_patch);
  select * into prior from public.business_client_events where salon_id=p_salon and actor_id=p_actor and request_id=p_request;
  if found then
    if prior.input<>input then raise exception 'CLIENT_REQUEST_CONFLICT'; end if;
    return prior.result; -- IDs/revision only, never replay formerly authorized fields.
  end if;
  select * into c from public.business_client_cards where salon_id=p_salon and subject_key=scope->>'subject_key' for update;
  if coalesce(c.revision,0)<>p_revision then raise exception 'CLIENT_CHANGED'; end if;
  if c.id is null then
    insert into public.business_client_cards(salon_id,subject_key,updated_by) values(p_salon,scope->>'subject_key',p_actor) returning * into c;
  end if;
  before_values:=to_jsonb(c);
  if p_patch ? 'formula' then
    before_values:=before_values||jsonb_build_object('formula',(select formula from public.business_client_formulas where salon_id=p_salon and booking_id=p_booking));
    insert into public.business_client_formulas(salon_id,card_id,booking_id,formula,source_locale,updated_by)
      values(p_salon,c.id,p_booking,p_patch->'formula',p_locale,p_actor)
      on conflict(salon_id,booking_id) do update set formula=excluded.formula,source_locale=excluded.source_locale,updated_at=now(),updated_by=p_actor;
  end if;
  update public.business_client_cards set preferences=coalesce(p_patch->>'preferences',preferences),notes=coalesce(p_patch->>'notes',notes),cautions=coalesce(p_patch->>'cautions',cautions),
    source_locale=p_locale,field_locales=field_locales||coalesce((select jsonb_object_agg(key,p_locale) from jsonb_object_keys(p_patch) key where key<>'formula'),'{}'),
    revision=revision+1,updated_by=p_actor,updated_at=now() where id=c.id returning * into c;
  result:=jsonb_build_object('card_id',c.id,'revision',c.revision,'verified',true);
  insert into public.business_client_events(salon_id,actor_id,request_id,booking_id,card_id,input,before_values,result) values(p_salon,p_actor,p_request,p_booking,c.id,input,before_values,result);
  return result;
end $$;

create function public.record_business_client_photo(p_salon uuid,p_actor uuid,p_booking uuid,p_photo uuid,p_caption text,p_locale text,p_remove boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare scope jsonb; c public.business_client_cards%rowtype; photo public.business_client_photos%rowtype; path text;
begin
  perform 1 from public.salons where id=p_salon for update;
  perform 1 from public.platform_identities where user_id=p_actor for share;
  perform 1 from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
  perform 1 from public.bookings where id=p_booking and salon_id=p_salon for share;
  scope:=public.business_client_scope(p_salon,p_actor,p_booking);
  if not (scope->'permissions'->>'client_edit')::boolean or not (scope->'permissions'->>'client_photos')::boolean then raise exception 'CLIENT_ACCESS_DENIED'; end if;
  if p_photo is null or p_caption is null or length(p_caption)>300 or p_locale is null or p_locale not in ('en','fr','es','zh-CN') or p_remove is null then raise exception 'CLIENT_INVALID'; end if;
  select * into c from public.business_client_cards where salon_id=p_salon and subject_key=scope->>'subject_key';
  select * into photo from public.business_client_photos where id=p_photo and salon_id=p_salon and booking_id=p_booking and card_id=c.id;
  if p_remove then
    if photo.id is null then raise exception 'CLIENT_NOT_FOUND'; end if;
    update public.business_client_photos set removed_at=coalesce(removed_at,now()),removed_by=coalesce(removed_by,p_actor) where id=p_photo;
    return jsonb_build_object('id',p_photo,'removed',true,'object_path',photo.object_path);
  end if;
  if photo.id is not null then
    if photo.removed_at is not null or photo.caption<>p_caption or photo.source_locale<>p_locale then raise exception 'CLIENT_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('id',photo.id,'verified',true);
  end if;
  path:=p_salon||'/'||p_booking||'/'||p_photo||'.webp';
  if not exists(select 1 from storage.objects where bucket_id='business-client-work' and name=path) then raise exception 'CLIENT_PHOTO_NOT_UPLOADED'; end if;
  if c.id is null then insert into public.business_client_cards(salon_id,subject_key,updated_by) values(p_salon,scope->>'subject_key',p_actor) returning * into c; end if;
  if (select count(*) from public.business_client_photos where salon_id=p_salon and card_id=c.id and removed_at is null)>=100 then raise exception 'CLIENT_PHOTO_LIMIT'; end if;
  insert into public.business_client_photos(id,salon_id,card_id,booking_id,object_path,caption,source_locale,created_by)
    values(p_photo,p_salon,c.id,p_booking,path,p_caption,p_locale,p_actor);
  return jsonb_build_object('id',p_photo,'verified',true);
end $$;

create function public.read_business_client_photo(p_salon uuid,p_actor uuid,p_booking uuid,p_photo uuid)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare scope jsonb; path text;
begin
  scope:=public.business_client_scope(p_salon,p_actor,p_booking);
  if not (scope->'permissions'->>'client_photos')::boolean then raise exception 'CLIENT_ACCESS_DENIED'; end if;
  select p.object_path into path from public.business_client_photos p join public.business_client_cards c on c.id=p.card_id and c.salon_id=p_salon
    join public.bookings b on b.id=p.booking_id and b.salon_id=p_salon
    where p.id=p_photo and p.salon_id=p_salon and c.subject_key=scope->>'subject_key' and p.removed_at is null
      and (scope->>'stylist_id' is null or b.stylist_id=(scope->>'stylist_id')::uuid);
  if path is null then raise exception 'CLIENT_NOT_FOUND'; end if;
  return path;
end $$;

revoke all on function public.business_client_scope(uuid,uuid,uuid),public.read_business_client_card(uuid,uuid,uuid),public.save_business_client_card(uuid,uuid,uuid,uuid,integer,text,jsonb),public.record_business_client_photo(uuid,uuid,uuid,uuid,text,text,boolean),public.read_business_client_photo(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.business_client_scope(uuid,uuid,uuid),public.read_business_client_card(uuid,uuid,uuid),public.save_business_client_card(uuid,uuid,uuid,uuid,integer,text,jsonb),public.record_business_client_photo(uuid,uuid,uuid,uuid,text,text,boolean),public.read_business_client_photo(uuid,uuid,uuid,uuid) to service_role;
alter table public.gc_assistant_requests drop constraint gc_assistant_requests_permission_check;
alter table public.gc_assistant_requests add constraint gc_assistant_requests_permission_check check(permission in ('client_history','overview','bookings','availability','my_page','photos','styles','stylists','products','reviews','promotions','earnings'));
alter table public.gc_assistant_requests drop constraint gc_assistant_requests_tool_check;
alter table public.gc_assistant_requests add constraint gc_assistant_requests_tool_check check(tool in ('get_client_record','get_business_media','search_platform_knowledge','get_business_summary','get_bookings','get_availability','get_business_profile','get_services_and_prices','get_business_policies','get_customers','get_professionals','get_products','get_booking_messages','get_reviews','get_promotions','get_plan_status','get_profile_completion','get_earnings_summary','get_upcoming_appointments','get_calendar_gaps','prepare_manual_appointment','prepare_manual_reschedule','prepare_manual_cancellation','prepare_business_hours','prepare_service_edit','prepare_professional_draft','prepare_product_draft','prepare_promotion_draft','prepare_booking_note','prepare_business_profile_update','prepare_availability_block','prepare_service','prepare_customer_message','prepare_business_policy_update'));
update public.engine_settings set published_value='"20260918091453"'::jsonb,draft_value='"20260918091453"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
