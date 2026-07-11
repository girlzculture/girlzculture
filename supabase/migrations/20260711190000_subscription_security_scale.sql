-- Girlz Culture subscription tiers, marketplace visibility, feature gating,
-- security hardening, and scale indexes. Safe to run repeatedly.

begin;

alter table public.salons add column if not exists subscription_status text not null default 'inactive';
alter table public.salons add column if not exists featured_weight integer not null default 0;
alter table public.salon_applications add column if not exists selected_plan text not null default 'Growth';

alter table public.subscriptions add column if not exists price_id text;
alter table public.subscriptions add column if not exists stripe_customer_id text;
alter table public.subscriptions add column if not exists current_period_end timestamptz;
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.subscriptions add column if not exists updated_at timestamptz not null default now();

create table if not exists public.booking_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  style_id uuid not null references public.styles(id) on delete cascade,
  payload jsonb not null,
  total_amount numeric(10,2) not null check (total_amount >= 0),
  deposit_amount numeric(10,2) not null check (deposit_amount >= 0),
  stripe_checkout_session_id text unique,
  booking_id uuid references public.bookings(id) on delete set null,
  status text not null default 'Pending' check (status in ('Pending','Paid','Expired','Failed')),
  expires_at timestamptz not null default (now() + interval '45 minutes'),
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_webhook_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.booking_checkout_intents enable row level security;
alter table public.stripe_webhook_events enable row level security;

create unique index if not exists subscriptions_salon_unique_idx on public.subscriptions(salon_id);
create unique index if not exists subscriptions_stripe_subscription_unique_idx
  on public.subscriptions(stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists subscriptions_status_period_idx on public.subscriptions(status, current_period_end);
create index if not exists salons_marketplace_rank_idx
  on public.salons(status, subscription_status, subscription_tier, rating_overall desc, review_count desc);
create index if not exists salons_location_idx on public.salons(address_state, address_city, neighborhood);
create index if not exists bookings_salon_appointment_idx on public.bookings(salon_id, appointment_datetime desc);
create index if not exists bookings_customer_appointment_idx on public.bookings(customer_id, appointment_datetime desc);
create index if not exists reviews_salon_created_idx on public.reviews(salon_id, created_at desc);
create index if not exists styles_salon_name_idx on public.styles(salon_id, name);
create index if not exists booking_checkout_intents_expiry_idx on public.booking_checkout_intents(status, expires_at);

create or replace function public.plan_rank(plan_name text)
returns integer language sql immutable as $$
  select case lower(trim(coalesce(plan_name, '')))
    when 'premium' then 3
    when 'growth' then 2
    when 'essentials' then 2
    when 'basic' then 1
    else 0
  end;
$$;

create or replace function public.has_active_subscription(target_salon_id uuid)
returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.subscriptions subscription
    where subscription.salon_id = target_salon_id
      and lower(subscription.status) in ('active', 'trialing')
      and (subscription.current_period_end is null or subscription.current_period_end > now())
  );
$$;

create or replace function public.salon_has_feature(target_salon_id uuid, feature_name text)
returns boolean
language sql stable security definer set search_path = public, auth as $$
  select case lower(trim(feature_name))
    when 'basic' then public.has_active_subscription(target_salon_id)
    when 'advanced_analytics' then public.has_active_subscription(target_salon_id) and public.plan_rank(s.subscription_tier) >= 2
    when 'promotions' then public.has_active_subscription(target_salon_id) and public.plan_rank(s.subscription_tier) >= 2
    when 'featured_rotation' then public.has_active_subscription(target_salon_id) and public.plan_rank(s.subscription_tier) >= 2
    when 'premium_badge' then public.has_active_subscription(target_salon_id) and public.plan_rank(s.subscription_tier) >= 3
    when 'priority_support' then public.has_active_subscription(target_salon_id) and public.plan_rank(s.subscription_tier) >= 3
    else false
  end
  from public.salons s where s.id = target_salon_id;
$$;

create or replace function public.is_marketplace_visible(target_salon_id uuid)
returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.salons s
    where s.id = target_salon_id
      and (
        (s.status = 'Active' and public.has_active_subscription(s.id))
        -- Seed/demo profiles remain visible until they are claimed.
        or (s.status = 'New' and s.user_id is null)
        or s.user_id = auth.uid()
        or public.is_admin()
      )
  );
$$;

revoke all on function public.plan_rank(text) from public;
revoke all on function public.has_active_subscription(uuid) from public;
revoke all on function public.salon_has_feature(uuid, text) from public;
revoke all on function public.is_marketplace_visible(uuid) from public;
grant execute on function public.plan_rank(text) to anon, authenticated;
grant execute on function public.has_active_subscription(uuid) to anon, authenticated;
grant execute on function public.salon_has_feature(uuid, text) to anon, authenticated;
grant execute on function public.is_marketplace_visible(uuid) to anon, authenticated;

