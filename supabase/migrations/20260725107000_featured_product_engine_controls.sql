-- Featured-product homepage composition controls.
--
-- Forward-only and additive:
-- * Inserts one governed Engine setting when it does not exist.
-- * Does not update salon products, placements, orders, inventory, or customers.
-- * Updates only the expected migration marker used by the Engine health check.

begin;

insert into public.engine_settings(
  setting_key,category,display_name,description,value_type,
  draft_value,published_value,status,impact_level,validation,help_text,
  impact_description,is_public,is_secret_status,sort_order,affected_surfaces
) values (
  'homepage.featured_product_card_count','homepage_composition',
  'Featured product card count',
  'Maximum admin-curated pickup-ready products shown in the homepage carousel.',
  'number','12','12','Published','customer',
  '{"min":1,"max":24,"integer":true}',
  'Product eligibility, ordering, inventory, and placement windows remain controlled in Marketing.',
  'Affects the homepage product query size and responsive carousel length.',
  true,false,25,array['Homepage Featured Products','Marketing Featured Products']
)
on conflict(setting_key) do update set
  display_name=excluded.display_name,
  description=excluded.description,
  validation=excluded.validation,
  help_text=excluded.help_text,
  impact_description=excluded.impact_description,
  affected_surfaces=excluded.affected_surfaces;

update public.engine_settings
set draft_value='"20260725107000"'::jsonb,
    published_value='"20260725107000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

commit;
