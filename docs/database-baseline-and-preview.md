# Database baseline and clean-branch verification

## Why the baseline exists

The prototype's original Supabase project was provisioned manually from the
Girlz Culture database schema document. Repository migration history started
later with `20260710143000_owner_user_id_and_rls.sql`, which alters the eleven
application tables instead of creating them. A data-less preview branch
therefore had no `public.salons` relation to alter.

`20260708120000_canonical_application_schema.sql` now reconstructs the genuine
original prerequisites:

- `salons`
- `stylists`
- `styles`
- `style_materials`
- `customers`
- `bookings`
- `reviews`
- `subscriptions`
- `availability`
- `admin_users`
- `complaints_log`

Later migrations remain responsible for ownership IDs, RLS, dashboards,
content, subscriptions, booking integrity, discovery, localization, media,
monitoring, and all subsequent schema evolution.

## Production behavior

The baseline contains only `CREATE TABLE IF NOT EXISTS` and comments inside a
transaction. It has no `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, or seed insert,
so it cannot replace tables, clear rows, or overwrite populated values.

Production already has the original tables but did not record the baseline in
Supabase migration history. The protected manual migration workflow therefore:

1. links only after the production environment approval;
2. performs a read-only schema dump;
3. refuses to continue unless all eleven tables and 130 prerequisite columns
   are present in the read-only schema dump;
4. records baseline version `20260708120000` as applied with
   `supabase migration repair --status applied`;
5. performs a dry run before any pending continuation migration is executed.

The history repair changes migration metadata only. It does not execute the
baseline or mutate application data. Do not run it manually outside the
protected workflow.

## Clean database test

`npm run verify:database-clean` requires `CLEAN_DATABASE_URL` to point to a
disposable, empty PostgreSQL 17 database. It:

1. refuses a database with existing public relations;
2. installs a test-only stand-in for Supabase-managed Auth, Storage, and roles;
3. executes every repository migration in timestamp order using
   `psql --set ON_ERROR_STOP=1`;
4. checks core and evolved tables, key functions, booking overlap exclusion
   constraints, RLS, and final policies.

The Supabase platform stand-in is under `scripts/sql` and is not a migration.
Pull-request CI supplies a fresh PostgreSQL 17 service and runs this test.

## Auth configuration

`supabase/config.toml` explicitly preserves:

- verified-email authentication: `enable_confirmations = true`;
- eight-digit email OTPs: `otp_length = 8`.

The file is intentionally minimal. No repository-owned API, Storage, SMS,
provider, redirect, rate-limit, or JWT setting is changed by this correction.
