-- Expanded salon due-diligence application fields.

alter table public.salon_applications
  add column if not exists years_in_operation integer check (years_in_operation is null or years_in_operation between 0 and 150),
  add column if not exists stylist_count integer check (stylist_count is null or stylist_count between 1 and 500),
  add column if not exists website_url text,
  add column if not exists instagram_url text,
  add column if not exists business_license_number text,
  add column if not exists cosmetology_license_number text;
