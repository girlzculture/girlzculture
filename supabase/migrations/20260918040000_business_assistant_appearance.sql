begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table public.salons add column gc_assistant_avatar text not null default 'woman'
  check (gc_assistant_avatar in ('woman','man','woman_light','man_dark','cat','dog'));

create function public.update_business_assistant_avatar(p_salon uuid, p_user uuid, p_avatar text)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_avatar is null or p_avatar not in ('woman','man','woman_light','man_dark','cat','dog') then raise exception 'ASSISTANT_INVALID_AVATAR'; end if;
  -- Only the business owner changes a shared appearance preference.
  perform 1 from public.salons where id=p_salon and user_id=p_user for update;
  if not found then raise exception 'ASSISTANT_ACCESS_DENIED'; end if;
  perform 1 from public.platform_identities where user_id=p_user for share;
  if not public.p0_actor_has_permission(p_salon,p_user,'my_page') then raise exception 'ASSISTANT_ACCESS_DENIED'; end if;
  update public.salons set gc_assistant_avatar=p_avatar where id=p_salon and user_id=p_user;
  return p_avatar;
end $$;
revoke all on function public.update_business_assistant_avatar(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.update_business_assistant_avatar(uuid,uuid,text) to service_role;
update public.engine_settings set published_value='"20260918040000"'::jsonb,
  draft_value='"20260918040000"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
