-- PREPARED: execute only after exact-source main CI and protected migrations.
-- Existing identity only; compare-and-set reset, one atomic transaction.
begin isolation level repeatable read;
set local lock_timeout='5s';
-- The full trigger-preserving refresh measured 100-113s locally and exceeded
-- 120s on the hosted database (run 36096048589, SQLSTATE 57014). Allow bounded
-- production execution while retaining the short lock limit and atomic guards.
set local statement_timeout='300s';
set local timezone='America/New_York';
do $$
declare
  v_salon constant uuid='c781503f-dcf0-409c-9ea9-3e5d6638b6e3';
  v_owner constant uuid='2e60809e-e0c5-44fe-8f30-44ef9c993d08';
  v_expected constant timestamptz='2026-09-24 08:39:24.728978+00';
  v_auth text; v_metrics jsonb; v_check jsonb; v_result jsonb;
begin
  if (select count(*) from supabase_migrations.schema_migrations)<>220 then
    raise exception 'REVIEWED_MIGRATION_INVENTORY_CHANGED';
  end if;
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20260924164000')
    or not exists(select 1 from supabase_migrations.schema_migrations where version='20260924125427')
    or not exists(select 1 from supabase_migrations.schema_migrations where version='20260924194000') then
    raise exception 'REVIEWED_MIGRATIONS_NOT_APPLIED';
  end if;
  perform 1 from gc_private.demo_workspaces w join public.salons s on s.id=w.salon_id
    where w.salon_id=v_salon and w.owner_id=v_owner and s.user_id=v_owner and s.is_demo
      and w.seed_version=1 and w.seeded_at=v_expected
      and not s.is_discoverable and not s.accepting_bookings and s.stripe_account_id is null
    for update of w,s;
  if not found then raise exception 'CULTURE_HOUSE_IDENTITY_OR_SEED_CHANGED'; end if;
  if (select count(*) from public.bookings where salon_id=v_salon)<>526 then
    raise exception 'CULTURE_HOUSE_EXISTING_HISTORY_CHANGED';
  end if;
  -- Kept inside the transaction; no credential or derived value is returned.
  select md5(jsonb_build_array(email,encrypted_password,raw_app_meta_data,phone)::text)
    into v_auth from auth.users where id=v_owner for update;
  select to_jsonb(m) into v_metrics from public.platform_admin_overview_metrics() m;
  v_result=public.reset_private_demo(v_salon,v_owner,v_expected,'RESET PRIVATE DEMO');
  v_check=public.check_private_demo(v_salon);
  if (v_check->>'passed')::boolean is distinct from true
    or (v_check->'counts'->>'bookings')::integer<2500
    or (v_check->'counts'->>'clients')::integer<>480
    or (v_result->>'reconciled')::boolean is distinct from true then
    raise exception 'CULTURE_HOUSE_RECONCILIATION_FAILED';
  end if;
  if not exists(select 1 from auth.users where id=v_owner
    and md5(jsonb_build_array(email,encrypted_password,raw_app_meta_data,phone)::text)=v_auth)
    or not exists(select 1 from public.salons where id=v_salon and user_id=v_owner and name='Culture House' and is_demo)
    or not exists(select 1 from gc_private.demo_workspaces where salon_id=v_salon and owner_id=v_owner and seed_version=2)
    then raise exception 'CULTURE_HOUSE_IDENTITY_NOT_PRESERVED'; end if;
  if (select to_jsonb(m) from public.platform_admin_overview_metrics() m) is distinct from v_metrics then
    raise exception 'CULTURE_HOUSE_PLATFORM_TOTALS_CHANGED';
  end if;
end $$;
select public.check_private_demo('c781503f-dcf0-409c-9ea9-3e5d6638b6e3') as reconciliation;
commit;
