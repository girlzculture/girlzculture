# Final launch acceptance migration impact

These migrations are forward-only and must run in chronological order after the
already-applied repository migrations. They are not approved for production by
this pull request. The pull request workflow first executes the complete chain
against an empty PostgreSQL 17 database; the connected Supabase branch must then
execute the same files before browser acceptance.

## Exact order and data impact

1. `20260725100000_unified_launch_brand_tokens.sql`
   - Publishes the founder-approved semantic brand values in existing
     `engine_settings` rows only when a value differs.
   - Updates configuration metadata/version timestamps. It does not change
     uploaded assets or user content.
2. `20260725101000_verified_guest_review_links.sql`
   - Makes `reviews.customer_id` nullable for verified guest submissions, adds
     moderation columns, a one-review-per-booking unique index, secure hashed
     link records, immutable moderation audit records, RLS, and a
     service-role-only atomic submission function.
   - Does not insert, rewrite, hide, or delete an existing review. The unique
     index intentionally stops if pre-existing duplicate booking reviews need
     human reconciliation.
3. `20260725102000_compact_booking_references.sql`
   - Replaces only the public-reference formatter and removes hyphens from
     existing legacy `GC-A-01`-shaped booking references (`GCA01`).
   - UUIDs, authorization, relationships, dates, payment values, and booking
     status are unchanged. The transformation is one-to-one.
4. `20260725103000_availability_performance_indexes.sql`
   - Adds seven partial/range indexes for active bookings, pending checkout
     holds, customer/email conflict checks, stylist checks, and blockouts.
   - Does not insert or update application rows.
5. `20260725104000_authoritative_booking_finance.sql`
   - Adds authoritative finance fields, recovery-balance and immutable
     financial-event tables, RLS, indexes, and reconciliation/event triggers.
   - Reconciles existing bookings that are paid, canceled, or have refund
     evidence. It corrects contradictory display fields (`financial_status`,
     `transfer_status`, `payout_status`, and `net_amount_owed_salon`) from
     existing evidence; it does not create a Stripe refund/transfer or alter an
     original deposit/refund amount.
6. `20260725105000_pickup_reservations_and_featured_products.sql`
   - Adds nullable/defaulted pickup lifecycle fields to existing commerce/order
     tables, atomic service-role reservation/complete functions, placement and
     placement-audit tables, RLS, the homepage section, and three governed
     pickup settings.
   - Existing orders receive safe defaults (`legacy_purchase`, zero pickup
     amounts, null reservation status) and are not reclassified as pickup
     reservations. Existing inventory is not changed.
7. `20260725106000_pickup_reservation_operations.sql`
   - Adds `customer_cancellation` as a supported refund reason, a partial
     uniqueness index, and service-role-only lifecycle/placement functions.
   - Does not execute those functions or rewrite existing rows.
8. `20260725107000_featured_product_engine_controls.sql`
   - Inserts the governed homepage Featured Product card-count setting if
     absent and advances the expected-migration health marker.
   - Does not update products, placements, inventory, orders, or customer data.

## Read-only pre-apply preview SQL

Run this against a Preview branch or against production in a read-only query
window before any later approved production migration run:

```sql
select 'brand settings that would change' as check_name, count(*)::bigint as affected
from public.engine_settings setting
join (
  values
    ('branding.primary_color','"#0083A6"'::jsonb),
    ('branding.cta_color','"#0083A6"'::jsonb),
    ('branding.page_background','"#FFFFFF"'::jsonb),
    ('branding.footer_background','"#0083A6"'::jsonb),
    ('branding.heading_color','"#0D1114"'::jsonb),
    ('branding.body_color','"#0D1114"'::jsonb)
) target(setting_key,target_value)
  on target.setting_key=setting.setting_key
where setting.draft_value is distinct from target.target_value
   or setting.published_value is distinct from target.target_value
union all
select 'booking groups with duplicate existing reviews', count(*)
from (
  select booking_id from public.reviews
  where booking_id is not null group by booking_id having count(*) > 1
) duplicates
union all
select 'legacy booking references to compact', count(*)
from public.bookings
where public_reference ~ '^GC-[A-Z]+-[0-9]{2}$'
union all
select 'bookings whose finance display will be reconciled', count(*)
from public.bookings
where lower(coalesce(refund_status,'')) in ('pending','succeeded','partially refunded')
   or lower(coalesce(status,'')) in ('cancelled','canceled')
   or lower(coalesce(deposit_status,'')) in ('paid','succeeded')
union all
select 'existing commerce intents receiving additive defaults', count(*)
from public.commerce_checkout_intents
union all
select 'existing product orders receiving additive defaults', count(*)
from public.product_orders;
```

After application, the following is read-only verification evidence:

```sql
select published_value
from public.engine_settings
where setting_key='integrations.expected_migration';

select public.booking_public_reference_from_number(1) as first_reference,
       public.booking_public_reference_from_number(100) as next_block,
       public.booking_public_reference_from_number(2575) as after_z;

select indexname
from pg_indexes
where schemaname='public'
  and indexname in (
    'reviews_one_per_booking_idx',
    'bookings_active_stylist_datetime_idx',
    'booking_checkout_intents_pending_stylist_datetime_idx',
    'product_refunds_customer_cancel_unique'
  )
order by indexname;

select tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in (
    'booking_review_links','review_moderation_events',
    'salon_recovery_balances','booking_financial_events',
    'homepage_product_placements','homepage_product_placement_audit'
  )
order by tablename;
```

`scripts/sql/verify-clean-database.sql` additionally asserts functions, grants,
RLS policies, protected review-link storage, availability indexes, Engine
settings, and the repository-head migration marker.
