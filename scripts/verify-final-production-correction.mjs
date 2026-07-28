import assert from "node:assert/strict";
import fs from "node:fs";
import { ENGINE_SECTIONS } from "../src/lib/engineManifest.ts";
import { classifyOperationalRoute } from "../src/lib/operationalMonitoringCore.ts";

const read = (file) => fs.readFileSync(file, "utf8");
const exactSections = [
  "Overview",
  "Brand & Design",
  "Pages & Navigation",
  "Content & Wording",
  "Languages & Translations",
  "Salon Setup & Operations",
  "Services & Catalog",
  "Bookings & Cancellations",
  "Payments, Plans & Refunds",
  "Promotions & Campaigns",
  "Locations & Discovery",
  "Notifications & Communications",
  "AI & Automation",
  "Integrations",
  "System Health & Errors",
  "Data Management",
  "Security & Access",
  "Help & Documentation",
];
assert.deepEqual(
  ENGINE_SECTIONS.map((section) => section.label),
  exactSections,
  "Founder-facing Engine sections changed.",
);

const commerceMigration = read(
  "supabase/migrations/20260724170000_product_commerce_and_combined_checkout.sql",
);
for (const contract of [
  "product_inventory_reservations",
  "product_orders",
  "product_order_items",
  "product_order_refunds",
  "product_order_events",
  "product_promotion_redemptions",
  "reserve_combined_checkout",
  "apply_commerce_checkout_tax",
  "release_combined_checkout",
  "complete_combined_checkout",
  "expire_stale_commerce_checkouts",
  "stripe_tax_calculation_id",
  "payment_mode",
  "for update skip locked",
  "enable row level security",
]) {
  assert.ok(
    commerceMigration.includes(contract),
    `Product commerce contract is missing: ${contract}`,
  );
}
assert.match(
  commerceMigration,
  /revoke all on function public\.reserve_combined_checkout[\s\S]*grant execute on function public\.reserve_combined_checkout[\s\S]*to service_role/,
);
assert.match(
  commerceMigration,
  /insert into public\.product_order_events\([\s\S]*'order_confirmed'/,
);

const checkoutServer = read("src/lib/commerceCheckoutServer.ts");
assert.match(checkoutServer, /STRIPE_TAX_ENABLED/);
assert.match(checkoutServer, /\/tax\/calculations/);
assert.match(checkoutServer, /complete_combined_checkout/);
assert.match(checkoutServer, /deliverOrderReceipt/);

const finance = read("src/components/admin/AdminFinanceDashboard.tsx");
for (const copy of [
  "Money received",
  "Money returned",
  "Money owed",
  "Platform accounting",
  "Transaction ledger",
  "Export filtered CSV",
  "Audit history",
  "Tax calculation",
]) {
  assert.ok(finance.includes(copy), `Finance UI is missing: ${copy}`);
}
for (const column of [
  "Date / time",
  "Reference",
  "Type",
  "Salon",
  "Customer",
  "Gross",
  "Refund",
  "Net owed",
  "Status",
]) {
  assert.ok(finance.includes(`"${column}"`), `Finance column is missing: ${column}`);
}
assert.match(finance, /lg:hidden[\s\S]*View details/);
assert.match(finance, /rows=\{unifiedTransactions\}/);
assert.match(finance, /function TransactionRows[\s\S]*rows\.map/);

const engineUi = read("src/components/admin/EngineControlCenter.tsx");
for (const workflow of [
  "Preview",
  "Save Draft",
  "Review",
  "Publish",
  "Restore",
  "Founder handbook",
  "Open Error Monitoring",
]) {
  assert.ok(engineUi.includes(workflow), `Engine workflow is missing: ${workflow}`);
}
assert.match(engineUi, /ENGINE_SECTIONS\.map/);
assert.match(engineUi, /aria-label="Breadcrumb"/);

const systemStatusRoute = read(
  "src/app/api/admin/engine/system-status/route.ts",
);
const systemStatusUi = read("src/components/admin/SystemStatusManager.tsx");
for (const integration of [
  "database",
  "storage",
  "stripe",
  "email",
  "sms",
  "maps",
  "openai",
  "transcoder",
  "media_cleanup",
  "push",
  "netlify",
  "domains",
]) {
  assert.ok(
    systemStatusRoute.includes(`key: "${integration}"`),
    `Integration status is missing: ${integration}`,
  );
}
assert.match(systemStatusRoute, /export const POST = withOperationalMonitoring/);
assert.match(systemStatusRoute, /integration_health_checks/);
assert.match(systemStatusRoute, /STRIPE_TAX_ENABLED/);
assert.match(systemStatusUi, /Test Connection/);
assert.match(systemStatusUi, /Last checked/);
assert.match(systemStatusUi, /Last success/);
assert.match(systemStatusUi, /Required environment variables/);

const publicReadMigration = read(
  "supabase/migrations/20260724180000_authorized_public_style_catalog.sql",
);
assert.match(
  publicReadMigration,
  /create or replace function public\.list_public_style_catalog/,
);
assert.match(publicReadMigration, /security definer/);
assert.match(publicReadMigration, /public\.is_marketplace_visible\(salons\.id\)/);
assert.match(
  publicReadMigration,
  /revoke all on function public\.list_public_style_catalog\(integer\) from public/,
);
assert.match(
  publicReadMigration,
  /grant execute on function public\.list_public_style_catalog\(integer\)[\s\S]*to anon, authenticated, service_role/,
);
assert.match(
  read("src/app/styles/page.tsx"),
  /\.rpc\("list_public_style_catalog"/,
);

assert.equal(
  classifyOperationalRoute("/api/notifications", "GET"),
  "protected",
);
assert.equal(
  classifyOperationalRoute("/api/notifications", "POST"),
  "protected",
);
assert.equal(
  classifyOperationalRoute("/api/admin/finance/product-refund", "POST"),
  "provider-backed",
);
assert.equal(
  classifyOperationalRoute("/api/stripe/commerce-checkout", "POST"),
  "provider-backed",
);
const notifications = read("src/app/api/notifications/route.ts");
assert.match(notifications, /feature: "dashboard-notification-read"/);
assert.match(notifications, /classification: "protected"/);

console.log(
  "Final production-correction verification passed: P11 commerce/tax/inventory, P12 unified finance, P13 18-section Engine and integration health, and P14 authorized public reads/monitoring classifications are covered by focused executable and source-contract checks.",
);
