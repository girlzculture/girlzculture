-- Editable legal content containers. Legal text is intentionally blank until supplied by counsel.

insert into public.content_pages as existing (slug, title, hero_title, hero_subtitle, sections, page_group, status)
values
  ('terms', 'Terms of Service', 'Terms of Service', '', '[{"type":"text","title":"","body":"","is_visible":true}]'::jsonb, 'Legal', 'Published'),
  ('privacy', 'Privacy Policy', 'Privacy Policy', '', '[{"type":"text","title":"","body":"","is_visible":true}]'::jsonb, 'Legal', 'Published'),
  ('cookie-notice', 'Cookie / Tracking Notice', 'Cookie / Tracking Notice', '', '[{"type":"text","title":"","body":"","is_visible":true}]'::jsonb, 'Legal', 'Published'),
  ('deposit-refund-policy', 'Deposit & Refund Policy', 'Deposit & Refund Policy', '', '[{"type":"text","title":"","body":"","is_visible":true}]'::jsonb, 'Legal', 'Published'),
  ('salon-partner-agreement', 'Salon Partner Agreement', 'Salon Partner Agreement', '', '[{"type":"text","title":"","body":"","is_visible":true}]'::jsonb, 'Legal', 'Published'),
  ('photo-content-consent', 'Photo & Content Consent', 'Photo & Content Consent', '', '[{"type":"text","title":"","body":"","is_visible":true}]'::jsonb, 'Legal', 'Published'),
  ('message-monitoring-disclosure', 'Message Monitoring Disclosure', 'Message Monitoring Disclosure', '', '[{"type":"text","title":"","body":"","is_visible":true}]'::jsonb, 'Legal', 'Published'),
  ('do-not-sell-or-share', 'Do Not Sell or Share My Information', 'Do Not Sell or Share My Information', '', '[{"type":"text","title":"","body":"","is_visible":true}]'::jsonb, 'Legal', 'Published'),
  ('accessibility', 'Accessibility Statement', 'Accessibility Statement', '', '[{"type":"text","title":"","body":"","is_visible":true}]'::jsonb, 'Legal', 'Published'),
  ('community-guidelines', 'Community / Content Guidelines', 'Community / Content Guidelines', '', '[{"type":"text","title":"","body":"","is_visible":true}]'::jsonb, 'Legal', 'Published')
on conflict (slug) do update
set page_group = 'Legal',
    hero_title = case when nullif(existing.hero_title, '') is null then excluded.hero_title else existing.hero_title end,
    sections = case when jsonb_array_length(coalesce(existing.sections, '[]'::jsonb)) = 0 then excluded.sections else existing.sections end,
    updated_at = now();
