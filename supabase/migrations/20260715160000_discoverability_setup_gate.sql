-- Public discovery requires an explicitly finished, complete salon setup.

alter table public.salons
  add column if not exists owner_is_sole_stylist boolean not null default false;

comment on column public.salons.owner_is_sole_stylist is
  'Owner confirmation used instead of a separate stylist profile for marketplace setup.';

revoke update (owner_is_sole_stylist) on public.salons from authenticated;

create or replace function public.salon_setup_complete(target_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.salons s
    where s.id = target_salon_id
      and nullif(trim(coalesce(s.logo_url, '')), '') is not null
      and (
        nullif(trim(coalesce(s.cover_photo_url, '')), '') is not null
        or jsonb_array_length(
          case
            when jsonb_typeof(coalesce(to_jsonb(s.gallery_photos), '[]'::jsonb)) = 'array'
              then coalesce(to_jsonb(s.gallery_photos), '[]'::jsonb)
            else '[]'::jsonb
          end
        ) >= 1
      )
      and exists (
        select 1 from public.styles st
        where st.salon_id = s.id
          and coalesce(st.base_price, st.price_display_min) is not null
          and coalesce(st.base_price, st.price_display_min) >= 0
      )
      and (
        s.owner_is_sole_stylist
        or exists (
          select 1 from public.stylists sy
          where sy.salon_id = s.id and sy.is_active is distinct from false
        )
      )
      and exists (
        select 1
        from jsonb_each(coalesce(to_jsonb(s.hours), '{}'::jsonb)) as day(key, value)
        where jsonb_typeof(day.value) = 'object'
          and coalesce((day.value ->> 'closed')::boolean, false) = false
          and nullif(day.value ->> 'open', '') is not null
          and nullif(day.value ->> 'close', '') is not null
      )
  );
$$;

revoke all on function public.salon_setup_complete(uuid) from public;

create or replace function public.is_marketplace_visible(target_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.salons s
    where s.id = target_salon_id
      and (
        (
          s.status = 'Active'
          and s.is_discoverable = true
          and public.has_active_subscription(s.id)
          and public.salon_setup_complete(s.id)
        )
        -- Preserve the existing unclaimed demonstration profiles.
        or (s.status = 'New' and s.user_id is null)
        or s.user_id = auth.uid()
        or public.is_admin()
      )
  );
$$;

revoke all on function public.is_marketplace_visible(uuid) from public;
grant execute on function public.is_marketplace_visible(uuid) to anon, authenticated;

create index if not exists salons_owner_solo_stylist_idx
  on public.salons(owner_is_sole_stylist)
  where owner_is_sole_stylist = true;