create or replace function public.protect_salon_platform_fields()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.subscription_tier is distinct from old.subscription_tier
      or new.subscription_status is distinct from old.subscription_status
      or new.featured_weight is distinct from old.featured_weight
      or new.status is distinct from old.status
      or new.verification_status is distinct from old.verification_status then
      raise exception 'Platform-managed salon fields cannot be changed by salon owners';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists salons_protect_platform_fields on public.salons;
create trigger salons_protect_platform_fields before update on public.salons
for each row execute function public.protect_salon_platform_fields();

drop policy if exists salons_public_read on public.salons;
create policy salons_public_read on public.salons for select to anon, authenticated
using (public.is_marketplace_visible(id));

drop policy if exists styles_public_read on public.styles;
create policy styles_public_read on public.styles for select to anon, authenticated
using (public.is_marketplace_visible(salon_id));

drop policy if exists stylists_public_read on public.stylists;
create policy stylists_public_read on public.stylists for select to anon, authenticated
using (public.is_marketplace_visible(salon_id));

drop policy if exists availability_public_read on public.availability;
create policy availability_public_read on public.availability for select to anon, authenticated
using (public.is_marketplace_visible(salon_id));

drop policy if exists salon_products_public_read on public.salon_products;
create policy salon_products_public_read on public.salon_products for select to anon, authenticated
using ((is_visible and public.is_marketplace_visible(salon_id)) or public.owns_salon(salon_id) or public.is_admin());

drop policy if exists salon_promotions_public_read on public.salon_promotions;
create policy salon_promotions_public_read on public.salon_promotions for select to anon, authenticated
using (
  (is_active and public.salon_has_feature(salon_id, 'promotions')
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()))
  or public.owns_salon(salon_id) or public.is_admin()
);

drop policy if exists salon_promotions_owner_write on public.salon_promotions;
create policy salon_promotions_owner_write on public.salon_promotions for all to authenticated
using ((public.owns_salon(salon_id) and public.salon_has_feature(salon_id, 'promotions')) or public.is_admin())
with check ((public.owns_salon(salon_id) and public.salon_has_feature(salon_id, 'promotions')) or public.is_admin());

drop policy if exists style_materials_public_read on public.style_materials;
create policy style_materials_public_read on public.style_materials for select to anon, authenticated
using (exists (select 1 from public.styles where styles.id = style_materials.style_id and public.is_marketplace_visible(styles.salon_id)));

drop policy if exists reviews_public_read on public.reviews;
create policy reviews_public_read on public.reviews for select to anon, authenticated
using ((coalesce(dispute_status,'None') <> 'Removed' and public.is_marketplace_visible(salon_id)) or public.is_admin());

-- Booking creation happens only in the server-side paid checkout webhook.
drop policy if exists bookings_public_insert on public.bookings;
drop policy if exists bookings_customer_insert on public.bookings;

-- Applications are written through the validated server route. Owners retain
-- read access but cannot self-approve or alter application state via PostgREST.
drop policy if exists salon_applications_owner_insert on public.salon_applications;
drop policy if exists salon_applications_owner_update on public.salon_applications;
drop policy if exists salon_applications_admin_write on public.salon_applications;
create policy salon_applications_admin_write on public.salon_applications for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Content media is admin-only; application media is restricted to the user's
-- own top-level folder. This replaces the earlier broad authenticated upload.
drop policy if exists content_media_authenticated_upload on storage.objects;
drop policy if exists content_media_owner_update on storage.objects;
drop policy if exists content_media_owner_delete on storage.objects;

drop policy if exists content_media_admin_insert on storage.objects;
create policy content_media_admin_insert on storage.objects for insert to authenticated
with check (bucket_id = 'content-media' and public.is_admin());
drop policy if exists content_media_admin_update on storage.objects;
create policy content_media_admin_update on storage.objects for update to authenticated
using (bucket_id = 'content-media' and public.is_admin())
with check (bucket_id = 'content-media' and public.is_admin());
drop policy if exists content_media_admin_delete on storage.objects;
create policy content_media_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'content-media' and public.is_admin());

drop policy if exists application_media_owner_insert on storage.objects;
create policy application_media_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'application-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists application_media_owner_update on storage.objects;
create policy application_media_owner_update on storage.objects for update to authenticated
using (bucket_id = 'application-media' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'application-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists application_media_owner_delete on storage.objects;
create policy application_media_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'application-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('application-documents','application-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists application_documents_owner_insert on storage.objects;
create policy application_documents_owner_insert on storage.objects for insert to authenticated
with check (bucket_id='application-documents' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists application_documents_owner_read on storage.objects;
create policy application_documents_owner_read on storage.objects for select to authenticated
using (bucket_id='application-documents' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
drop policy if exists application_documents_owner_delete on storage.objects;
create policy application_documents_owner_delete on storage.objects for delete to authenticated
using (bucket_id='application-documents' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

commit;
