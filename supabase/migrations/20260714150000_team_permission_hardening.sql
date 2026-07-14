-- Close the remaining team-access gaps after the base role migration.
-- This migration is additive/idempotent and may be rerun safely.

alter table public.admin_users add column if not exists phone text;
alter table public.salon_team_members add column if not exists phone text;

alter table public.notification_delivery_log
  drop constraint if exists notification_delivery_log_recipient_type_check;
alter table public.notification_delivery_log
  add constraint notification_delivery_log_recipient_type_check
  check (recipient_type in ('salon','customer','stylist'));

-- An invitation does not become authorized database access until the invited
-- person has authenticated and the server has marked the membership Active.
create or replace function public.salon_has_permission(target_salon_id uuid, permission_key text)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.salons s where s.id = target_salon_id and s.user_id = auth.uid())
  or exists (
    select 1 from public.salon_team_members m
    where m.salon_id = target_salon_id and m.user_id = auth.uid() and m.status = 'Active'
      and coalesce((m.permissions ->> permission_key)::boolean, false)
  );
$$;

create or replace function public.salon_team_stylist_id(target_salon_id uuid)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select m.stylist_id from public.salon_team_members m
  where m.salon_id = target_salon_id and m.user_id = auth.uid() and m.status = 'Active' limit 1;
$$;

-- Public listing policies call these helpers too. With no authenticated uid
-- they deterministically return false and expose no row data.
grant execute on function public.salon_has_permission(uuid,text) to anon, authenticated;
grant execute on function public.admin_has_permission(text) to anon, authenticated;

-- Nested style pricing follows the Styles permission.
drop policy if exists style_materials_owner_insert on public.style_materials;
create policy style_materials_owner_insert on public.style_materials for insert to authenticated
with check (
  exists (select 1 from public.styles s where s.id = style_id and public.salon_has_permission(s.salon_id, 'styles'))
  or public.admin_has_permission('salons')
);
drop policy if exists style_materials_owner_update on public.style_materials;
create policy style_materials_owner_update on public.style_materials for update to authenticated
using (
  exists (select 1 from public.styles s where s.id = style_id and public.salon_has_permission(s.salon_id, 'styles'))
  or public.admin_has_permission('salons')
)
with check (
  exists (select 1 from public.styles s where s.id = style_id and public.salon_has_permission(s.salon_id, 'styles'))
  or public.admin_has_permission('salons')
);
drop policy if exists style_materials_owner_delete on public.style_materials;
create policy style_materials_owner_delete on public.style_materials for delete to authenticated
using (
  exists (select 1 from public.styles s where s.id = style_id and public.salon_has_permission(s.salon_id, 'styles'))
  or public.admin_has_permission('salons')
);

-- Product, promotion, subscription, block-out and notification access is now
-- governed by the same explicit section permissions shown in the dashboard.
drop policy if exists salon_products_public_read on public.salon_products;
create policy salon_products_public_read on public.salon_products for select to anon, authenticated
using (is_visible or public.salon_has_permission(salon_id, 'products') or public.admin_has_permission('salons'));
drop policy if exists salon_products_owner_write on public.salon_products;
create policy salon_products_owner_write on public.salon_products for all to authenticated
using (public.salon_has_permission(salon_id, 'products') or public.admin_has_permission('salons'))
with check (public.salon_has_permission(salon_id, 'products') or public.admin_has_permission('salons'));

drop policy if exists salon_promotions_public_read on public.salon_promotions;
create policy salon_promotions_public_read on public.salon_promotions for select to anon, authenticated
using (
  (is_active and public.salon_has_feature(salon_id, 'promotions') and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()))
  or public.salon_has_permission(salon_id, 'promotions')
  or public.admin_has_permission('marketing')
);
drop policy if exists salon_promotions_owner_write on public.salon_promotions;
create policy salon_promotions_owner_write on public.salon_promotions for all to authenticated
using ((public.salon_has_permission(salon_id, 'promotions') and public.salon_has_feature(salon_id, 'promotions')) or public.admin_has_permission('marketing'))
with check ((public.salon_has_permission(salon_id, 'promotions') and public.salon_has_feature(salon_id, 'promotions')) or public.admin_has_permission('marketing'));

drop policy if exists subscriptions_owner_read on public.subscriptions;
create policy subscriptions_owner_read on public.subscriptions for select to authenticated
using (public.salon_has_permission(salon_id, 'subscription') or public.admin_has_permission('subscriptions'));

