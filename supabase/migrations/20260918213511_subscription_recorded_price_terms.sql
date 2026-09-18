begin;
-- Nullable by design: never backfill an old agreement from today's new-sale
-- catalog. A verified Stripe webhook/confirmed provider response supplies facts.
alter table public.subscriptions add column recurring_price_snapshot jsonb;
alter table public.subscriptions add constraint subscription_recurring_price_snapshot_check check (
 recurring_price_snapshot is null or (
  jsonb_typeof(recurring_price_snapshot)='object'
  and price_id is not null
  and recurring_price_snapshot->>'price_id'=price_id
  and recurring_price_snapshot->>'currency'='usd'
  and recurring_price_snapshot->>'interval'='month'
  and recurring_price_snapshot->'quantity'='1'::jsonb
  and recurring_price_snapshot->'interval_count'='1'::jsonb
  and jsonb_typeof(recurring_price_snapshot->'amount_cents')='number'
  and (recurring_price_snapshot->>'amount_cents') ~ '^[0-9]+$'
  and (recurring_price_snapshot->>'amount_cents')::numeric between 0 and 100000000
  and jsonb_typeof(recurring_price_snapshot->'observed_at')='string'
  and recurring_price_snapshot ?& array['price_id','currency','interval','quantity','interval_count','amount_cents','observed_at']
  and recurring_price_snapshot - array['price_id','currency','interval','quantity','interval_count','amount_cents','observed_at']='{}'::jsonb
 ) is true
);
comment on column public.subscriptions.recurring_price_snapshot is 'Verified provider base monthly price before discounts/tax; null when unknown. Never derive from new-sale plan catalog.';
-- Existing service/admin writes and permission-scoped reads remain authoritative.
update public.engine_settings set published_value='"20260918213511"'::jsonb,draft_value='"20260918213511"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
