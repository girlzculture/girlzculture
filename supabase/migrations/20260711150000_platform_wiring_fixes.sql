-- Fix admin authorization, support intake, newsletter subscriptions, and
-- editable public-service pages. This migration is safe to run more than once.

create extension if not exists pgcrypto;

-- Admin records were historically created by email, while the original helper
-- checked only admin_users.id = auth.uid(). Accept either durable identity.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_users admin_user
    left join auth.users auth_user on auth_user.id = auth.uid()
    where coalesce(admin_user.status, 'Active') = 'Active'
      and (
        admin_user.id = auth.uid()
        or lower(trim(admin_user.email)) = lower(trim(auth_user.email))
      )
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.support_tickets add column if not exists requester_name text;
alter table public.support_tickets add column if not exists requester_email text;
alter table public.support_tickets add column if not exists category text not null default 'General';
alter table public.support_tickets add column if not exists admin_response text;
alter table public.support_tickets add column if not exists responded_at timestamptz;
alter table public.support_tickets add column if not exists responded_by uuid references auth.users(id) on delete set null;

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null default 'footer',
  status text not null default 'Active' check (status in ('Active', 'Unsubscribed')),
  subscribed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists newsletter_subscribers_status_idx
  on public.newsletter_subscribers(status, subscribed_at desc);

alter table public.newsletter_subscribers enable row level security;

drop policy if exists newsletter_subscribers_admin_read on public.newsletter_subscribers;
create policy newsletter_subscribers_admin_read
on public.newsletter_subscribers for select
to authenticated
using (public.is_admin());

drop policy if exists newsletter_subscribers_admin_update on public.newsletter_subscribers;
create policy newsletter_subscribers_admin_update
on public.newsletter_subscribers for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.content_pages(slug, title, eyebrow, hero_title, hero_subtitle, sections, status)
values
  (
    'testimonials',
    'Testimonials',
    'REAL CLIENTS. REAL RESULTS.',
    'Loved by the Girlz Culture community.',
    'Read real stories from clients who found trusted salons, transparent prices, and styles they love.',
    '[{"title":"Jasmine P. - Brooklyn, NY","body":"The booking was simple, the price was clear, and my knotless braids came out beautifully. I finally found a salon I trust."},{"title":"Tiffany M. - Atlanta, GA","body":"I loved seeing real availability and verified reviews before I booked. The whole experience felt premium and easy."},{"title":"Monique D. - Washington, DC","body":"My stylist was professional, on time, and incredibly talented. Girlz Culture took the guesswork out of booking."}]'::jsonb,
    'Published'
  ),
  (
    'help',
    'Help Center',
    'HOW CAN WE HELP?',
    'Answers when you need them.',
    'Search common questions about bookings, payments, accounts, salons, and appointments.',
    '[{"title":"Booking appointments","body":"How do I book an appointment?::Choose a salon and style, select an available stylist and time, review the details, and pay the reservation deposit.\nCan I book without an account?::Yes. Guest booking is available, although an account makes managing appointments easier.\nHow do I reschedule?::Open your booking details and choose Reschedule, subject to the salon availability and policy."},{"title":"Payments and deposits","body":"How much is the deposit?::A non-refundable 10% reservation deposit secures the appointment and is credited toward the total.\nWhen do I pay the balance?::The remaining balance is paid directly to the salon after your service.\nIs payment secure?::Yes. Payment details are handled by secure payment providers and are not stored by Girlz Culture."},{"title":"Trust and safety","body":"Are salons verified?::Salons go through a review process before they are activated on the marketplace.\nWhere do reviews come from?::Verified reviews are connected to completed appointments.\nHow do I report a problem?::Use the Contact Us form and select the category that best matches your concern."}]'::jsonb,
    'Published'
  ),
  (
    'safety',
    'Safety & Trust',
    'BOOK WITH CONFIDENCE',
    'Your safety and trust come first.',
    'We combine verified professionals, transparent pricing, secure booking, and real client reviews.',
    '[{"title":"Verified professionals","body":"Salon applications are reviewed before marketplace activation, and verification status is shown clearly on public profiles."},{"title":"Transparent pricing","body":"Style, material, length, add-on, deposit, and remaining-balance information is shown before confirmation."},{"title":"Real reviews","body":"Reviews tied to completed bookings help clients make informed decisions and help us monitor quality."},{"title":"Support when you need it","body":"Our support team receives and tracks customer concerns through the Girlz Culture support inbox."}]'::jsonb,
    'Published'
  )
on conflict (slug) do nothing;