drop policy if exists reviews_admin_update on public.reviews;
create policy reviews_admin_update on public.reviews for update to authenticated
using (public.admin_has_permission('reviews'))
with check (public.admin_has_permission('reviews'));

drop policy if exists admin_settings_admin_only on public.admin_settings;
create policy admin_settings_admin_only on public.admin_settings for all to authenticated
using (public.admin_has_permission('settings') or public.admin_has_permission('quality'))
with check (public.admin_has_permission('settings') or public.admin_has_permission('quality'));

drop policy if exists salon_blockouts_owner_access on public.salon_blockouts;
create policy salon_blockouts_owner_access on public.salon_blockouts for all to authenticated
using (
  (public.salon_has_permission(salon_id, 'availability') and (public.salon_team_stylist_id(salon_id) is null or stylist_id = public.salon_team_stylist_id(salon_id)))
  or public.admin_has_permission('bookings')
)
with check (
  (public.salon_has_permission(salon_id, 'availability') and (public.salon_team_stylist_id(salon_id) is null or stylist_id = public.salon_team_stylist_id(salon_id)))
  or public.admin_has_permission('bookings')
);

drop policy if exists notifications_recipient_read on public.notifications;
create policy notifications_recipient_read on public.notifications for select to authenticated
using (
  user_id = auth.uid()
  or (public.salon_has_permission(salon_id, 'bookings') and (
    public.salon_team_stylist_id(salon_id) is null
    or exists (select 1 from public.bookings b where b.id = booking_id and b.stylist_id = public.salon_team_stylist_id(salon_id))
  ))
  or public.admin_has_permission('bookings')
);
drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_update on public.notifications for update to authenticated
using (user_id = auth.uid() or public.admin_has_permission('bookings'))
with check (user_id = auth.uid() or public.admin_has_permission('bookings'));

drop policy if exists salon_cancellations_owner_read on public.salon_booking_cancellations;
create policy salon_cancellations_owner_read on public.salon_booking_cancellations for select to authenticated
using (public.salon_has_permission(salon_id, 'bookings') or public.admin_has_permission('bookings'));
drop policy if exists notification_delivery_owner_read on public.notification_delivery_log;
create policy notification_delivery_owner_read on public.notification_delivery_log for select to authenticated
using (
  public.admin_has_permission('bookings') or exists (
    select 1 from public.bookings b
    where b.id = notification_delivery_log.booking_id
      and public.salon_has_permission(b.salon_id, 'bookings')
      and (public.salon_team_stylist_id(b.salon_id) is null or b.stylist_id = public.salon_team_stylist_id(b.salon_id))
  )
);

-- Review replies/disputes use the Reviews permission instead of owner-only checks.
create or replace function public.reply_to_review(target_review_id uuid, reply_text text)
returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  if length(trim(coalesce(reply_text, ''))) = 0 then raise exception 'Reply cannot be empty'; end if;
  update public.reviews
  set salon_reply = left(trim(reply_text), 2000)
  where id = target_review_id
    and (public.admin_has_permission('reviews') or public.salon_has_permission(reviews.salon_id, 'reviews'));
  return found;
end;
$$;

create or replace function public.dispute_review(target_review_id uuid)
returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  update public.reviews
  set dispute_status = 'Disputed'
  where id = target_review_id
    and (public.admin_has_permission('reviews') or public.salon_has_permission(reviews.salon_id, 'reviews'));
  return found;
end;
$$;

-- Storage writes honor the exact salon section and the resource UUID in the path.
drop policy if exists salon_media_owner_insert on storage.objects;
create policy salon_media_owner_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'salon-photos' and (storage.foldername(name))[1] = 'salons'
  and (
    ((storage.foldername(name))[3] = 'products' and public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'products'))
    or ((storage.foldername(name))[3] is distinct from 'products' and (
      public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'photos')
      or public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'my_page')
    ))
    or public.admin_has_permission('salons')
  )
);
drop policy if exists salon_media_owner_update on storage.objects;
create policy salon_media_owner_update on storage.objects for update to authenticated
using (
  bucket_id = 'salon-photos' and (storage.foldername(name))[1] = 'salons' and (
    ((storage.foldername(name))[3] = 'products' and public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'products'))
    or ((storage.foldername(name))[3] is distinct from 'products' and (public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'photos') or public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'my_page')))
    or public.admin_has_permission('salons')
  )
)
with check (
  bucket_id = 'salon-photos' and (storage.foldername(name))[1] = 'salons' and (
    ((storage.foldername(name))[3] = 'products' and public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'products'))
    or ((storage.foldername(name))[3] is distinct from 'products' and (public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'photos') or public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'my_page')))
    or public.admin_has_permission('salons')
  )
);
drop policy if exists salon_media_owner_delete on storage.objects;
create policy salon_media_owner_delete on storage.objects for delete to authenticated using (
  bucket_id = 'salon-photos' and (storage.foldername(name))[1] = 'salons' and (
    ((storage.foldername(name))[3] = 'products' and public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'products'))
    or ((storage.foldername(name))[3] is distinct from 'products' and (public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'photos') or public.salon_has_permission(public.safe_uuid((storage.foldername(name))[2]), 'my_page')))
    or public.admin_has_permission('salons')
  )
);

