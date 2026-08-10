begin;

-- Return one exact, server-side snapshot for the Platform Admin Overview.
-- This function intentionally contains no actor parameter: it is callable only
-- by the service_role used after the API has verified the administrator's
-- `overview` permission. Browser roles cannot execute this SECURITY DEFINER
-- function or use it to bypass table RLS.
create or replace function public.platform_admin_overview_metrics()
returns table (
  total_salons bigint,
  active_salons bigint,
  pending_submissions bigint,
  total_customers bigint,
  total_bookings bigint,
  completed_booking_value numeric,
  deposits_collected numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    (
      select count(*)
      from public.salons salon
      where salon.deleted_at is null
    )::bigint as total_salons,
    (
      select count(*)
      from public.salons salon
      where salon.deleted_at is null
        and salon.status = 'Active'
    )::bigint as active_salons,
    (
      select count(*)
      from public.salon_applications application
      where application.status = 'Pending'
        and application.archived_at is null
    )::bigint as pending_submissions,
    (
      select count(*)
      from public.customers
    )::bigint as total_customers,
    (
      select count(*)
      from public.bookings
    )::bigint as total_bookings,
    (
      select coalesce(sum(booking.estimated_total), 0)::numeric
      from public.bookings booking
      where lower(coalesce(booking.status, '')) = 'completed'
    ) as completed_booking_value,
    (
      select coalesce(sum(booking.deposit_amount), 0)::numeric
      from public.bookings booking
      where lower(coalesce(booking.deposit_status, ''))
        in ('paid', 'succeeded', 'complete', 'completed')
        and booking.payment_verified_at is not null
    ) as deposits_collected;
$$;

comment on function public.platform_admin_overview_metrics() is
  'Exact Platform Admin Overview totals. Execution is restricted to service_role after API authorization.';

revoke all on function public.platform_admin_overview_metrics()
  from public, anon, authenticated;
grant execute on function public.platform_admin_overview_metrics()
  to service_role;

update public.engine_settings
set published_value='"20260809130000"'::jsonb,
    draft_value='"20260809130000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst, 'reload schema';

commit;
