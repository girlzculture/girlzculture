-- Section 5: persistent salon logos and secure pre-form stylist uploads.
begin;

alter table public.salons add column if not exists logo_url text;
alter table public.stylists add column if not exists is_draft boolean not null default false;

update public.salons salon
set logo_url = application.logo_url
from public.salon_applications application
where application.salon_id = salon.id
  and nullif(application.logo_url,'') is not null
  and nullif(salon.logo_url,'') is null;

create or replace function public.create_stylist_draft(p_salon_id uuid)
returns public.stylists
language plpgsql security definer set search_path = public as $$
declare draft public.stylists;
begin
  if not public.owns_salon(p_salon_id) and not public.is_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
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

commit;
