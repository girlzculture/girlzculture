begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.salons add column photo_metadata jsonb not null default '{}'::jsonb
  check (jsonb_typeof(photo_metadata) = 'object' and octet_length(photo_metadata::text) <= 131072);

-- Metadata belongs to the existing saved gallery, not a second image store.
-- Lock the business row so concurrent edits to different photos are merged,
-- and conflicting edits to the same photo never silently overwrite each other.
create function public.update_business_photo_details(p_salon uuid, p_user uuid, p_url text, p_details jsonb, p_expected jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_row public.salons%rowtype; v_result jsonb;
begin
  if not public.p0_actor_has_permission(p_salon, p_user, 'photos') then raise exception 'PHOTO_ACCESS_DENIED'; end if;
  if not public.p0_business_plan_active(p_salon) then raise exception 'PHOTO_PLAN_REQUIRED'; end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object'
    or (select count(*) from jsonb_object_keys(p_details)) <> 5
    or not (p_details ?& array['category','title','caption','featured','source_locale'])
    or jsonb_typeof(p_details->'category') <> 'string' or p_details->>'category' not in ('services','before_after','space','team','client_love','other')
    or jsonb_typeof(p_details->'title') <> 'string' or length(p_details->>'title') > 120
    or jsonb_typeof(p_details->'caption') <> 'string' or length(p_details->>'caption') > 1000
    or jsonb_typeof(p_details->'featured') <> 'boolean'
    or jsonb_typeof(p_details->'source_locale') <> 'string' or p_details->>'source_locale' not in ('en','fr','es','zh-CN','wo') then raise exception 'PHOTO_INVALID'; end if;
  select * into v_row from public.salons where id = p_salon for update;
  if not found or not coalesce(v_row.gallery_photos, '[]'::jsonb) @> jsonb_build_array(p_url) then raise exception 'PHOTO_NOT_FOUND'; end if;
  perform 1 from public.platform_identities where user_id = p_user for share;
  perform 1 from public.salon_team_members where salon_id = p_salon and user_id = p_user for share;
  perform 1 from public.subscriptions where salon_id = p_salon for share;
  if not public.p0_actor_has_permission(p_salon, p_user, 'photos') then raise exception 'PHOTO_ACCESS_DENIED'; end if;
  if not public.p0_business_plan_active(p_salon) then raise exception 'PHOTO_PLAN_REQUIRED'; end if;
  if v_row.photo_metadata->p_url is distinct from p_expected then raise exception 'PHOTO_STALE'; end if;
  v_result := jsonb_set(v_row.photo_metadata, array[p_url], p_details, true);
  update public.salons set photo_metadata = v_result where id = p_salon;
  return v_result;
end;
$$;
revoke all on function public.update_business_photo_details(uuid,uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.update_business_photo_details(uuid,uuid,text,jsonb,jsonb) to service_role;

commit;
