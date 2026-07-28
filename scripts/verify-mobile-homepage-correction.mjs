import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REQUIRED_HOMEPAGE_SECTION_KEYS,
  homepageSearchInsertIndex,
  moveHomepageSection,
  normalizeHomepageSectionOrder,
  validateHomepageSectionPublication,
} from "../src/lib/homepageSectionOrderingCore.ts";
import { isPromotionCardActive } from "../src/lib/homePromotionCore.ts";

const root = process.cwd();
const page = readFileSync(`${root}/src/app/page.tsx`, "utf8");
const rail = readFileSync(
  `${root}/src/components/public/HomepagePromoRail.tsx`,
  "utf8",
);
const contentAdmin = readFileSync(
  `${root}/src/components/AdminContentManager.tsx`,
  "utf8",
);
const contentRoute = readFileSync(
  `${root}/src/app/api/admin/content/route.ts`,
  "utf8",
);
const marketingRoute = readFileSync(
  `${root}/src/app/api/admin/marketing/route.ts`,
  "utf8",
);
const mediaRoute = readFileSync(
  `${root}/src/app/api/media/upload/route.ts`,
  "utf8",
);
const mediaServer = readFileSync(
  `${root}/src/lib/mediaUploadServer.ts`,
  "utf8",
);
const migration = readFileSync(
  `${root}/supabase/migrations/20260727210000_mobile_homepage_order_and_promotion_media.sql`,
  "utf8",
);

const defaults = normalizeHomepageSectionOrder([]);
assert.deepEqual(
  defaults.map((row) => row.section_key),
  REQUIRED_HOMEPAGE_SECTION_KEYS,
);
const moved = moveHomepageSection(defaults, "trending_picks", 0);
assert.equal(moved[0].section_key, "trending_picks");
assert.deepEqual(
  moved.map((row) => row.sort_order),
  [1, 2, 3, 4],
);
assert.equal(homepageSearchInsertIndex(defaults), 1);
assert.equal(
  homepageSearchInsertIndex(
    defaults.filter((row) => row.section_key !== "promo_rail"),
  ),
  0,
  "Hiding the optional promotional rail must not hide or displace search.",
);
assert.throws(
  () =>
    validateHomepageSectionPublication([
      defaults[0],
      defaults[0],
      defaults[1],
      defaults[2],
    ]),
  /duplicate or missing/i,
);

const now = Date.parse("2026-07-27T16:00:00Z");
assert.equal(isPromotionCardActive({ status: "Active" }, now), true);
assert.equal(isPromotionCardActive({ status: "Draft" }, now), false);
assert.equal(isPromotionCardActive({ status: "Archived" }, now), false);
assert.equal(
  isPromotionCardActive(
    { status: "Active", starts_at: "2026-07-27T17:00:00Z" },
    now,
  ),
  false,
);
assert.equal(
  isPromotionCardActive(
    { status: "Active", ends_at: "2026-07-27T15:59:59Z" },
    now,
  ),
  false,
);

assert.doesNotMatch(page, /data-home-intro/);
assert.match(page, /data-home-search/);
assert.match(page, /homepageSearchInsertIndex/);
assert.match(page, /searchInsertIndex === homepageSections\.length/);
assert.match(page, /resolvePublishedHomepagePromotions/);
assert.match(rail, /IntersectionObserver/);
assert.match(rail, /visibilitychange/);
assert.match(rail, /prefers-reduced-motion/);
assert.match(rail, /RESUME_AFTER_MS/);
assert.match(rail, /data-promotion-clone/);
assert.match(rail, /hidden items-center justify-end gap-2 lg:flex/);
assert.doesNotMatch(rail, /Automatic movement paused/);

for (const control of [
  "Card title",
  "Card text",
  "Call-to-action label",
  "Destination",
  "Alternative text",
  "Start date and time",
  "End date and time",
  "Draft",
  "Active",
  "Archived",
  "Move card up",
  "Move card down",
  "Paid featured campaign",
  "Specific salon profile",
]) {
  assert.ok(contentAdmin.includes(control), `Missing promotional control: ${control}`);
}
assert.match(contentRoute, /validatePromotionAssociations/);
assert.match(contentRoute, /is_marketplace_visible/);
assert.match(contentRoute, /featured_salon_campaigns/);
assert.match(marketingRoute, /admin_publish_homepage_section_order/);
assert.match(migration, /homepage_sections_unique_position/);
assert.match(migration, /record_management_events/);
assert.match(migration, /resolve_homepage_promotion_target/);
assert.match(migration, /image\/gif/);
assert.match(mediaServer, /GIF87a/);
assert.match(mediaServer, /image\/gif/);
assert.match(mediaRoute, /Binary uploads are no longer accepted/);

console.log(
  "Mobile homepage correction verification passed: authoritative ordering rejects duplicates, promotion schedules are enforced, the promo rail leads every layout without the removed marketing intro, the normal search follows it, and salon/campaign/GIF administration is wired.",
);
