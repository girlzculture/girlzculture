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
const homepagePromotions = read("src/lib/homepagePromotionServer.ts");
const featuredProducts = read(
  "src/components/public/FeaturedProductPlacement.tsx",
);
const engineConfig = read("src/lib/engineConfigServer.ts");
const layout = read("src/app/layout.tsx");
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
assert.match(
  decisionSearch,
  /affordable\|cheap\|budget\|lowest price\|low cost/,
);
assert.match(
  decisionSearch,
  /best\|best rated\|highest rated\|top rated\|reliable/,
);
assert.match(
  decisionSearch,
  /boundedSearchNumber\(\s*ratingMatch\?\.\[1\],\s*bestIntent \? 3\.9 : null,\s*0,\s*5,\s*\)/,
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
assert.match(discovery, /LocationAutocomplete/);
assert.match(discovery, /placeholder="City, neighborhood, or ZIP"/);
assert.match(discovery, /pendingLocationSearch\.current = true/);
assert.match(discovery, /customerLocation\.setLocation\(next\)/);
assert.match(discovery, /customerLocation\.clearLocation\(\)/);
assert.match(discovery, /Use my location/);
assert.match(discovery, /Filter \(\$\{activeFilterCount\}\)/);
assert.match(discovery, /role="dialog"/);
assert.match(discovery, /Maximum price/);
assert.match(discovery, /Availability date/);
assert.match(discovery, /Active offers only/);
assert.match(discovery, /sessionStorage\.setItem\(STORAGE_KEY/);
assert.match(discovery, /scrollY/);
assert.match(discovery, /Verified marketplace information only/);
assert.match(discovery, /<GoogleSalonMap[\s\S]*?salons=\{salons\}/);
assert.match(discovery, /salons\.map\(\(salon\)/);
assert.doesNotMatch(discovery, /StyleAutocomplete/);

assert.match(salonCard, />\s*View\s*</);
assert.match(salonCard, />\s*Book\s*</);
assert.match(salonCard, />\s*New\s*</);
assert.doesNotMatch(salonCard, /New on Girlz Culture/);
assert.match(salonCard, /MapPin/);
assert.match(salonCard, /Star/);
assert.match(salonCard, /lg:w-\[260px\]/);
assert.match(headerSearch, /placeholder="Search"/);
assert.match(headerSearch, /params\.set\("q", value\)/);
assert.match(headerSearch, /if \(pathname === "\/salons"\) return null/);

assert.doesNotMatch(layout, /text-first\.css/);
assert.match(publicChrome, /from "lucide-react"/);
assert.match(publicChrome, /CustomerBottomNav/);
assert.match(publicChrome, /View favorite salons/);
assert.match(mobileMenu, /Menu, X/);
assert.match(dashboardMenu, /Menu, X/);
assert.match(ownerShell, /View Public Page/);
assert.match(ownerShell, /CalendarDays/);
assert.match(promoRail, /ChevronLeft/);
assert.match(promoRail, /ChevronRight/);
assert.match(promoRail, /aria-label="Previous promotion"/);
assert.match(promoRail, /aria-label="Next promotion"/);
assert.doesNotMatch(promoRail, />\s*Previous\s*</);
assert.doesNotMatch(promoRail, />\s*Next\s*</);
assert.match(promoRail, /w-\[74vw\]/);
assert.match(promoRail, /sm:w-\[52vw\]/);
assert.match(promoRail, /lg:w-\[31vw\]/);
assert.match(homepage, /ArrowRight/);
assert.match(homepage, /CalendarDays/);

assert.match(homepage, /PUBLIC_HOME_SECTION_TIMEOUT_MS = 2_500/);
assert.match(
  homepage,
  /homepage_sections[\s\S]*?abortSignal\(AbortSignal\.timeout\(PUBLIC_HOME_SECTION_TIMEOUT_MS\)\)/,
);
assert.match(homepage, /return \[\] as HomeSection\[\]/);
assert.match(engineConfig, /PUBLIC_ENGINE_READ_TIMEOUT_MS = 2_500/);
assert.match(
  engineConfig,
  /abortSignal\(\s*AbortSignal\.timeout\(PUBLIC_ENGINE_READ_TIMEOUT_MS\)/,
);
assert.match(engineConfig, /return \{\}/);
assert.match(
  homepagePromotions,
  /PUBLIC_PROMOTION_READ_TIMEOUT_MS = 2_500/,
);
assert.match(
  homepagePromotions,
  /abortSignal\(AbortSignal\.timeout\(PUBLIC_PROMOTION_READ_TIMEOUT_MS\)\)/,
);
assert.match(homepagePromotions, /return new Map<string, ResolvedTarget>\(\)/);
assert.match(featuredProducts, /PUBLIC_PRODUCT_READ_TIMEOUT_MS = 2_500/);
assert.equal(
  (
    featuredProducts.match(
      /abortSignal\(AbortSignal\.timeout\(PUBLIC_PRODUCT_READ_TIMEOUT_MS\)\)/g,
    ) || []
  ).length,
  2,
  "Both homepage product reads must have a hard provider deadline.",
);
assert.match(featuredProducts, /return null/);

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

assert.match(migration, /resolve_terminal_booking_notifications/);
assert.match(
  migration,
  /'completed','cancelled','canceled','no-show','no show','resolved'/,
);
assert.match(migration, /read_at=coalesce\(read_at,now\(\)\)/);
assert.match(migration, /category='bookings'/);

console.log(
  "Verified one grounded salon search, a shared persisted location for List and Map, compact mobile controls, restored functional navigation, bounded homepage fallbacks, tab-isolated salon sessions, 200-word profile assistance, enhanced stylist fallback, and actionable-only booking badges.",
);
