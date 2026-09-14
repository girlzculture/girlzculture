import assert from "node:assert/strict";
import test from "node:test";
import {
  isMarketplacePreviewApi,
  isMarketplacePreviewPage,
} from "../src/lib/marketplaceLaunchCore.ts";
import {
  MARKETPLACE_PREVIEW_TTL_SECONDS,
  issueMarketplacePreviewGrant,
  verifyMarketplacePreviewGrant,
} from "../src/lib/marketplacePreviewGrant.ts";

const fixedNow = Date.parse("2026-09-14T21:00:00.000Z");
const adminUserId = "22000000-0000-4000-8000-000000000001";

test("private preview grants are signed, bounded, and expire", async () => {
  const originalSecret = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = "preview-fixture-secret-with-sufficient-entropy";
  try {
    const issued = await issueMarketplacePreviewGrant(adminUserId, fixedNow);
    assert.equal(
      issued.expiresAt.getTime(),
      fixedNow + MARKETPLACE_PREVIEW_TTL_SECONDS * 1000,
    );
    assert.deepEqual(
      await verifyMarketplacePreviewGrant(issued.value, fixedNow + 1_000),
      { adminUserId, expiresAt: issued.expiresAt },
    );

    const [payload, signature] = issued.value.split(".");
    const replacement = signature.endsWith("A") ? "B" : "A";
    assert.equal(
      await verifyMarketplacePreviewGrant(
        `${payload}.${signature.slice(0, -1)}${replacement}`,
        fixedNow + 1_000,
      ),
      null,
    );
    assert.equal(
      await verifyMarketplacePreviewGrant(
        issued.value,
        fixedNow + MARKETPLACE_PREVIEW_TTL_SECONDS * 1000,
      ),
      null,
    );
  } finally {
    if (originalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = originalSecret;
  }
});

test("private preview is read-only and never opens booking or payment", () => {
  for (const path of [
    "/",
    "/salons",
    "/search",
    "/styles",
    "/featured",
    "/trending",
    "/social",
    "/salon/private-fixture",
  ]) assert.equal(isMarketplacePreviewPage(path), true, path);

  for (const path of [
    "/booking",
    "/pickup",
    "/salon/private-fixture/book",
    "/salon/private-fixture/checkout",
    "/salon/private-fixture/product/private-product",
    "/salon/private-fixture/reserve/private-product",
    "/salon/dashboard",
    "/salon/login",
    "/business/login",
  ]) assert.equal(isMarketplacePreviewPage(path), false, path);

  for (const path of [
    "/api/discovery",
    "/api/search?q=braids",
    "/api/salons/private-fixture",
  ]) assert.equal(isMarketplacePreviewApi(path.split("?")[0], "GET"), true, path);

  for (const [path, method] of [
    ["/api/discovery", "POST"],
    ["/api/concierge", "POST"],
    ["/api/booking-availability", "GET"],
    ["/api/guest/bookings", "GET"],
    ["/api/stripe/booking-checkout", "POST"],
    ["/api/stripe/commerce-checkout", "POST"],
    ["/api/stripe/pickup-reservation", "POST"],
  ]) assert.equal(isMarketplacePreviewApi(path, method), false, `${method} ${path}`);
});
