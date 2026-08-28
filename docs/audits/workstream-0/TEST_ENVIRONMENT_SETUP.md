# Girlz Culture Workstream 0 — Test Environment Setup

**Baseline:** `52af829ae8934a6607c32e1372c55d9f846d2d1b`  
**Package manager:** npm  
**Application:** Next.js 16 / React 19 / TypeScript  
**Important:** This document names configuration variables only. It does not contain secret values.

## 1. Required software

- Node.js 22, matching `netlify.toml` and current CI.
- npm from the Node 22 toolchain.
- PostgreSQL 17 for clean migration verification.
- Git.
- A browser environment supported by Playwright.
- Supabase CLI 2.111.0 for the reviewed production migration workflow.
- Optional Netlify CLI for local platform emulation only when documented and authorized.

## 2. Repository setup

```bash
git clone <authorized repository URL>
cd girlzculture
git checkout audit/workstream-0-current-state   # to review this audit
npm ci
```

For future application work, start from an approved branch based on current `main`, not the audit branch.

Do not modify `package-lock.json` merely to run the audit.

## 3. Environment-variable names

### Core Supabase

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
SUPABASE_PROJECT_ID
```

### Site/runtime

```text
NEXT_PUBLIC_SITE_URL
NEXT_TELEMETRY_DISABLED
APP_RELEASE
APP_ENVIRONMENT
```

### Stripe

```text
STRIPE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
```

The repository currently contains inconsistent subscription price variable names:

```text
.env.example:
STRIPE_PRICE_STARTER
STRIPE_PRICE_GROWTH
STRIPE_PRICE_PREMIUM

runtime plan model:
STRIPE_BASIC_PRICE_ID
STRIPE_GROWTH_PRICE_ID
STRIPE_PREMIUM_PRICE_ID
```

Do not guess which names are correct. Reconcile the plan model first.

### Email

```text
RESEND_API_KEY
RESEND_FROM_EMAIL
```

### SMS

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
```

The sender variable is inconsistent:

```text
.env.example: TWILIO_FROM_NUMBER
runtime sender: TWILIO_PHONE_NUMBER
```

Standardize before SMS acceptance.

### Push

```text
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
NEXT_PUBLIC_VAPID_PUBLIC_KEY
```

Use the exact names required by the current routes/helpers after source confirmation.

### Maps

```text
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
GOOGLE_MAPS_SERVER_KEY
```

