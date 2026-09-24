# Private fictional demonstration business

These procedures never convert an existing business or customer into sample data. Schema migrations install the controls and procedures but create no demonstration account or business.

## Provision after the protected migration and deployment

1. Create a dedicated, email-confirmed Auth account through the Supabase Admin API using the existing protected server-side credential mechanism. Use a unique address under `private-demo.invalid`, a cryptographically random password, `app_metadata.gc_demo = true`, and `user_metadata.role = salon_owner`. Set `app_metadata.gc_demo_security_email` to the founder-approved private sign-in-code recipient using that same protected Admin API. Never log a password, session, security recipient or provider key. Do not send invitations to fictional addresses.
2. Deliver the login privately to the founder through the approved secure handoff. Never commit it, paste it in a PR/report/chat, or reuse a genuine business account. The founder signs in at `/business/login`; `/salon/dashboard/demo-page` is the private business-page preview. There is no public marketplace URL for this tenant.
3. With the protected service role, insert one new `salons` row bound to that account, `is_demo = true`, a unique sample slug, explicit fictional name, `.invalid` contact email, active simulated Premium entitlement, and `America/New_York` time zone. Omit all Stripe/provider identifiers. The database automatically registers the private tenant and prevents discovery and customer bookings.
4. Invoke `seed_private_demo(salon_id, owner_id, current_date)` once. The procedure is atomic and idempotent. A second call returns `already_seeded` and preserves demonstrated edits. Do not replay migration SQL or temporarily disable constraints to seed.
5. Invoke `check_private_demo(salon_id)` and require `passed = true`. Verify the real authenticated owner workflow before handing over access. Record only non-secret tenant/user IDs and reconciliation results in the release manifest.

The seed contains fourteen reporting months, 28 fictional client cards, six services, four professionals, historical and upcoming bookings, cancellations, no-shows, walk-ins, one real rescheduling revision, blocks, waitlist requests, messages, four retail products, inventory, promotions, private reviews, simulated subscriptions and a reconciled internal finance ledger. Dates are anchored to the seed date. The exact booking count varies with the day of the current month; the checker validates the calculation.

Fictional services use the existing custom-service path with active Engine-managed service groups and categories. They do not depend on exact public master-style names, and provisioning never restores withdrawn styles or modifies the platform catalog. The historical Protective Styles group remains a braiding fallback; current specific groups take precedence. Team specialties still use eligible managed hair-service names. If a required active group is unavailable, the entire seed rolls back with `DEMO_SERVICE_GROUP_REQUIRED`; resolve the configuration before retrying, without disabling catalog validation.

## Demonstration boundaries

- All sample records carry immutable tenant classification. They are excluded from discovery, public reviews and platform metrics. Names and banners identify invented data.
- Cards, cash, deposits, subscriptions, refunds and payouts represent fictional internal records, never bank settlement or an operational payment integration.
- External customer notifications, provider connection storage, payment operations and booking another business are blocked. A workflow that sends an offer or customer message may therefore be unavailable in the demo; do not disable its guard to demonstrate it.
- Standard owner/staff authorization still applies. The demo does not grant platform administration or access to genuine tenants.
- Mandatory owner MFA remains enabled. The server verifies the account owns an `is_demo` business before using its Admin-controlled security email. Only sign-in security codes use that destination; the invented public contact stays unchanged, and customer notifications remain blocked. User-editable metadata cannot configure this destination. Missing delivery configuration fails closed.
- The founder can use the Assistant to ask for the saved-photo count, today's appointments and the price/duration of “Boho braid.” The canonical seeded service is **Boho / Knotless Braids, $210, four hours**. Read current records for counts and dates; never treat a transcript as authoritative.

## Reset, only when explicitly requested

Read the registered tenant's current `seeded_at` through the protected service mechanism. Call `reset_private_demo(salon_id, owner_id, seeded_at, 'RESET PRIVATE DEMO')`. The expected timestamp prevents a stale reset. It refuses an unregistered/genuine tenant or unexpected provider artifacts, resets only this tenant's related sample records, reseeds atomically, and requires reconciliation before commit. Auth identity and password remain unchanged. Verify the return value and `check_private_demo` afterward. Never run a generic table delete or reset production migration history.

## Local release verification

With `CLEAN_DATABASE_URL` pointing to a disposable localhost database containing the complete reviewed schema, run `node scripts/verify-master-build-demo.mjs`. It clones the local database, tests isolation, finance reconciliation, seed idempotence and reset, and removes only its generated clone. This is automated evidence; it does not establish that a founder account was provisioned or that hosted login works.
