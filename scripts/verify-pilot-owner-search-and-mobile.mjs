import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const decisionSearch = read("src/lib/decisionSearchServer.ts");
const discovery = read("src/components/public/SalonDiscovery.tsx");
const salonPage = read("src/app/salons/page.tsx");
const salonCard = read("src/components/public/MarketplaceSalonCard.tsx");
const headerSearch = read("src/components/search/HeaderStyleSearch.tsx");
const publicChrome = read("src/components/site/PublicChrome.tsx");
const mobileMenu = read("src/components/site/MobilePublicMenu.tsx");
const ownerShell = read("src/components/owner/OwnerDashboardShell.tsx");
const dashboardMenu = read("src/components/dashboard/DashboardMobileMenu.tsx");
const promoRail = read("src/components/public/HomepagePromoRail.tsx");
const homepage = read("src/app/page.tsx");
const supabase = read("src/lib/supabase.ts");
const descriptionEditor = read(
  "src/components/owner/SalonDescriptionEditor.tsx",
);
const publicDescription = read(
  "src/components/public/ExpandableSalonDescription.tsx",
);
const stylistFallback = read(
  "src/components/public/SalonStylistFallback.tsx",
);
const descriptionDraft = read("src/lib/salonDescriptionDraftServer.ts");
const migration = read(
  "supabase/migrations/20260807020000_authoritative_submission_lifecycle.sql",
);

assert.match(decisionSearch, /function containsPhrase/);
assert.ok(
  decisionSearch.includes(
    "return ` ${haystack} `.includes(` ${normalizedNeedle} `);",
  ),
  "Search must use whole normalized phrases instead of prefix substrings.",
);
assert.match(decisionSearch, /"affordable"/);
assert.match(decisionSearch, /"best rated"/);
assert.match(
  decisionSearch,
  /finiteNumber\(ratingMatch\?\.\[1\], bestIntent \? 3\.9 : null, 0, 5\)/,
);
assert.match(decisionSearch, /price_display_min/);
assert.match(decisionSearch, /promotionApplies/);
assert.match(decisionSearch, /completed_appointments/);
assert.match(decisionSearch, /cancellation_rate_percent/);
assert.match(decisionSearch, /bookingAvailability/);
assert.match(decisionSearch, /sponsored: false/);
assert.doesNotMatch(
  decisionSearch,
  /startsWith\([^)]*affordable|includes\([^)]*\.slice\(0,\s*2\)/,
);

assert.doesNotMatch(salonPage, /BeautyConcierge/);
assert.match(salonPage, /<SalonDiscovery/);
assert.match(discovery, /placeholder="Search"/);
assert.match(discovery, /Filter \(/);
assert.match(discovery, /role="dialog"/);
assert.match(discovery, /Maximum price/);
assert.match(discovery, /Availability date/);
assert.match(discovery, /Active offers only/);
assert.match(discovery, /sessionStorage\.setItem\(STORAGE_KEY/);
assert.match(discovery, /scrollY/);
assert.match(discovery, /Verified marketplace information only/);
assert.match(salonCard, />View</);
assert.match(salonCard, />Book</);
assert.doesNotMatch(salonCard, /lucide-react/);
assert.match(headerSearch, /placeholder="Search"/);
assert.match(headerSearch, /params\.set\("q", value\)/);

for (const [name, source] of [
  ["public chrome", publicChrome],
  ["mobile public menu", mobileMenu],
  ["owner shell", ownerShell],
  ["dashboard mobile menu", dashboardMenu],
  ["promotion rail", promoRail],
  ["homepage", homepage],
  ["salon card", salonCard],
]) {
  assert.doesNotMatch(
    source,
    /from "lucide-react"/,
    `${name} must remain text-first without decorative icon imports`,
  );
}
assert.match(publicChrome, /CustomerBottomNav/);
assert.match(publicChrome, /Favorites/);
assert.match(mobileMenu, /\{open \? "Close" : "Menu"\}/);
assert.match(dashboardMenu, /Navigation/);
assert.match(ownerShell, /View Public Page/);
assert.match(promoRail, />Previous</);
assert.match(promoRail, />Next</);
assert.match(promoRail, /w-\[68vw\]/);

assert.match(supabase, /scope === "salon" \? "session" : "local"/);
assert.match(supabase, /window\.sessionStorage/);
assert.match(supabase, /Amina can/);
assert.match(supabase, /Binta remains/);
assert.match(
  supabase,
  /for \(const storage of \[window\.sessionStorage, window\.localStorage\]\)/,
);

assert.match(descriptionEditor, /200 words/);
assert.match(publicDescription, /const PREVIEW_WORDS = 50/);
assert.match(publicDescription, /const MAX_WORDS = 200/);
assert.match(descriptionDraft, /truthfulFallback/);
assert.match(descriptionDraft, /fallbackUsed: true/);
assert.match(stylistFallback, /Stylist profiles are being prepared/);
assert.match(stylistFallback, /View services and prices/);
assert.doesNotMatch(stylistFallback, /lucide-react/);

assert.match(migration, /resolve_terminal_booking_notifications/);
assert.match(
  migration,
  /'completed','cancelled','canceled','no-show','no show','resolved'/,
);
assert.match(migration, /read_at=coalesce\(read_at,now\(\)\)/);
assert.match(migration, /category='bookings'/);

console.log(
  "Verified one grounded search, compact mobile filtering/cards, text-first navigation, tab-isolated salon sessions, 200-word profile assistance, enhanced stylist fallback, and actionable-only booking badges.",
);
