begin;

-- Source references never authorize remote fetching. Only owner-supplied facts
-- and media already belonging to this workspace enter this private review area.
create table public.business_onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  revision integer not null default 1 check (revision > 0),
  status text not null default 'draft' check (status in ('draft','applied')),
  source jsonb not null check (jsonb_typeof(source)='object'),
  facts jsonb not null check (jsonb_typeof(facts)='object' and octet_length(facts::text)<=100000),
  uncertain jsonb not null check (jsonb_typeof(uncertain)='array'),
  provenance jsonb not null,
  baseline text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint onboarding_confirmation_pair check ((status='draft' and confirmed_at is null and result is null) or (status='applied' and confirmed_at is not null and result is not null))
);
create index business_onboarding_drafts_salon_created on public.business_onboarding_drafts(salon_id,created_at desc);
alter table public.business_onboarding_drafts enable row level security;
revoke all on public.business_onboarding_drafts from public,anon,authenticated;
grant all on public.business_onboarding_drafts to service_role;
-- These RPCs remain INVOKER; the server role receives only the canonical
-- columns it actually writes instead of inheriting the function owner's role.
grant select on public.salons,public.styles,public.stylists,public.service_groups to service_role;
grant update(name,description,description_ai_assisted,phone,address_street,address_city,address_state,address_zip,hours,gallery_photos,owner_unpublished_at,owner_unpublished_reason,is_discoverable) on public.salons to service_role;
grant update(is_draft) on public.styles to service_role;
grant insert(salon_id,name,bio,is_active) on public.stylists to service_role;
grant insert(salon_id,policy,source_locale,created_by) on public.business_policy_revisions to service_role;

create function public.business_onboarding_baseline(p_salon uuid)
returns text language sql stable security invoker set search_path=public,pg_temp as $$
  select md5(jsonb_build_object(
    'profile',jsonb_build_object('name',s.name,'description',s.description,'phone',s.phone,
      'street',s.address_street,'city',s.address_city,'state',s.address_state,'zip',s.address_zip,
      'hours',s.hours,'photos',s.gallery_photos,'policy',s.business_policy_revision_id,
      'status',s.status,'discoverable',s.is_discoverable,'owner_hold',s.owner_unpublished_at),
    'services',(select jsonb_agg(to_jsonb(st) order by st.id) from public.styles st where st.salon_id=s.id),
    'team',(select jsonb_agg(to_jsonb(st) order by st.id) from public.stylists st where st.salon_id=s.id)
  )::text) from public.salons s where s.id=p_salon;
$$;

