-- Editorial content, blog publishing, and richer salon applications.
create table if not exists public.content_pages (
  slug text primary key,
  title text not null,
  eyebrow text,
  hero_title text,
  hero_subtitle text,
  hero_image_url text,
  background_image_url text,
  sections jsonb not null default '[]'::jsonb,
  seo_title text,
  seo_description text,
  status text not null default 'Published' check (status in ('Draft','Published')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  content text not null default '',
  category text not null default 'Braided Styles',
  cover_image_url text,
  author text not null default 'Girlz Culture Editorial',
  featured boolean not null default false,
  status text not null default 'Draft' check (status in ('Draft','Published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.salon_applications add column if not exists logo_url text;
alter table public.salon_applications add column if not exists photo_urls text[] not null default '{}';
alter table public.salon_applications add column if not exists document_urls text[] not null default '{}';
alter table public.salon_applications drop constraint if exists salon_applications_status_check;
alter table public.salon_applications add constraint salon_applications_status_check check (status in ('Pending','Approved','Active','Rejected'));

alter table public.content_pages enable row level security;
alter table public.blog_posts enable row level security;
create policy content_pages_public_read on public.content_pages for select using (status = 'Published' or public.is_admin());
create policy content_pages_admin_write on public.content_pages for all using (public.is_admin()) with check (public.is_admin());
create policy blog_posts_public_read on public.blog_posts for select using (status = 'Published' or public.is_admin());
create policy blog_posts_admin_write on public.blog_posts for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets(id,name,public) values ('content-media','content-media',true),('application-media','application-media',true) on conflict (id) do update set public=excluded.public;
create policy content_media_public_read on storage.objects for select using (bucket_id in ('content-media','application-media'));
create policy content_media_authenticated_upload on storage.objects for insert to authenticated with check (bucket_id in ('content-media','application-media'));
create policy content_media_owner_update on storage.objects for update to authenticated using (bucket_id in ('content-media','application-media') and owner_id=auth.uid()::text);
create policy content_media_owner_delete on storage.objects for delete to authenticated using (bucket_id in ('content-media','application-media') and owner_id=auth.uid()::text);

insert into public.content_pages(slug,title,eyebrow,hero_title,hero_subtitle,hero_image_url,sections) values
('about','About Us','ABOUT US','Built for our culture. Backed by purpose.','Girlz Culture connects you with trusted salons specializing in braided styles — celebrating our beauty, our heritage, and our community.','/images/hero-braids.jpg','[{"title":"Our Story","body":"Girlz Culture was born from a simple truth: braided beauty is more than a style — it is a legacy."},{"title":"Our Team. Our Community.","body":"We are beauty lovers, builders, and culture champions creating more than a platform."}]'),
('careers','Careers','CAREERS','Build the future of beauty with us.','Join a passionate team empowering beauty professionals and redefining the braiding experience.','/images/hero-braids.jpg','[{"title":"Why Work With Us","body":"Purpose-driven, inclusive, growing, and built around meaningful impact."}]'),
('press','Press','PRESS','In the News','See how Girlz Culture is redefining the future of beauty and empowering salons and clients everywhere.','/images/braids-knotless.jpg','[{"title":"Press Contact","body":"press@girlzculture.com · (646) 555-0198"}]')
on conflict (slug) do nothing;

insert into public.blog_posts(slug,title,excerpt,content,category,cover_image_url,featured,status,published_at) values
('ultimate-guide-to-knotless-braids','The Ultimate Guide to Knotless Braids','Everything you need to know about knotless braids—benefits, prep, maintenance, and how to make your style last longer.','Knotless braids have become one of the most requested styles—and for good reason. They are lightweight, protective, and versatile.\n\n### Why they work\nThe feed-in technique reduces tension while creating a natural finish.\n\n### Before your appointment\nArrive with detangled hair, communicate your desired length, and choose materials that fit your lifestyle.\n\n### Aftercare\nProtect your hair at night, keep your scalp moisturized, and avoid excessive tension.','Hair Care','/images/hero-braids.jpg',true,'Published',now()),
('boho-braids-styles','7 Boho Braids Styles You’ll Love This Season','From boho knotless to goddess braids—explore the most requested looks right now.','Boho braids blend polished technique with soft, free-flowing texture. Explore seven beautiful variations for your next appointment.','Braided Styles','/images/braids-box.jpg',false,'Published',now()),
('healthy-braid-products','Best Products for Healthy Braids','Our top product picks to keep your scalp clean, hydrated, and your braids flawless.','Healthy braids begin with a cared-for scalp. These are the ingredients and routines our community recommends.','Hair Care','/images/salon-warm.jpg',false,'Published',now()),
('scalp-care-101','Scalp Care 101: Tips from the Pros','Healthy hair starts at the root. Here is how to care for your scalp under braids.','A healthy scalp supports healthy protective styling. Learn a simple weekly routine from experienced professionals.','Beauty & Wellness','/images/braids-cornrows.jpg',false,'Published',now())
on conflict (slug) do nothing;
