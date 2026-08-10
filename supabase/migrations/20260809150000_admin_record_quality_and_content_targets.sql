-- Exact focused-record quality evidence and bounded Content Management targets.
-- This migration is additive/data preserving. It does not mutate salon,
-- booking, review, complaint, product, campaign, or content rows.

begin;

drop view if exists public.salon_quality_metrics;

create view public.salon_quality_metrics
with (security_invoker = true)
as
with terminal_bookings as (
  select booking.*
  from public.bookings booking
  where lower(coalesce(booking.status, '')) in ('completed', 'cancelled', 'canceled')
    and booking.appointment_datetime >= now() - interval '365 days'
), booking_stats as (
  select
    salon_id,
    count(*)::integer total_bookings,
    count(*) filter (where lower(coalesce(status, '')) = 'completed')::integer completed_bookings,
    count(*) filter (
      where lower(coalesce(status, '')) in ('cancelled', 'canceled')
        and lower(coalesce(cancelled_by, cancellation_initiated_by, '')) = 'salon'
    )::integer salon_cancellations,
    count(*) filter (
      where lower(coalesce(status, '')) = 'completed'
        and service_started_at is not null
    )::integer on_time_measured,
    count(*) filter (
      where lower(coalesce(status, '')) = 'completed'
        and service_started_at is not null
        and service_started_at <= appointment_datetime + interval '15 minutes'
    )::integer on_time_count
  from terminal_bookings
  group by salon_id
), complaint_stats as (
  select complaint.salon_id, count(*)::integer complaint_count
  from public.complaints_log complaint
  where complaint.booking_verified
    and lower(coalesce(complaint.status, '')) not in ('closed', 'resolved')
    and complaint.created_at >= now() - interval '365 days'
  group by complaint.salon_id
), metrics as (
  select
    salon.id salon_id,
    coalesce(stats.total_bookings, 0) total_bookings,
    coalesce(stats.completed_bookings, 0) completed_bookings,
    coalesce(stats.salon_cancellations, 0) salon_cancellations,
    case
      when coalesce(stats.total_bookings, 0) > 0
        then round(stats.salon_cancellations::numeric / stats.total_bookings * 100, 2)
      else 0
    end cancellation_rate_percent,
    coalesce(stats.on_time_measured, 0) on_time_measured,
    case
      when coalesce(stats.on_time_measured, 0) > 0
        then round(stats.on_time_count::numeric / stats.on_time_measured * 100, 2)
    end on_time_rate_percent,
    coalesce(complaints.complaint_count, 0) active_complaints,
    case
      when coalesce(stats.total_bookings, 0) > 0
        then greatest(
          0,
          round(
            (1 - least(coalesce(complaints.complaint_count, 0)::numeric / stats.total_bookings, 1)) * 100,
            2
          )
        )
    end complaint_free_rate_percent,
    salon.rating_overall,
    salon.review_count
  from public.salons salon
  left join booking_stats stats on stats.salon_id = salon.id
  left join complaint_stats complaints on complaints.salon_id = salon.id
)
select
  metrics.*,
  round(
    (
      case when coalesce(review_count, 0) > 0 then least(greatest(rating_overall * 20, 0), 100) * 0.40 else 0 end
      + case when total_bookings > 0 then (100 - cancellation_rate_percent) * 0.30 else 0 end
      + case when on_time_rate_percent is not null then on_time_rate_percent * 0.20 else 0 end
      + case when complaint_free_rate_percent is not null then complaint_free_rate_percent * 0.10 else 0 end
    ) / nullif(
      (case when coalesce(review_count, 0) > 0 then 0.40 else 0 end)
      + (case when total_bookings > 0 then 0.30 else 0 end)
      + (case when on_time_rate_percent is not null then 0.20 else 0 end)
      + (case when complaint_free_rate_percent is not null then 0.10 else 0 end),
      0
    ),
    1
  ) composite_quality_score,
  coalesce(
    (select (value ->> 'salon_cancellation_rate_percent')::numeric
     from public.admin_settings where key = 'quality_thresholds'),
    10
  ) cancellation_threshold_percent,
  now() - interval '365 days' measurement_window_start,
  now() measurement_window_end
from metrics;

revoke all on public.salon_quality_metrics from public, anon, authenticated;
grant select on public.salon_quality_metrics to service_role;

