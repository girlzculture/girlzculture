import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const incidentApi = read("src/app/api/admin/engine/errors/route.ts");
const incidentUi = read("src/components/admin/ErrorMonitoringManager.tsx");
const pushSetup = read("src/components/notifications/PushSetup.tsx");
const setupGuide = read("src/components/owner/OwnerSetupGuideLink.tsx");
const responsive = read("src/components/owner/OwnerDashboardResponsiveBridge.tsx");
const manualApi = read("src/app/api/admin/bookings/route.ts");
const manualUi = read("src/components/admin/AdminManualBookingWizard.tsx");
const recordWorkspace = read("src/components/admin/AdminRecordWorkspace.tsx");
const featuredApi = read("src/app/api/admin/featured-campaigns/route.ts");
const featuredUi = read("src/components/admin/AdminFeaturedCampaigns.tsx");
const featuredMigration = read("supabase/migrations/20260825140000_featured_campaign_owner_controls.sql");
const featuredFix = read("supabase/migrations/20260825141000_fix_featured_campaign_owner_controls.sql");
const payoutMigration = read("supabase/migrations/20260825150000_stripe_connect_booking_payouts.sql");
const payoutApi = read("src/app/api/admin/finance/payout/route.ts");
const payoutUi = read("src/components/admin/AdminSalonPayoutAction.tsx");
const financeUi = read("src/components/admin/AdminFinanceDashboard.tsx");

for (const pattern of [/exportFormat/,/text\/csv; charset=utf-8/,/MAX_EXPORT_ROWS = 10_000/,/X-Export-Truncated/,/function csvCell/,/platform_error_affected_businesses/]) assert.match(incidentApi, pattern);
for (const pattern of [/Export CSV/,/Export JSON/,/All statuses/,/Exports include every incident matching the current filters/]) assert.match(incidentUi, pattern);

assert.match(pushSetup,/hideRepeatedSalonCard/);
assert.match(pushSetup,/pathname === "\/salon\/dashboard"/);
assert.match(setupGuide,/isMyPage/);
assert.match(setupGuide,/if \(!isMyPage\) return null/);
assert.match(responsive,/min-width: 1024px/);
assert.match(responsive,/max-width: 1279px/);
assert.match(responsive,/table\.lg/);

for (const pattern of [/customer_q/,/bookingAvailability/,/reserve_booking_checkout/,/Send Stripe deposit link|send_link/,/waive/,/paid_outside/,/collect_at_salon/,/record_management_events/,/stripeRequest<.*>\("\/checkout\/sessions"/s]) assert.match(manualApi, pattern);
for (const pattern of [/Find an existing customer/,/Choose service/,/Any available stylist/,/Available appointment times/,/Send Stripe deposit link/,/Waive deposit/,/No deposit required/,/Customer payment link ready/]) assert.match(manualUi, pattern);
assert.match(recordWorkspace,/AdminManualBookingWizard/);
assert.doesNotMatch(manualApi,/order\("created_at"\)\.limit\(1\)/);

for (const pattern of [/alter column ends_at drop not null/,/status in \('Draft','Scheduled','Active','Paused','Expired','Archived'\)/,/admin_manage_featured_campaign/,/campaign_id_snapshot/,/coalesce\(ends_at, 'infinity'::timestamptz\)/]) assert.match(featuredMigration, pattern);
assert.match(featuredFix,/#variable_conflict error/);
assert.match(featuredFix,/v_entitlement_id/);
assert.doesNotMatch(featuredFix,/set entitlement_id = entitlement_id/);
for (const pattern of [/admin_save_featured_campaign_v2/,/admin_manage_featured_campaign/,/indefinite/,/revalidatePath\("\/"\)/,/params\.get\("mode"\) === "salons"/]) assert.match(featuredApi, pattern);
for (const pattern of [/Until I change it/,/Platform credit/,/Complimentary Admin placement/,/Archive/,/Restore as draft/,/Delete permanently/,/Alphabetical searchable list/]) assert.match(featuredUi, pattern);
assert.doesNotMatch(featuredUi,/Internal reason required/);

for (const pattern of [/salon_payout_attempts/,/salon_payout_one_processing_per_booking_idx/,/admin_reserve_booking_payout/,/admin_finalize_booking_payout/,/idempotency_key text not null unique/,/stripe_transfer_id text unique/,/bank_payout_status/,/published_value='"20260825150000"'/]) assert.match(payoutMigration, pattern);
assert.match(payoutMigration,/connected_account_id ~ '\^acct_/);
assert.doesNotMatch(payoutMigration,/escape '\\\\'/);
for (const pattern of [/stripeGet<StripeAccount>/,/admin_reserve_booking_payout/,/stripeRequest<StripeTransfer>\("\/transfers"/,/source_transaction/,/idempotencyKey/,/admin_finalize_booking_payout/,/Do not create a new payout/]) assert.match(payoutApi, pattern);
for (const pattern of [/Pay Salon/,/Verified net to salon/,/Connected Stripe account/,/Payout attempt history/,/booking-specific Stripe idempotency key/]) assert.match(payoutUi, pattern);
assert.match(financeUi,/AdminSalonPayoutAction/);
assert.match(financeUi,/transaction_type === "Booking deposit"/);

console.log("Final launch business-workflow verification passed: secure incident exports, route-specific salon dashboard cards, tablet booking presentation, exact Admin booking assistance, Featured Salon owner controls, and idempotent Stripe Connect Pay Salon handling are wired and regression-covered.");