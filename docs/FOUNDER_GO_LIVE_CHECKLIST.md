# Girlz Culture pre-launch checklist

The application is configured to remain private from search engines while `NEXT_PUBLIC_ALLOW_INDEXING=false`.

## 1. Apply the Supabase migration

1. Open Supabase Dashboard → SQL Editor → New query.
2. Copy the complete contents of `supabase/migrations/20260711190000_subscription_security_scale.sql`.
3. Run the query once and confirm that it completes without errors.
4. In Storage, confirm the private `application-documents` bucket exists.
5. In Table Editor, confirm `salons` now has `subscription_status` and `featured_weight`, `salon_applications` has `selected_plan`, and `subscriptions` has the Stripe lifecycle columns.

This migration makes an activated salon publicly visible only while its subscription is `active` or `trialing`. Unclaimed seed salons remain visible for design/demo data.

## 2. Configure Stripe test mode

1. In Stripe, turn on **Test mode**.
2. Create three products with recurring monthly prices:
   - Basic — USD $99.50 monthly
   - Growth — USD $129.50 monthly
   - Premium — USD $159.50 monthly
3. Copy each `price_...` ID.
4. In Stripe Workbench → Webhooks, add `https://YOUR-DOMAIN/api/stripe/webhook`.
5. Subscribe the endpoint to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Reveal and copy the endpoint signing secret (`whsec_...`).
7. Copy the test publishable and secret API keys (`pk_test_...` and `sk_test_...`).
8. Add all values listed in the environment-variable section below.
9. Test subscription and booking deposits with Stripe card `4242 4242 4242 4242`, any future expiry, any three-digit CVC, and any postal code.

## 3. Netlify setup

1. Push the current branch to GitHub and connect that repository in Netlify.
2. Build command: `npm run build`.
3. Publish directory: `.next`.
4. The committed `netlify.toml` enables the current Next.js adapter and Node 20.
5. In Project configuration → Environment variables, add the variables below. Mark server secrets as secret values.
6. Add `NETLIFY_NEXT_SKEW_PROTECTION=true`.
7. Deploy and confirm the `.netlify.app` URL works before changing DNS.
8. Domain management → Add a domain → Add a domain you already own. Add both the apex domain and `www`.
9. Wait for Netlify to provision HTTPS. Do not remove `NEXT_PUBLIC_ALLOW_INDEXING=false` yet.

## 4. Cloudflare + GoDaddy DNS (recommended free-tier setup)

Use Cloudflare as the DNS provider, with GoDaddy remaining the registrar.

1. Add the domain to Cloudflare and select the Free plan.
2. Review every imported DNS record, especially MX/TXT records used for email.
3. Cloudflare will provide two nameservers.
4. In GoDaddy → Domain → DNS → Nameservers → Change Nameservers, replace the GoDaddy nameservers with the two Cloudflare nameservers. Do not delete the domain registration.
5. In Cloudflare DNS, create:
   - `A` record: name `@`, value `75.2.60.5`, initially **DNS only**.
   - `CNAME` record: name `www`, value `YOUR-NETLIFY-SITE.netlify.app`, initially **DNS only**.
6. In Netlify, confirm both hostnames show DNS verified and the certificate is active.
7. In Cloudflare SSL/TLS → Overview, choose **Full (strict)**.
8. Turn the `@` and `www` records to **Proxied** only after Netlify HTTPS is active.
9. Enable Always Use HTTPS and Automatic HTTPS Rewrites. Keep Cloudflare's managed DDoS protection and bot protections enabled.

If you do not want Cloudflare yet, keep GoDaddy DNS and add the same `A @ → 75.2.60.5` and `CNAME www → YOUR-NETLIFY-SITE.netlify.app` records directly in GoDaddy.

## 5. Environment variables

Public/client-safe:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=https://YOUR-DOMAIN
NEXT_PUBLIC_ALLOW_INDEXING=false
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Server-only secrets:

```text
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL_DOMAIN=girlzculture.com
ADMIN_MFA_MODE=every_login
MFA_CHALLENGE_TTL_MINUTES=10
MFA_MAX_ATTEMPTS=5
MFA_RESEND_COOLDOWN_SECONDS=60
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_BASIC_PRICE_ID=price_...
STRIPE_GROWTH_PRICE_ID=price_...
STRIPE_PREMIUM_PRICE_ID=price_...
INTERNAL_API_SECRET=<at least 32 random characters>
RESEND_API_KEY=
EMAIL_FROM=Girlz Culture <notifications@YOUR-DOMAIN>
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
NETLIFY_NEXT_SKEW_PROTECTION=true
```

Never prefix service-role, Stripe secret, webhook, internal, Resend, or Twilio secrets with `NEXT_PUBLIC_`.

## 6. Acceptance test

1. Customer: home → styles → salons → salon → booking → Stripe test deposit → confirmation → account → review.
2. Salon: plans → signup → email confirmation → application with chosen plan → submitted screen.
3. Admin: submission appears under its state → approve → activate.
4. Salon: sign in → only Subscription is available → complete Stripe test subscription → dashboard unlocks.
5. Basic: Promotions shows an upgrade prompt and direct database writes are rejected.
6. Growth: Promotions works and the salon ranks above Basic.
7. Premium: Premium badge appears and the salon receives the highest marketplace priority.
8. Cancel the test subscription in Stripe and confirm the dashboard relocks and the salon disappears from public search after the webhook arrives.
9. Install the PWA from the browser and verify `/offline` appears without a connection.
10. Confirm `robots.txt` disallows crawling until the real public launch.

## 7. Real launch later

1. Finish and publish legal terms, privacy, deposit, subscription, and photo-consent content.
2. Replace Stripe test keys/prices/webhook with live-mode values.
3. Run a real low-value internal payment test and refund it.
4. Set `NEXT_PUBLIC_ALLOW_INDEXING=true` and redeploy.
5. Submit the sitemap/search-console properties only after the launch decision.
