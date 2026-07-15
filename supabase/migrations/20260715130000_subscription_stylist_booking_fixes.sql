begin;

-- Owners and explicitly permitted team members can create the durable draft
-- that makes photo-first stylist setup possible.
create or replace function public.create_stylist_draft(p_salon_id uuid)
returns public.stylists
language plpgsql security definer set search_path = public, auth as $$
declare draft public.stylists;
begin
  if not public.salon_has_permission(p_salon_id, 'stylists')
     and not public.admin_has_permission('salons') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select * into draft from public.stylists
  where salon_id = p_salon_id and is_draft
  order by created_at desc limit 1;
  if draft.id is not null then return draft; end if;
  insert into public.stylists(salon_id, name, bio, is_active, is_draft)
  values (p_salon_id, 'New Stylist', '', false, true)
  returning * into draft;
  return draft;
end $$;

revoke all on function public.create_stylist_draft(uuid) from public;
grant execute on function public.create_stylist_draft(uuid) to authenticated;

drop policy if exists stylists_public_read on public.stylists;
create policy stylists_public_read on public.stylists for select to anon, authenticated
using (
  public.is_marketplace_visible(salon_id)
  or public.salon_has_permission(salon_id, 'stylists')
  or public.admin_has_permission('salons')
);

drop policy if exists stylists_owner_insert on public.stylists;
create policy stylists_owner_insert on public.stylists for insert to authenticated
with check (public.salon_has_permission(salon_id, 'stylists') or public.admin_has_permission('salons'));

drop policy if exists stylists_owner_update on public.stylists;
create policy stylists_owner_update on public.stylists for update to authenticated
using (public.salon_has_permission(salon_id, 'stylists') or public.admin_has_permission('salons'))
with check (public.salon_has_permission(salon_id, 'stylists') or public.admin_has_permission('salons'));

drop policy if exists stylists_owner_delete on public.stylists;
create policy stylists_owner_delete on public.stylists for delete to authenticated
using (public.salon_has_permission(salon_id, 'stylists') or public.admin_has_permission('salons'));

commit;