### Media

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
CLOUDINARY_NOTIFICATION_SECRET
```

### Jobs/monitoring

The repository contains job and monitoring secret names in `.env.example`, Netlify function code and workflow configuration. Confirm names from current source before setup; never copy production values into local files.

## 4. Local application

```bash
npm run dev
```

Default Next.js development behavior applies unless another port is supplied.

For a production-style local run:

```bash
npm run build
npm run start
```

`prebuild` generates repository metadata before `next build`.

## 5. Database setup

### Disposable clean database

Use PostgreSQL 17 and a database that contains no application objects.

```bash
export CLEAN_DATABASE_URL='postgresql://.../disposable_database'
npm run verify:database-clean
```

The script:

1. refuses a non-empty public schema;
2. creates test-only Supabase prerequisite objects;
3. applies all ordered migrations;
4. runs post-migration assertions;
5. checks concurrent booking/product references;
6. confirms the engine migration marker.

Never point `CLEAN_DATABASE_URL` at production.

### Migration-order check

```bash
npm run verify:migrations
```

### Production migrations

Production migrations must use the protected GitHub workflow and explicit reviewed confirmation. Do not use the SQL Editor or `supabase db push` manually for routine release work.

## 6. Test accounts

Create the non-production test matrix described in `IMPLEMENTATION_DEPENDENCIES.md`:

- customer;
- salon owner;
- salon team;
- stylist;
- permission-scoped support/finance/marketing/engine Admins;
- Super Admin;
- unauthorized/cross-tenant identities.

Use email addresses and phone numbers controlled by the test team. Do not use real customer data.

## 7. Test data

Minimum staging fixtures:

- one active, public, geocoded test salon;
- one owner and one limited team member;
- one stylist;
- one simple active service;
- one availability window;
- one customer;
- one expired and one active promotion;
- one support ticket and complaint;
- one safe incident containing only fake token-shaped values for redaction tests;
- one product/variant only when product-commerce testing is explicitly approved.

Do not seed production.

## 8. Safe payment testing

### Required configuration

- `pk_test_...` publishable key.
- `sk_test_...` secret key.
- test webhook secret.
- connected test salon account.
- test product/price IDs where applicable.
- staging callback URLs.

### Required scenarios

1. booking slot hold;
2. successful test deposit;
3. duplicate submission;
4. webhook retry/idempotency;
5. customer cancellation;
6. salon cancellation;
7. refund;
8. transfer reversal;
9. unresolved/failed provider state;
10. reconciliation.

### Current limitation

The existing checkout is immediate Stripe Checkout payment. Do not describe a 30-minute authorization/capture grace test as passing until that architecture has been approved and implemented.

Never use a real card in automated tests.

## 9. Primary validation commands

### Core

```bash
npm ci
npm run verify:migrations
npx tsc --noEmit
npm run lint
npm run build
npm run test:browser
```

### Repository and release

```bash
npm run verify:repository-metadata
npm run verify:final-completion
npm run audit:inventory
```

### Database and business domains

```bash
npm run verify:database-clean
npm run verify:billing
npm run verify:location
npm run verify:discovery
npm run verify:catalog-management
npm run verify:catalog-spreadsheet
npm run verify:salon-spreadsheet
npm run verify:booking-workflow
npm run verify:booking-references
npm run verify:cancellation-refunds
npm run verify:finance-reconciliation
npm run verify:booking-comms
npm run verify:guest-bookings
npm run verify:rescheduling
npm run verify:timezones
npm run verify:featured
npm run verify:trending
npm run verify:product-commerce
npm run verify:monitoring
npm run verify:monitoring-usability
npm run verify:localization-completion
npm run verify:admin-security
npm run verify:identity
npm run verify:lifecycle
npm run verify:media
npm run verify:media-runtime
```

Run only commands present in the current `package.json`.

## 10. Browser and provider tests

### General browser acceptance

```bash
npm run test:browser
```

The current Playwright configuration starts an acceptance fixture and sets:

```text
GIRLZ_CULTURE_ACCEPTANCE_MODE=true
NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS=true
```

That verifies product behavior against a controlled fixture, not live provider/data acceptance.

### Google provider

```bash
npm run test:google-maps-provider
```

Requires a valid restricted staging Google key and supported staging URL. The baseline release evidence skipped the real provider test.

### Media

```bash
npm run test:media-browser
```

Provider-backed direct-upload testing requires the staging media configuration.

## 11. Accessibility and security

Current commands include design-system, security, CSP, auth and browser checks:

```bash
npm run verify:design-system
npm run verify:production-foundation
npm run verify:admin-security
npm run verify:password-reset-security
npm run verify:hardening
npm audit
npm audit --omit=dev
```

No comprehensive automated accessibility framework or coverage threshold was found. Add one in a later approved workstream rather than modifying dependencies during this audit.

## 12. Current baseline results

From the current baseline CI/release evidence:

| Check | Result |
|---|---|
| `npm ci` | Passed; 498 packages, 0 vulnerabilities, deprecated transitive warnings |
| Migration order | Passed |
| Clean PostgreSQL 17 migration chain | 136 migrations passed |
| Public RLS assertion | 176 policies |
| Concurrent booking references | 1,000 unique |
| Concurrent product references | 1,000 unique |
| TypeScript | Passed |
| ESLint | Passed with 7 warnings |
| Next production build | Passed |
| Route/media cold-start checks | Passed |
| Browser acceptance | 87 passed, 6 skipped |
| Google real-provider browser test | Skipped |
| Dependency audits | 0 vulnerabilities |
| Netlify preview | Passed |
| Production database migration #391 | `verify` and `migrate` passed |
| Netlify production deploy | Ready/published |

## 13. Known test weaknesses

- Many `verify:*` scripts validate source strings and migration patterns rather than executing the full operation.
- No Jest/Vitest-style unit suite or code-coverage threshold was found.
- The browser suite uses a local fixture and placeholder Supabase credentials.
- Provider-dependent tests are skipped when configuration is absent.
- No complete Stripe connected-account provider test evidence was produced.
- No authenticated live-production role sweep was available.
- No load/performance threshold was verified.
- No complete automated accessibility gate was verified.
- Build output reported missing build cache.
- Node emitted module-type warnings for some scripts.
- ESLint reported 7 warnings.

## 14. Staging setup

Before high-risk validation:

1. Create a separate Supabase project/branch.
2. Create a Netlify branch/staging site pointing only to staging Supabase.
3. Configure Stripe test keys and connected test accounts.
4. Configure restricted staging Google Maps key.
5. Configure Resend/Twilio controlled recipients.
6. Configure staging storage/media.
7. set clear `APP_ENVIRONMENT=staging` and release ID.
8. route incidents to a staging filter.
9. seed only sanitized test data.
10. validate database reset/restore.
11. prohibit real notifications, charges and payouts.
12. run all core commands and provider scenarios.

## 15. Safe cleanup

- Drop only the disposable clean database created for testing.
- Remove local `.env` files from the working directory if organizational policy requires; never commit them.
- Delete only staging test records with approved cleanup tools.
- Keep audit and provider evidence.
- Do not delete production rows, audit events or migrations.
- Do not remove historical branches/files during Workstream 0.

## 16. Troubleshooting

### Clean database refuses to run

The database is not empty. Create a new disposable database; do not force the script.

### Google provider test skips/fails

Check API enablement, HTTPS referrer restrictions, staging domain and billing. Do not substitute fixture success.

### SMS reports skipped

Confirm the standardized sender variable name after the configuration defect is fixed. Do not expose the value.

### Stripe returns provider errors

Confirm all keys are test-mode, webhook endpoint and connected test account. Do not switch to live mode to make a test pass.

### Browser acceptance works but live page fails

The acceptance harness is a fixture. Reproduce in provider-backed staging and inspect the correlated Incident Queue reference.

### Netlify build succeeds but production data fails

Check the exact deploy commit, production migration state, environment name/URL pair and provider configuration. Roll back or forward-fix according to the approved runbook.

## Audit-matrix validation procedure

A reviewer should parse the CSV with `utf-8-sig`, assert 620 rows and 21 required columns, require unique IDs and the seven approved classifications, resolve every cited path, reject audit self-citation, require the semantic gate for positive rows, require a direct test for `Complete and correct`, require negative evidence for `Missing`, require risk evidence for `Unsafe`, and compare the PR with `main` to confirm that only six audit files remain.

This validates the audit documents; it does not replace authenticated, provider-backed, financial, accessibility or production acceptance.
