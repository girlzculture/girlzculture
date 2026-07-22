-- Repair launch-blocking salon lifecycle triggers and the live admin salon RPC.
-- This migration is intentionally additive/idempotent for reconciled production
-- histories: the original migrations remain recorded and are not replayed.
begin;

-- The production salons latitude/longitude columns are numeric while the RPC
-- contract returns double precision. PostgreSQL will not perform that cast for
-- a RETURNS TABLE function automatically. Repair the stored function body in
-- place without dropping its grants or changing its public signature.
do $$
declare
  v_signature regprocedure;
  v_definition text;
begin
  v_signature := to_regprocedure(
    'public.admin_list_salons(uuid,text,text,uuid,text,text,numeric,boolean,double precision,double precision,double precision,text,text,boolean,text,text,integer,integer)'
  );
  if v_signature is null then
    raise exception 'admin_list_salons expected signature is missing';
  end if;

  select pg_get_functiondef(v_signature) into v_definition;
  if position('f.latitude::double precision' in v_definition) = 0 then
    v_definition := replace(v_definition, 'f.latitude,', 'f.latitude::double precision,');
  end if;
  if position('f.longitude::double precision' in v_definition) = 0 then
    v_definition := replace(v_definition, 'f.longitude,', 'f.longitude::double precision,');
  end if;
  if position('f.latitude::double precision' in v_definition) = 0
     or position('f.longitude::double precision' in v_definition) = 0 then
    raise exception 'admin_list_salons coordinate projection could not be repaired safely';
  end if;
  execute v_definition;
end;
$$;

-- A trigger RECORD is table-shaped. Referencing NEW.salon_id in a CASE branch
-- still fails for public.salons because that field does not exist on that row.
-- Use one trigger function for the parent table and another for child tables.
create or replace function public.refresh_salon_lifecycle_from_salon()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.reconcile_salon_lifecycle(
    coalesce(new.id, old.id),
    null,
    'A required salon profile field changed'
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.refresh_salon_lifecycle_from_child()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.reconcile_salon_lifecycle(
    coalesce(new.salon_id, old.salon_id),
    null,
    format('A required %s record changed', tg_table_name)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists salons_refresh_lifecycle on public.salons;
create trigger salons_refresh_lifecycle
after insert or update of name, description, email, phone, address_street, address_city,
  address_state, address_zip, geocode_status, address_needs_review, latitude, longitude,
  logo_url, cover_photo_url, gallery_photos, hours, subscription_status,
  stripe_account_id, media_consent, owner_is_sole_stylist
on public.salons for each row
when (pg_trigger_depth() = 0)
execute function public.refresh_salon_lifecycle_from_salon();

drop trigger if exists styles_refresh_salon_lifecycle on public.styles;
create trigger styles_refresh_salon_lifecycle
after insert or update or delete on public.styles
for each row execute function public.refresh_salon_lifecycle_from_child();

drop trigger if exists stylists_refresh_salon_lifecycle on public.stylists;
create trigger stylists_refresh_salon_lifecycle
after insert or update or delete on public.stylists
for each row execute function public.refresh_salon_lifecycle_from_child();

drop trigger if exists applications_refresh_salon_lifecycle on public.salon_applications;
create trigger applications_refresh_salon_lifecycle
after insert or update or delete on public.salon_applications
for each row execute function public.refresh_salon_lifecycle_from_child();

drop trigger if exists subscriptions_refresh_salon_lifecycle on public.subscriptions;
create trigger subscriptions_refresh_salon_lifecycle
after insert or update or delete on public.subscriptions
for each row execute function public.refresh_salon_lifecycle_from_child();

drop function if exists public.refresh_salon_lifecycle_trigger();

revoke all on function public.refresh_salon_lifecycle_from_salon() from public, anon, authenticated;
revoke all on function public.refresh_salon_lifecycle_from_child() from public, anon, authenticated;

commit;
