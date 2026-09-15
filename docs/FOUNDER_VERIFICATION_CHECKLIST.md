# Girlz Culture founder verification checklist

Use this checklist after the consolidated production release. Test with a clean
private browser window first, then repeat the highest-risk checks on a phone.
Record the page, time, account type, and full support reference for any failure.

## 1. Public launch boundary and demonstration link

- [ ] `girlzculture.com` shows only the business-onboarding page.
- [ ] The page says Girlz Culture is onboarding beauty and wellness businesses
      as it prepares to launch, and the CTA reads **Join as a business**.
- [ ] `girlzculture.com/site-access` opens the full marketplace homepage.
- [ ] The demonstration notice is visible and states that booking and payment
      are unavailable.
- [ ] Home, Salons, Search, Styles, Featured, Trending, and Social remain inside
      the demonstration experience.
- [ ] Demo salon cards, salon profiles, galleries, services, prices, stylists,
      reviews, promotions, products, maps, and policies render correctly.
- [ ] Booking, favourites, product purchase, pickup reservation, and payment
      actions are disabled in demonstration mode.
- [ ] Entering a booking, checkout, or reservation URL directly does not open a
      transaction.
- [ ] Returning to `girlzculture.com` still shows onboarding, even after using
      the demonstration link.
- [ ] **Exit demonstration** returns to onboarding and ends the demo session.
- [ ] Demo pages are not indexed or cached publicly.

## 2. Business and platform-admin access

- [ ] Business login accepts a known valid owner account and completes MFA.
- [ ] Refreshing an owner-dashboard page preserves the correct signed-in user.
- [ ] Sign out, sign back in, and password recovery all work.
- [ ] Platform-admin login accepts a known valid administrator and completes
      MFA.
- [ ] Refreshing an admin page preserves the admin session and permissions.
- [ ] Owner and admin pages load their workspaces and notifications without a
      401, 403, generic operation error, or repeated login loop.
- [ ] A salon user cannot open another salon's records; a non-admin cannot open
      platform-admin records.

## 3. Application, subscription, onboarding, and publication

- [ ] A new business can submit an application with all required fields.
- [ ] Optional licence/document upload behaves as optional and persists when
      supplied.
- [ ] Admin can approve or reject the application with the correct reason and
      audit record.
- [ ] Approval does not publish an incomplete salon.
- [ ] Subscription checkout uses the intended plan and Stripe test/live mode.
- [ ] The five required discoverability items show accurate completion states.
- [ ] **Finish** activates only a fully eligible salon, unless an authorized
      audited override is deliberately used.
- [ ] Demo/sample salons are explicitly classified or offboarded before the
      global customer marketplace is opened to real traffic.

## 4. Owner dashboard and business data

- [ ] Profile name, description, address, coordinates, hours, contact details,
      social links, booking state, and cover/logo changes persist after a hard
      refresh.
- [ ] Service catalogue supports prices, duration, sizes, lengths, materials,
      add-ons, hair inclusion, photos, drafts, and archive/restore correctly.
- [ ] Numeric inputs reject invalid, negative, infinite, or malformed values.
- [ ] Stylist records, specialties, schedules, avatars, and portfolio photos
      persist and appear on the correct salon profile.
- [ ] Logo, cover, gallery, service, stylist, product, and promotion media show
      the correct image after a hard refresh.
- [ ] Business policies can be drafted, reviewed, published, versioned, and
      displayed publicly; bookings retain the accepted policy snapshot.
- [ ] Calendar availability, blocks, buffers, time zones, manual appointments,
      marketplace bookings, cancellation, and rescheduling behave correctly.
- [ ] Finance totals, fees, deposits, balances, payouts, filters, and CSV exports
      stay scoped to the selected salon.
- [ ] Team invitations and role permissions allow only their stated actions.

## 5. Platform administration

- [ ] Applications, salons, customers, bookings, complaints, support tickets,
      subscriptions, finance, campaigns, and audit history open correctly.
- [ ] Salon lifecycle controls show why a salon is pending, eligible, active,
      paused, or offboarded.
- [ ] Homepage/CMS edits, salon-card controls, navigation, legal content,
      promotions, Featured placements, and Trending media publish as reviewed.
- [ ] Test-data deletion requires explicit registration and dependency review;
      ordinary offboarding preserves financial and audit history.
- [ ] Platform Engine changes preserve drafts, approvals, version history,
      rollback, permissions, and protected audit references.
- [ ] System Status identifies each missing provider configuration without
      exposing credentials.

## 6. Customer booking and commerce before public launch

Run these only in an authorized test environment or after the customer
marketplace is deliberately enabled.

- [ ] Search, location permission, saved location, radius, map/list, filters,
      service matching, price order, ratings, and pagination are accurate.
- [ ] Free and low-price bookings create exactly one appointment and never open
      an unnecessary payment session.
- [ ] Paid deposits open the correct Stripe checkout, and webhook retries do not
      create duplicate bookings or charges.
- [ ] Guest booking, secure manage-booking link, customer account history,
      messages, cancellation, rescheduling, refunds, and public references work.
- [ ] Product cart, pickup reservation, inventory hold/release, fulfilment,
      promotion enforcement, and checkout totals are accurate.
- [ ] Reviews are tied to eligible completed bookings and moderation decisions
      do not invent or erase customer evidence.

## 7. Communications, languages, providers, and operations

- [ ] SMS MFA and fallback email delivery reach the intended business/admin.
- [ ] Transactional email uses the approved sender and domain authentication.
- [ ] Booking, owner, admin, push, and realtime notifications reach only the
      intended recipient and do not duplicate on retries.
- [ ] English, French, Wolof, Spanish, and Simplified Chinese preserve names,
      prices, references, dates, and original message text.
- [ ] Google Maps, Cloudinary media/video processing, Stripe/webhooks, email,
      SMS, Supabase, and Netlify report healthy in production.
- [ ] Errors return a usable support reference that can be correlated with the
      admin incident/log view without displaying private provider details.
- [ ] Mobile, tablet, desktop, landscape, keyboard navigation, contrast, legal
      pages, 404s, PWA installation, offline state, robots, and indexing are
      correct for the current launch phase.

## 8. AI assistants

- [ ] Engine shows a **$25 monthly cap per assistant** (**$50 total**), with
      500 daily Beauty Concierge requests and 25 daily GC Assistant requests.
- [ ] Public Beauty Concierge returns database-verified salon results and uses
      deterministic search whenever provider AI is disabled or unavailable.
- [ ] Owner-facing **GC Assistant** can read only authorized business data.
- [ ] Every suggested change is a structured preview; no change happens until
      the owner explicitly confirms it.
- [ ] Financial, subscription, refund, payout, permission, deletion, and legal
      decisions route to controlled workflows instead of direct AI mutation.
- [ ] Prepared actions enforce fresh identity, salon scope, role permission,
      subscription, validation, and stale-preview checks at confirmation time.
- [ ] Assistant requests, confirmations, safe failures, usage, and cost are
      auditable without storing secrets or unnecessary private content.
- [ ] Provider/model allowlists, daily limits, monthly budgets, timeouts,
      moderation, deterministic fallback, and kill switches are configured and
      tested before either assistant is enabled.
- [ ] Turning on the emergency kill switch immediately returns both assistants
      to their safe fallback without interrupting ordinary platform features.
- [ ] Netlify AI Gateway connectivity is healthy, and the chosen model and
      budget match the founder-approved production configuration.
