-- Girlz Culture: make Supabase Auth user IDs the ownership boundary.
--
-- This migration is intentionally idempotent so it can be reviewed and run in
-- the existing Supabase project without recreating any application tables.

begin;

alter table public.salons
  add column if not exists user_id uuid references auth.users(id) on delete set null;

comment on column public.salons.user_id is
  'Supabase Auth user that owns and manages this salon. Email is contact data only.';

create index if not exists salons_user_id_idx on public.salons(user_id);

-- One-time compatibility backfill for profiles created by the prototype. Email
-- is used only here to establish the durable auth relationship. All runtime
-- authorization and routing use user_id after this migration.
update public.salons as salon
set user_id = auth_user.id
from auth.users as auth_user
where salon.user_id is null
  and salon.email is not null
  and auth_user.email is not null
  and lower(trim(salon.email)) = lower(trim(auth_user.email));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_users
    where id = auth.uid()
  );
$$;

create or replace function public.owns_salon(target_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.salons
    where id = target_salon_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.owns_style(target_style_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.styles
    where id = target_style_id
      and public.owns_salon(salon_id)
  );
$$;

create or replace function public.owns_stylist(target_stylist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.stylists
    where id = target_stylist_id
      and public.owns_salon(salon_id)
  );
$$;

create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.owns_salon(uuid) from public;
revoke all on function public.owns_style(uuid) from public;
revoke all on function public.owns_stylist(uuid) from public;
revoke all on function public.safe_uuid(text) from public;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.owns_salon(uuid) to anon, authenticated;
grant execute on function public.owns_style(uuid) to anon, authenticated;
grant execute on function public.owns_stylist(uuid) to anon, authenticated;
grant execute on function public.safe_uuid(text) to anon, authenticated;

alter table public.salons enable row level security;
alter table public.stylists enable row level security;
alter table public.styles enable row level security;
alter table public.style_materials enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.subscriptions enable row level security;
alter table public.availability enable row level security;
alter table public.admin_users enable row level security;
alter table public.complaints_log enable row level security;

-- Salons: visitors see live marketplace profiles; owners and admins retain
-- access to profiles in every lifecycle state.
drop policy if exists salons_public_read on public.salons;
create policy salons_public_read
on public.salons for select
to anon, authenticated
using (
  status in ('New', 'Active')
  or user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists salons_owner_insert on public.salons;
create policy salons_owner_insert
on public.salons for insert
to authenticated
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists salons_owner_update on public.salons;
create policy salons_owner_update
on public.salons for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists salons_admin_delete on public.salons;
create policy salons_admin_delete
on public.salons for delete
to authenticated
using (public.is_admin());

-- Styles and nested transparent-pricing records.
drop policy if exists styles_public_read on public.styles;
create policy styles_public_read
on public.styles for select
to anon, authenticated
using (
  exists (
    select 1 from public.salons
    where salons.id = styles.salon_id
      and (
        salons.status in ('New', 'Active')
        or salons.user_id = auth.uid()
        or public.is_admin()
      )
  )
);

drop policy if exists styles_owner_insert on public.styles;
create policy styles_owner_insert
on public.styles for insert
to authenticated
with check (public.owns_salon(salon_id) or public.is_admin());

drop policy if exists styles_owner_update on public.styles;
create policy styles_owner_update
on public.styles for update
to authenticated
using (public.owns_salon(salon_id) or public.is_admin())
with check (public.owns_salon(salon_id) or public.is_admin());

drop policy if exists styles_owner_delete on public.styles;
create policy styles_owner_delete
on public.styles for delete
to authenticated
using (public.owns_salon(salon_id) or public.is_admin());

drop policy if exists style_materials_public_read on public.style_materials;
create policy style_materials_public_read
on public.style_materials for select
to anon, authenticated
using (
  exists (
    select 1
    from public.styles
    join public.salons on salons.id = styles.salon_id
    where styles.id = style_materials.style_id
      and (
        salons.status in ('New', 'Active')
        or salons.user_id = auth.uid()
        or public.is_admin()
      )
  )
);

drop policy if exists style_materials_owner_insert on public.style_materials;
create policy style_materials_owner_insert
on public.style_materials for insert
to authenticated
with check (public.owns_style(style_id) or public.is_admin());

drop policy if exists style_materials_owner_update on public.style_materials;
create policy style_materials_owner_update
on public.style_materials for update
to authenticated
using (public.owns_style(style_id) or public.is_admin())
with check (public.owns_style(style_id) or public.is_admin());

drop policy if exists style_materials_owner_delete on public.style_materials;
create policy style_materials_owner_delete
on public.style_materials for delete
to authenticated
using (public.owns_style(style_id) or public.is_admin());

-- Stylists always inherit their salon's ownership boundary.
drop policy if exists stylists_public_read on public.stylists;
create policy stylists_public_read
on public.stylists for select
to anon, authenticated
using (
  exists (
    select 1 from public.salons
    where salons.id = stylists.salon_id
      and (
        salons.status in ('New', 'Active')
        or salons.user_id = auth.uid()
        or public.is_admin()
      )
  )
);

drop policy if exists stylists_owner_insert on public.stylists;
create policy stylists_owner_insert
on public.stylists for insert
to authenticated
with check (public.owns_salon(salon_id) or public.is_admin());

drop policy if exists stylists_owner_update on public.stylists;
create policy stylists_owner_update
on public.stylists for update
to authenticated
using (public.owns_salon(salon_id) or public.is_admin())
with check (public.owns_salon(salon_id) or public.is_admin());

drop policy if exists stylists_owner_delete on public.stylists;
create policy stylists_owner_delete
on public.stylists for delete
to authenticated
using (public.owns_salon(salon_id) or public.is_admin());

-- Customer profiles use the auth user UUID as their primary key.
drop policy if exists customers_self_read on public.customers;
create policy customers_self_read
on public.customers for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists customers_self_insert on public.customers;
create policy customers_self_insert
on public.customers for insert
to authenticated
with check (id = auth.uid() or public.is_admin());

drop policy if exists customers_self_update on public.customers;
create policy customers_self_update
on public.customers for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- Bookings are private to their customer, their salon owner, and admins.
drop policy if exists bookings_participant_read on public.bookings;
create policy bookings_participant_read
on public.bookings for select
to authenticated
using (
  customer_id = auth.uid()
  or public.owns_salon(salon_id)
  or public.is_admin()
);

drop policy if exists bookings_customer_insert on public.bookings;
create policy bookings_customer_insert
on public.bookings for insert
to authenticated
with check (
  customer_id = auth.uid()
  and deposit_amount = round(estimated_total * 0.10, 2)
  and balance_due = estimated_total - deposit_amount
);

drop policy if exists bookings_admin_update on public.bookings;
create policy bookings_admin_update
on public.bookings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Public reviews exclude moderated removals. Customers may submit only for a
-- completed booking that belongs to them. Salon replies use the narrow RPC
-- below so owners cannot rewrite customer-authored review fields.
drop policy if exists reviews_public_read on public.reviews;
create policy reviews_public_read
on public.reviews for select
to anon, authenticated
using (coalesce(dispute_status, 'None') <> 'Removed' or public.is_admin());

drop policy if exists reviews_customer_insert on public.reviews;
create policy reviews_customer_insert
on public.reviews for insert
to authenticated
with check (
  customer_id = auth.uid()
  and exists (
    select 1 from public.bookings
    where bookings.id = reviews.booking_id
      and bookings.customer_id = auth.uid()
      and bookings.salon_id = reviews.salon_id
      and bookings.status = 'Completed'
  )
);

drop policy if exists reviews_admin_update on public.reviews;
create policy reviews_admin_update
on public.reviews for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists reviews_admin_delete on public.reviews;
create policy reviews_admin_delete
on public.reviews for delete
to authenticated
using (public.is_admin());

create or replace function public.refresh_salon_review_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_salon_id uuid;
  previous_salon_id uuid;
  next_rating numeric;
  next_count integer;
begin
  affected_salon_id := case when tg_op = 'DELETE' then old.salon_id else new.salon_id end;
  previous_salon_id := case when tg_op = 'UPDATE' then old.salon_id else null end;

  select
    coalesce(avg(rating_overall), 0),
    count(*)::integer
  into next_rating, next_count
  from public.reviews
  where salon_id = affected_salon_id
    and coalesce(dispute_status, 'None') <> 'Removed';

  update public.salons
  set rating_overall = round(next_rating, 2),
      review_count = next_count
  where id = affected_salon_id;

  if previous_salon_id is not null and previous_salon_id <> affected_salon_id then
    select
      coalesce(avg(rating_overall), 0),
      count(*)::integer
    into next_rating, next_count
    from public.reviews
    where salon_id = previous_salon_id
      and coalesce(dispute_status, 'None') <> 'Removed';

    update public.salons
    set rating_overall = round(next_rating, 2),
        review_count = next_count
    where id = previous_salon_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_refresh_salon_summary on public.reviews;
create trigger reviews_refresh_salon_summary
after insert or update or delete on public.reviews
for each row execute function public.refresh_salon_review_summary();

create or replace function public.reply_to_review(
  target_review_id uuid,
  reply_text text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if length(trim(coalesce(reply_text, ''))) = 0 then
    raise exception 'Reply cannot be empty';
  end if;

  update public.reviews
  set salon_reply = left(trim(reply_text), 2000)
  where id = target_review_id
    and (
      public.is_admin()
      or exists (
        select 1 from public.salons
        where salons.id = reviews.salon_id
          and salons.user_id = auth.uid()
      )
    );

  return found;
end;
$$;

create or replace function public.dispute_review(target_review_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.reviews
  set dispute_status = 'Disputed'
  where id = target_review_id
    and exists (
      select 1 from public.salons
      where salons.id = reviews.salon_id
        and salons.user_id = auth.uid()
    );

  return found;
end;
$$;

revoke all on function public.reply_to_review(uuid, text) from public;
revoke all on function public.dispute_review(uuid) from public;
grant execute on function public.reply_to_review(uuid, text) to authenticated;
grant execute on function public.dispute_review(uuid) to authenticated;

-- Subscriptions are readable by the owning salon; only admins mutate them.
drop policy if exists subscriptions_owner_read on public.subscriptions;
create policy subscriptions_owner_read
on public.subscriptions for select
to authenticated
using (public.owns_salon(salon_id) or public.is_admin());

drop policy if exists subscriptions_admin_write on public.subscriptions;
create policy subscriptions_admin_write
on public.subscriptions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Availability is public for live salons and writable only by the owner/admin.
drop policy if exists availability_public_read on public.availability;
create policy availability_public_read
on public.availability for select
to anon, authenticated
using (
  exists (
    select 1 from public.salons
    where salons.id = availability.salon_id
      and (
        salons.status in ('New', 'Active')
        or salons.user_id = auth.uid()
        or public.is_admin()
      )
  )
);

drop policy if exists availability_owner_insert on public.availability;
create policy availability_owner_insert
on public.availability for insert
to authenticated
with check (public.owns_salon(salon_id) or public.is_admin());

drop policy if exists availability_owner_update on public.availability;
create policy availability_owner_update
on public.availability for update
to authenticated
using (public.owns_salon(salon_id) or public.is_admin())
with check (public.owns_salon(salon_id) or public.is_admin());

drop policy if exists availability_owner_delete on public.availability;
create policy availability_owner_delete
on public.availability for delete
to authenticated
using (public.owns_salon(salon_id) or public.is_admin());

-- Internal identities are never public.
drop policy if exists admin_users_self_read on public.admin_users;
create policy admin_users_self_read
on public.admin_users for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists admin_users_admin_write on public.admin_users;
create policy admin_users_admin_write
on public.admin_users for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Complaints are visible to the affected salon and admins. Customers may log a
-- complaint only for themselves and their own booking.
drop policy if exists complaints_participant_read on public.complaints_log;
create policy complaints_participant_read
on public.complaints_log for select
to authenticated
using (
  customer_id = auth.uid()
  or public.owns_salon(salon_id)
  or public.is_admin()
);

drop policy if exists complaints_customer_insert on public.complaints_log;
create policy complaints_customer_insert
on public.complaints_log for insert
to authenticated
with check (
  customer_id = auth.uid()
  and (
    booking_id is null
    or exists (
      select 1 from public.bookings
      where bookings.id = complaints_log.booking_id
        and bookings.customer_id = auth.uid()
    )
  )
);

drop policy if exists complaints_admin_update on public.complaints_log;
create policy complaints_admin_update
on public.complaints_log for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Public media buckets. Write policies validate ownership using the resource
-- UUID embedded in the object path, e.g. salons/<salon-id>/<file>.
insert into storage.buckets (id, name, public)
values
  ('salon-photos', 'salon-photos', true),
  ('stylist-photos', 'stylist-photos', true),
  ('style-photos', 'style-photos', true),
  ('review-photos', 'review-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists girlz_media_public_read on storage.objects;
create policy girlz_media_public_read
on storage.objects for select
to anon, authenticated
using (bucket_id in ('salon-photos', 'stylist-photos', 'style-photos', 'review-photos'));

drop policy if exists salon_media_owner_insert on storage.objects;
create policy salon_media_owner_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'salon-photos'
  and (storage.foldername(name))[1] = 'salons'
  and public.owns_salon(public.safe_uuid((storage.foldername(name))[2]))
);

drop policy if exists salon_media_owner_update on storage.objects;
create policy salon_media_owner_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'salon-photos'
  and (storage.foldername(name))[1] = 'salons'
  and public.owns_salon(public.safe_uuid((storage.foldername(name))[2]))
)
with check (
  bucket_id = 'salon-photos'
  and (storage.foldername(name))[1] = 'salons'
  and public.owns_salon(public.safe_uuid((storage.foldername(name))[2]))
);

drop policy if exists salon_media_owner_delete on storage.objects;
create policy salon_media_owner_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'salon-photos'
  and (storage.foldername(name))[1] = 'salons'
  and public.owns_salon(public.safe_uuid((storage.foldername(name))[2]))
);

drop policy if exists stylist_media_owner_write on storage.objects;
create policy stylist_media_owner_write
on storage.objects for all
to authenticated
using (
  bucket_id = 'stylist-photos'
  and (storage.foldername(name))[1] = 'stylists'
  and public.owns_stylist(public.safe_uuid((storage.foldername(name))[2]))
)
with check (
  bucket_id = 'stylist-photos'
  and (storage.foldername(name))[1] = 'stylists'
  and public.owns_stylist(public.safe_uuid((storage.foldername(name))[2]))
);

drop policy if exists style_media_owner_write on storage.objects;
create policy style_media_owner_write
on storage.objects for all
to authenticated
using (
  bucket_id = 'style-photos'
  and (storage.foldername(name))[1] = 'styles'
  and public.owns_style(public.safe_uuid((storage.foldername(name))[2]))
)
with check (
  bucket_id = 'style-photos'
  and (storage.foldername(name))[1] = 'styles'
  and public.owns_style(public.safe_uuid((storage.foldername(name))[2]))
);

drop policy if exists review_media_customer_write on storage.objects;
create policy review_media_customer_write
on storage.objects for all
to authenticated
using (
  bucket_id = 'review-photos'
  and (storage.foldername(name))[1] = 'reviews'
  and exists (
    select 1 from public.bookings
    where bookings.id = public.safe_uuid((storage.foldername(name))[2])
      and bookings.customer_id = auth.uid()
      and bookings.status = 'Completed'
  )
)
with check (
  bucket_id = 'review-photos'
  and (storage.foldername(name))[1] = 'reviews'
  and exists (
    select 1 from public.bookings
    where bookings.id = public.safe_uuid((storage.foldername(name))[2])
      and bookings.customer_id = auth.uid()
      and bookings.status = 'Completed'
  )
);

commit;
