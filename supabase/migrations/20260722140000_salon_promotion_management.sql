-- Salon-owned promotion management with checkout-safe targeting and immutable audit history.

begin;

alter table public.salon_promotions add column if not exists promotion_type text not null default 'descriptive';
alter table public.salon_promotions add column if not exists discount_value numeric(10,2) not null default 0;
alter table public.salon_promotions add column if not exists status text not null default 'Draft';
alter table public.salon_promotions add column if not exists target_scope text not null default 'salon';
alter table public.salon_promotions add column if not exists target_ids text[] not null default '{}';
alter table public.salon_promotions add column if not exists restrictions jsonb not null default '{}'::jsonb;
alter table public.salon_promotions add column if not exists public_headline text;
alter table public.salon_promotions add column if not exists timezone text not null default 'America/New_York';
alter table public.salon_promotions add column if not exists paused_at timestamptz;

update public.salon_promotions
set status = case when archived_at is not null then 'Archived' when is_active then 'Active' else 'Draft' end,
    promotion_type = case
      when coalesce(discount_label, '') ~* '%' then 'percentage'
      when coalesce(discount_label, '') ~* '\$' then 'fixed'
      else 'descriptive'
    end
where status = 'Draft' and created_at < now();

alter table public.salon_promotions drop constraint if exists salon_promotions_type_check;
alter table public.salon_promotions add constraint salon_promotions_type_check
  check (promotion_type in ('percentage','fixed','free_addon','free_service','descriptive'));
alter table public.salon_promotions drop constraint if exists salon_promotions_status_check;
alter table public.salon_promotions add constraint salon_promotions_status_check
  check (status in ('Draft','Active','Paused','Archived'));
alter table public.salon_promotions drop constraint if exists salon_promotions_target_check;
alter table public.salon_promotions add constraint salon_promotions_target_check
  check (target_scope in ('salon','services','service_groups','master_styles','products','addons'));
alter table public.salon_promotions drop constraint if exists salon_promotions_discount_check;
alter table public.salon_promotions add constraint salon_promotions_discount_check
  check (discount_value >= 0 and (promotion_type <> 'percentage' or discount_value <= 100));
alter table public.salon_promotions drop constraint if exists salon_promotions_dates_check;
alter table public.salon_promotions add constraint salon_promotions_dates_check
  check (ends_at is null or starts_at is null or ends_at > starts_at);

create table if not exists public.salon_promotion_audit (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid references public.salon_promotions(id) on delete set null,
  salon_id uuid references public.salons(id) on delete set null,
  action text not null,
  before_values jsonb,
  after_values jsonb,
  acting_user_id uuid,
  created_at timestamptz not null default now()
);

alter table public.salon_promotion_audit enable row level security;
drop policy if exists salon_promotion_audit_owner_read on public.salon_promotion_audit;
create policy salon_promotion_audit_owner_read on public.salon_promotion_audit for select to authenticated
using (public.owns_salon(salon_id) or public.is_admin());
revoke all on table public.salon_promotion_audit from anon, authenticated;
grant select on table public.salon_promotion_audit to authenticated;

create or replace function public.audit_salon_promotion_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.salon_promotion_audit(promotion_id,salon_id,action,before_values,after_values,acting_user_id)
  values (
    coalesce(new.id, old.id),
    coalesce(new.salon_id, old.salon_id),
    case when tg_op='INSERT' then 'Created' when tg_op='DELETE' then 'Deleted' when new.status is distinct from old.status then new.status else 'Edited' end,
    case when tg_op='INSERT' then null else to_jsonb(old) end,
    case when tg_op='DELETE' then null else to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists salon_promotions_audit_change on public.salon_promotions;
create trigger salon_promotions_audit_change
after insert or update or delete on public.salon_promotions
for each row execute function public.audit_salon_promotion_change();

alter table public.booking_checkout_intents add column if not exists salon_promotion_id uuid references public.salon_promotions(id) on delete set null;
alter table public.booking_checkout_intents add column if not exists promotion_discount_amount numeric(10,2) not null default 0;
alter table public.bookings add column if not exists salon_promotion_id uuid references public.salon_promotions(id) on delete set null;
alter table public.bookings add column if not exists promotion_discount_amount numeric(10,2) not null default 0;
alter table public.bookings add column if not exists subtotal_before_promotion numeric(10,2);

drop policy if exists salon_promotions_public_read on public.salon_promotions;
create policy salon_promotions_public_read on public.salon_promotions for select to anon, authenticated
using (
  (
    status='Active' and is_active=true and archived_at is null
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and exists (
      select 1 from public.salons s
      where s.id=salon_id
        and public.is_marketplace_visible(s.id)
        and public.salon_has_feature(s.id,'promotions')
    )
  )
  or public.owns_salon(salon_id)
  or public.salon_has_permission(salon_id,'promotions')
  or public.admin_has_permission('marketing')
);

create index if not exists salon_promotions_public_window_idx
  on public.salon_promotions(salon_id,status,starts_at,ends_at)
  where archived_at is null and is_active=true;
create index if not exists salon_promotion_audit_promotion_idx on public.salon_promotion_audit(promotion_id,created_at desc);

create or replace function public.prevent_salon_promotion_audit_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  raise exception 'Salon promotion audit records are immutable.' using errcode='42501';
end $$;
revoke all on function public.prevent_salon_promotion_audit_mutation() from public,anon,authenticated;

drop trigger if exists salon_promotion_audit_immutable on public.salon_promotion_audit;
create trigger salon_promotion_audit_immutable
before update or delete on public.salon_promotion_audit
for each row execute function public.prevent_salon_promotion_audit_mutation();

commit;