create or replace function public.admin_content_link_targets(
  p_query text default '',
  p_limit integer default 60
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with input as (
    select
      lower(trim(coalesce(p_query, ''))) query,
      least(greatest(coalesce(p_limit, 60), 1), 100) row_limit,
      now() current_time
  ), eligible_salons as (
    select
      salon.id,
      salon.name,
      salon.slug,
      salon.cover_photo_url,
      salon.address_city,
      salon.address_state
    from public.salons salon, input
    where salon.deleted_at is null
      and salon.slug is not null
      and public.is_marketplace_visible(salon.id)
      and (
        input.query = ''
        or lower(coalesce(salon.name, '')) like '%' || input.query || '%'
        or lower(coalesce(salon.address_city, '')) like '%' || input.query || '%'
        or lower(coalesce(salon.address_state, '')) like '%' || input.query || '%'
        or exists (
          select 1
          from public.salon_products product
          where product.salon_id = salon.id
            and product.is_visible
            and lower(coalesce(product.name, '')) like '%' || input.query || '%'
        )
      )
    order by salon.name, salon.id
    limit (select row_limit from input)
  ), salon_targets as (
    select
      'Salon'::text type,
      salon.id,
      null::uuid salon_id,
      salon.name label,
      '/salon/' || salon.slug href,
      coalesce(salon.cover_photo_url, '') media_url,
      concat_ws(', ', nullif(salon.address_city, ''), nullif(salon.address_state, '')) body,
      null::double precision target_latitude,
      null::double precision target_longitude
    from eligible_salons salon
  ), campaign_targets as (
    select
      'Campaign'::text type,
      campaign.id,
      campaign.salon_id,
      salon.name || ' - ' || campaign.status label,
      '/salon/' || salon.slug || '?campaign=' || campaign.id href,
      coalesce(salon.cover_photo_url, '') media_url,
      concat_ws(', ', nullif(salon.address_city, ''), nullif(salon.address_state, '')) body,
      null::double precision target_latitude,
      null::double precision target_longitude
    from public.featured_salon_campaigns campaign
    join eligible_salons salon on salon.id = campaign.salon_id
    left join public.marketing_entitlements entitlement
      on entitlement.id = campaign.entitlement_id
      and entitlement.salon_id = campaign.salon_id
      and entitlement.placement_type = 'Featured Salon'
    cross join input
    where campaign.status in ('Scheduled', 'Active')
      and campaign.ends_at > input.current_time
      and (
        (
          campaign.placement_basis = 'complimentary_admin'
          and campaign.complimentary_approved_by is not null
          and length(trim(coalesce(campaign.complimentary_reason, ''))) >= 5
        )
        or (
          campaign.placement_basis = 'paid'
          and entitlement.placement_type = 'Featured Salon'
          and entitlement.salon_id = campaign.salon_id
          and coalesce(entitlement.status, '') in ('Paid', 'Credited')
          and entitlement.valid_from <= campaign.starts_at
          and (entitlement.valid_until is null or entitlement.valid_until >= campaign.ends_at)
        )
      )
    order by campaign.starts_at, campaign.id
    limit (select row_limit from input)
  ), product_targets as (
    select
      'Product'::text type,
      product.id,
      product.salon_id,
      product.name || ' - ' || salon.name label,
      '/salon/' || salon.slug || '/product/' || product.id href,
      coalesce(product.photo_url, product.images ->> 0, '') media_url,
      ''::text body,
      null::double precision target_latitude,
      null::double precision target_longitude
    from public.salon_products product
    join eligible_salons salon on salon.id = product.salon_id
    cross join input
    where product.is_visible
      and product.product_status = 'Active'
      and product.archived_at is null
      and (input.query = '' or lower(coalesce(product.name, '')) like '%' || input.query || '%')
    order by product.name, product.id
    limit (select row_limit from input)
  ), market_targets as (
    select
      'Market'::text type,
      market.id,
      null::uuid salon_id,
      market.name || ', ' || market.state_code label,
      ''::text href,
      ''::text media_url,
      ''::text body,
      market.center_latitude::double precision target_latitude,
      market.center_longitude::double precision target_longitude
    from public.location_markets market, input
    where market.is_active
      and (
        input.query = ''
        or lower(coalesce(market.name, '')) like '%' || input.query || '%'
        or lower(coalesce(market.state_code, '')) like '%' || input.query || '%'
      )
    order by market.state_code, market.name, market.id
    limit (select row_limit from input)
  ), targets as (
    select * from salon_targets
    union all select * from campaign_targets
    union all select * from product_targets
    union all select * from market_targets
  ), bounded_targets as (
    select *
    from targets
    order by type, label, id
    limit (select row_limit from input)
  )
  select coalesce(jsonb_agg(to_jsonb(bounded_targets) order by type, label, id), '[]'::jsonb)
  from bounded_targets;
$$;

revoke all on function public.admin_content_link_targets(text, integer)
  from public, anon, authenticated;
grant execute on function public.admin_content_link_targets(text, integer)
  to service_role;

update public.engine_settings
set published_value='"20260809150000"'::jsonb,
    draft_value='"20260809150000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst, 'reload schema';

commit;