drop policy if exists style_media_owner_write on storage.objects;
create policy style_media_owner_write on storage.objects for all to authenticated
using (
  bucket_id = 'style-photos' and (storage.foldername(name))[1] = 'styles'
  and (exists (select 1 from public.styles s where s.id = public.safe_uuid((storage.foldername(name))[2]) and public.salon_has_permission(s.salon_id, 'styles')) or public.admin_has_permission('salons'))
)
with check (
  bucket_id = 'style-photos' and (storage.foldername(name))[1] = 'styles'
  and (exists (select 1 from public.styles s where s.id = public.safe_uuid((storage.foldername(name))[2]) and public.salon_has_permission(s.salon_id, 'styles')) or public.admin_has_permission('salons'))
);

drop policy if exists stylist_media_owner_write on storage.objects;
create policy stylist_media_owner_write on storage.objects for all to authenticated
using (
  bucket_id = 'stylist-photos' and (storage.foldername(name))[1] = 'stylists'
  and (exists (select 1 from public.stylists s where s.id = public.safe_uuid((storage.foldername(name))[2]) and (s.user_id = auth.uid() or public.salon_has_permission(s.salon_id, 'stylists'))) or public.admin_has_permission('salons'))
)
with check (
  bucket_id = 'stylist-photos' and (storage.foldername(name))[1] = 'stylists'
  and (exists (select 1 from public.stylists s where s.id = public.safe_uuid((storage.foldername(name))[2]) and (s.user_id = auth.uid() or public.salon_has_permission(s.salon_id, 'stylists'))) or public.admin_has_permission('salons'))
);

-- Create a durable in-app notification for both the salon and the assigned stylist.
create or replace function public.create_booking_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  salon_owner uuid;
  salon_zone text;
  service_name text;
  stylist_name text;
  stylist_user uuid;
  local_time text;
begin
  select user_id, coalesce(time_zone,'America/New_York') into salon_owner, salon_zone from public.salons where id = new.salon_id;
  select name into service_name from public.styles where id = new.style_id;
  select s.name, coalesce(s.user_id, m.user_id) into stylist_name, stylist_user
  from public.stylists s
  left join public.salon_team_members m on m.stylist_id = s.id and m.status = 'Active'
  where s.id = new.stylist_id limit 1;
  local_time := to_char(new.appointment_datetime at time zone salon_zone, 'Mon DD, YYYY at HH12:MI AM');
  insert into public.notifications(user_id, salon_id, booking_id, title, body, action_url, delivery_status)
  values (salon_owner, new.salon_id, new.id, 'New confirmed booking',
    coalesce(new.guest_name,'Customer') || ' booked ' || coalesce(service_name,'a service') || ' for ' || local_time || case when stylist_name is not null then ' with ' || stylist_name else '' end,
    '/salon/dashboard/bookings?booking=' || new.id::text, 'delivered');
  if stylist_user is not null and stylist_user is distinct from salon_owner then
    insert into public.notifications(user_id, salon_id, booking_id, title, body, action_url, delivery_status)
    values (stylist_user, new.salon_id, new.id, 'New appointment assigned to you',
      coalesce(new.guest_name,'Customer') || ' booked ' || coalesce(service_name,'a service') || ' for ' || local_time,
      '/salon/dashboard/bookings?booking=' || new.id::text, 'delivered');
  end if;
  if new.customer_id is not null then
    insert into public.notifications(user_id, salon_id, booking_id, title, body, action_url, delivery_status)
    values (new.customer_id, new.salon_id, new.id, 'Appointment confirmed',
      coalesce(service_name,'Your service') || ' is confirmed for ' || local_time,
      '/account?tab=upcoming', 'delivered');
  end if;
  return new;
end;
$$;

comment on function public.salon_has_permission(uuid,text) is 'Only the salon owner or an activated invited user with the exact section permission is authorized.';
