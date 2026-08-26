import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const about = read("src/app/about/page.tsx");
const carousel = read("src/components/site/AutoContentCarousel.tsx");
const card = read("src/components/site/PublicContentCard.tsx");
const sections = read("src/components/site/PublicContentSections.tsx");
const layout = read("src/app/layout.tsx");
const liveRefresh = read("src/components/PublicContentLiveRefresh.tsx");
const ownerRealtime = read("src/lib/ownerRealtime.ts");
const ownerShell = read("src/components/owner/OwnerDashboardShell.tsx");
const ownerAlert = read("src/components/owner/OwnerRealtimeAlertBridge.tsx");
const countRoute = read("src/app/api/salon/actionable-booking-count/route.ts");
const focusedContent = read("src/app/admin/content-sections/route.ts");
const promotionCore = read("src/lib/homePromotionCore.ts");
const migration = read(
  "supabase/migrations/20260825120000_public_content_realtime_and_booking_badges.sql",
);

assert.doesNotMatch(
  about,
  /AboutIntro/,
  "The duplicated Our Story component must not render below the About hero.",
);
assert.match(about, /about-additional-content/);
assert.match(about, /middleCards\.slice\(0, 8\)/);
assert.match(about, /lowerCards\.slice\(0, 8\)/);
assert.match(carousel, /requestAnimationFrame/);
assert.match(carousel, /\[\.\.\.visibleCards, \.\.\.visibleCards\]/);
assert.match(carousel, /w-\[46vw\]/);
assert.match(carousel, /inert=/);
assert.match(card, /object-contain sm:object-cover/);
assert.doesNotMatch(card, /SalonDistance/);
assert.match(card, /line-clamp-2/);
assert.match(
  sections,
  /section\.cards\.slice\(0, type === "community_carousel" \? 8 : 12\)/,
);

assert.match(layout, /PublicContentLiveRefresh/);
assert.match(liveRefresh, /public_change_events/);
assert.match(liveRefresh, /router\.refresh\(\)/);
assert.match(ownerRealtime, /\["UPDATE", "DELETE"\]/);
assert.match(ownerRealtime, /gc:owner-booking-update/);
assert.match(ownerRealtime, /gc:owner-notification/);
assert.match(ownerShell, /actionable-booking-count/);
assert.match(ownerShell, /OwnerRealtimeAlertBridge/);
assert.match(ownerAlert, /Notification\.permission === "granted"/);
assert.match(ownerAlert, /navigator\.vibrate/);
assert.match(countRoute, /salon_actionable_booking_count/);

assert.doesNotMatch(focusedContent, /isHomepagePromotionCardComplete/);
assert.match(focusedContent, /sectionWarnings/);
assert.match(focusedContent, /warnings \}/);
assert.match(
  promotionCore,
  /\[card\.title, card\.body, card\.media_url\]\.some/,
);
assert.match(promotionCore, /non-clickable/);

assert.match(
  migration,
  /create table if not exists public\.public_change_events/,
);
assert.match(migration, /alter publication supabase_realtime/);
assert.match(migration, /about-additional-content/);
assert.match(migration, /salon_actionable_booking_count/);
assert.match(migration, /"20260825120000"/);

console.log(
  "Final-launch mobile content, public realtime, and owner booking badge regression verification passed.",
);