create function public.save_business_onboarding_draft(p_salon uuid,p_actor uuid,p_source jsonb,p_facts jsonb,p_uncertain jsonb,p_id uuid default null,p_revision integer default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_draft public.business_onboarding_drafts%rowtype; v_provenance jsonb;
begin
  perform 1 from public.salons where id=p_salon and user_id=p_actor for update;
  if not found or not public.p0_actor_has_permission(p_salon,p_actor,'my_page') then raise exception 'ONBOARDING_FORBIDDEN'; end if;
  if p_source->>'kind' not in ('manual','instagram','website') or p_source->>'permitted' is distinct from 'true'
    or jsonb_typeof(p_facts) is distinct from 'object' or jsonb_typeof(p_uncertain) is distinct from 'array' then raise exception 'ONBOARDING_INVALID'; end if;
  v_provenance:=jsonb_build_object('method','owner_supplied','actor',p_actor,'recorded_at',now(),'source',p_source,'sections',jsonb_build_array('identity','services','hours','photos','team','policies'));
  if p_id is null then
    insert into public.business_onboarding_drafts(salon_id,created_by,source,facts,uncertain,provenance,baseline)
      values(p_salon,p_actor,p_source,p_facts,p_uncertain,v_provenance,public.business_onboarding_baseline(p_salon)) returning * into v_draft;
  else
    select * into v_draft from public.business_onboarding_drafts where id=p_id and salon_id=p_salon and created_by=p_actor for update;
    if not found then raise exception 'ONBOARDING_NOT_FOUND'; end if;
    if v_draft.status<>'draft' or v_draft.revision is distinct from p_revision then raise exception 'ONBOARDING_STALE'; end if;
    update public.business_onboarding_drafts set source=p_source,facts=p_facts,uncertain=p_uncertain,provenance=v_provenance,
      baseline=public.business_onboarding_baseline(p_salon),revision=revision+1,updated_at=now()
      where id=p_id returning * into v_draft;
  end if;
  return to_jsonb(v_draft)-'baseline'-'provenance';
end $$;

create function public.apply_business_onboarding_draft(p_salon uuid,p_actor uuid,p_id uuid,p_revision integer,p_reviewed text[],p_keep_unpublished boolean,p_public_impact boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_draft public.business_onboarding_drafts%rowtype; v_salon public.salons%rowtype;
  v_identity jsonb; v_service jsonb; v_group public.service_groups%rowtype; v_rows jsonb:='[]';
  v_import jsonb; v_team jsonb; v_team_ids jsonb:='[]'; v_id uuid; v_policy uuid; v_result jsonb; v_existing boolean; v_published boolean;
begin
  -- Match the canonical importer lock order: importer -> child trigger ->
  -- salon. The lock also prevents an upsert racing our append-only precheck.
  perform pg_advisory_xact_lock(hashtext(p_salon::text||':salon-service-spreadsheet'));
  -- Serialize against profile edits and every other onboarding confirmation.
  select * into v_salon from public.salons where id=p_salon and user_id=p_actor for update;
  if not found or not public.p0_actor_has_permission(p_salon,p_actor,'my_page') then raise exception 'ONBOARDING_FORBIDDEN'; end if;
  select * into v_draft from public.business_onboarding_drafts where id=p_id and salon_id=p_salon and created_by=p_actor for update;
  if not found then raise exception 'ONBOARDING_NOT_FOUND'; end if;
  if v_draft.revision is distinct from p_revision then raise exception 'ONBOARDING_STALE'; end if;
  if cardinality(p_reviewed) is distinct from 6 or not p_reviewed @> array['identity','services','hours','photos','team','policies'] or p_keep_unpublished is null or p_public_impact is null or p_keep_unpublished=p_public_impact then raise exception 'ONBOARDING_REVIEW_REQUIRED'; end if;
  -- An uncertain response can be safely retried without replaying profile writes.
  if v_draft.status='applied' then return to_jsonb(v_draft)-'baseline'-'provenance'; end if;
  if v_draft.baseline is distinct from public.business_onboarding_baseline(p_salon) then raise exception 'ONBOARDING_WORKSPACE_CHANGED'; end if;
  v_existing:=coalesce(v_salon.is_discoverable,false) or v_salon.status='Active';
  if (v_existing and (p_keep_unpublished or not p_public_impact)) or (not v_existing and (not p_keep_unpublished or p_public_impact)) then raise exception 'ONBOARDING_LIVE_BUSINESS_REVIEW_REQUIRED'; end if;
  v_identity:=v_draft.facts->'identity';
  if length(trim(coalesce(v_identity->>'name',''))) not between 1 and 240 then raise exception 'ONBOARDING_NAME_REQUIRED'; end if;
  if exists(select 1 from jsonb_array_elements_text(v_draft.facts->'photos') photo where not coalesce(v_salon.gallery_photos,'[]'::jsonb) @> jsonb_build_array(photo.value)) then raise exception 'ONBOARDING_PHOTO_NOT_OWNED'; end if;
  -- Existing publication reconciliation honors this owner hold. Set it before
  -- any child/profile trigger can reconsider marketplace eligibility.
  if p_keep_unpublished then
    update public.salons set owner_unpublished_at=coalesce(owner_unpublished_at,now()),
      owner_unpublished_reason=coalesce(owner_unpublished_reason,'Owner is reviewing imported onboarding details'),is_discoverable=false where id=p_salon;
  end if;
  update public.salons set name=v_identity->>'name',
    description=coalesce(nullif(v_identity->>'description',''),description),
    description_ai_assisted=case when nullif(v_identity->>'description','') is not null then false else description_ai_assisted end,
    phone=coalesce(nullif(v_identity->>'phone',''),phone),
    address_street=coalesce(nullif(v_identity->>'address_street',''),address_street),
    address_city=coalesce(nullif(v_identity->>'address_city',''),address_city),
    address_state=coalesce(nullif(v_identity->>'address_state',''),address_state),
    address_zip=coalesce(nullif(v_identity->>'address_zip',''),address_zip),
    hours=coalesce(hours,'{}'::jsonb)||(v_draft.facts->'hours'),
    gallery_photos=case when jsonb_array_length(v_draft.facts->'photos')>0 then v_draft.facts->'photos' else gallery_photos end
    where id=p_salon;
  for v_service in select value from jsonb_array_elements(v_draft.facts->'services') loop
    -- Missing facts stay in the private draft. Never manufacture a free price,
    -- a duration or catalog classification to satisfy a required DB field.
    if v_service->>'price' is null or v_service->>'minutes' is null or v_service->>'group_id' is null then continue; end if;
    if exists(select 1 from public.styles where salon_id=p_salon and lower(trim(name))=lower(trim(v_service->>'name'))) then raise exception 'ONBOARDING_EXISTING_SERVICE'; end if;
    select * into v_group from public.service_groups where id=(v_service->>'group_id')::uuid and is_active and archived_at is null;
    if not found then raise exception 'ONBOARDING_CATALOG_CHANGED'; end if;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object('record_id',null,'category_id',v_group.category_id,'service_group_id',v_group.id,'master_style_id',null,
      'name',v_service->>'name','description','','duration_min_hours',(v_service->>'minutes')::numeric/60,
      'duration_max_hours',(v_service->>'minutes')::numeric/60,'buffer_minutes',0,'base_price',(v_service->>'price')::numeric,
      'price_display_max',(v_service->>'price')::numeric,'addons','[]'::jsonb));
  end loop;
  if jsonb_array_length(v_rows)>0 then
    -- Reuse the canonical import's catalog validation, audit and plan rules.
    v_import:=public.import_salon_services_spreadsheet(p_salon,p_actor,'Owner-reviewed onboarding',v_rows);
    if coalesce((v_import->>'updated')::integer,0)<>0 then raise exception 'ONBOARDING_WORKSPACE_CHANGED'; end if;
    update public.styles set is_draft=true where salon_id=p_salon and id in(select value::uuid from jsonb_array_elements_text(v_import->'record_ids'));
  end if;
  for v_team in select value from jsonb_array_elements(v_draft.facts->'team') loop
    if exists(select 1 from public.stylists where salon_id=p_salon and lower(trim(name))=lower(trim(v_team->>'name'))) then raise exception 'ONBOARDING_EXISTING_TEAM'; end if;
    insert into public.stylists(salon_id,name,bio,is_active) values(p_salon,v_team->>'name',v_team->>'bio',false) returning id into v_id;
    v_team_ids:=v_team_ids||jsonb_build_array(v_id);
  end loop;
  if jsonb_typeof(v_draft.facts->'policies')='object' then
    insert into public.business_policy_revisions(salon_id,policy,source_locale,created_by)
      values(p_salon,v_draft.facts->'policies',coalesce(v_draft.source->>'locale','en'),p_actor) returning id into v_policy;
  end if;
  if p_keep_unpublished and exists(select 1 from public.salons where id=p_salon and (is_discoverable or owner_unpublished_at is null)) then raise exception 'ONBOARDING_PUBLICATION_GUARD'; end if;
  -- Existing publication holds are never lifted by this import. Lifecycle
  -- checks may reduce eligibility after a reviewed address/profile change.
  if v_existing and exists(select 1 from public.salons where id=p_salon and owner_unpublished_at is distinct from v_salon.owner_unpublished_at) then raise exception 'ONBOARDING_PUBLICATION_GUARD'; end if;
  select coalesce(is_discoverable,false) into v_published from public.salons where id=p_salon;
  v_result:=jsonb_build_object('profile_saved',true,'services_created',coalesce(v_import->'created','0'::jsonb),
    'service_ids',coalesce(v_import->'record_ids','[]'::jsonb),'team_ids',v_team_ids,'policy_revision_id',v_policy,'published',v_published,'public_impact_reviewed',p_public_impact,'uncertain',v_draft.uncertain);
  update public.business_onboarding_drafts set status='applied',confirmed_at=now(),updated_at=now(),result=v_result where id=p_id returning * into v_draft;
  return to_jsonb(v_draft)-'baseline'-'provenance';
end $$;

revoke all on function public.business_onboarding_baseline(uuid),public.save_business_onboarding_draft(uuid,uuid,jsonb,jsonb,jsonb,uuid,integer),public.apply_business_onboarding_draft(uuid,uuid,uuid,integer,text[],boolean,boolean) from public,anon,authenticated;
grant execute on function public.business_onboarding_baseline(uuid),public.save_business_onboarding_draft(uuid,uuid,jsonb,jsonb,jsonb,uuid,integer),public.apply_business_onboarding_draft(uuid,uuid,uuid,integer,text[],boolean,boolean) to service_role;
update public.engine_settings set published_value='"20260919023609"'::jsonb,draft_value='"20260919023609"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
