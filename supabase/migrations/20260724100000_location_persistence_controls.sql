begin;

insert into public.engine_settings(
  setting_key,
  category,
  display_name,
  description,
  value_type,
  draft_value,
  published_value,
  status,
  impact_level,
  validation,
  help_text,
  impact_description,
  is_public,
  is_secret_status,
  sort_order,
  affected_surfaces
) values (
  'search.location_retention_days',
  'locations_discovery',
  'Saved customer location retention',
  'Number of days a confirmed customer location remains available on the same browser before it expires.',
  'number',
  '30'::jsonb,
  '30'::jsonb,
  'Published',
  'customer',
  '{"min":1,"max":365,"integer":true}'::jsonb,
  'Customers can clear their saved location at any time. Browser permission is not requested again while a valid precise location is retained.',
  'Affects homepage discovery, Find Salons, Browse Styles, the Beauty Concierge, salon profiles and booking.',
  true,
  false,
  20,
  array[
    'Homepage discovery',
    'Find Salons',
    'Browse Styles',
    'Beauty Concierge',
    'Salon profile',
    'Booking'
  ]
)
on conflict(setting_key) do nothing;

commit;
