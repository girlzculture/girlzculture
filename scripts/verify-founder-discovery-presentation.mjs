import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const card = read("src/components/public/MarketplaceSalonCard.tsx");
const discovery = read("src/components/public/SalonDiscovery.tsx");
const map = read("src/components/search/GoogleSalonMap.tsx");
const salonsPage = read("src/app/salons/page.tsx");
const salonPage = read("src/app/salon/[slug]/page.tsx");
const salonTrustLabels = read("src/components/public/SalonTrustLabels.tsx");
const reviews = read("src/components/SalonReviews.tsx");
const rating = read("src/components/public/SalonRatingSummary.tsx");

// Result-card identity, price and booking navigation must all describe the
// same resolved service. A salon-wide cheapest price cannot replace it.
assert.match(card, /bookingQuery\.set\("style", salon\.matched_service\.id\)/);
assert.match(
  card,
  /const currentPrice = salon\.matched_service[\s\S]*\? salon\.matched_service\.price[\s\S]*: salon\.starting_price/,
);
assert.match(card, />View pricing<\/span>/);
assert.match(card, /\{salon\.matched_service\.name\}/);
assert.match(card, /href=\{bookHref\}/);
assert.doesNotMatch(card, /bookingQuery\.set\("style", salon\.services\[0\]/);
assert.match(
  salonsPage,
  /const initialServiceIntent = Boolean\([\s\S]*?stringValue\(query\.q\)\.trim\(\)[\s\S]*?\);/,
);
assert.match(salonsPage, /initialServiceIntent=\{initialServiceIntent\}/);
assert.match(
  discovery,
  /initialServiceIntent \? authoritativeServiceRows\(rows\) : rows/,
);

// Honest marketplace signals remain, while invented no-history claims do not.
assert.match(card, />\s*Verified\s*</);
assert.match(card, />\s*Sponsored\s*</);
assert.doesNotMatch(card, /New booking history/);
assert.doesNotMatch(card, />\s*New\s*</);
assert.doesNotMatch(card, /salon\.reliability\?\.label/);

// Map summaries follow the same resolved-service contract as list cards.
assert.match(map, /salon\.matched_service\.name/);
assert.match(
  map,
  /const price = salon\.matched_service[\s\S]*\? salon\.matched_service\.price[\s\S]*: salon\.starting_price \?\? salon\.startingPrice/,
);
assert.match(map, /value === null \|\| value === undefined \|\| value === ""/);
assert.match(map, /bookingParams\.set\("style", salon\.matched_service\.id\)/);
assert.doesNotMatch(map, /reviews\s*>\s*0\s*\?[^\n]*New/);

// The generated/provider summary remains available to assistive technology,
// but is not rendered as promotional or AI-branded visual copy.
assert.match(discovery, /className="sr-only"/);
assert.match(discovery, /Search updated:/);
assert.match(discovery, /Current salon profiles and booking-based reviews\./);
assert.doesNotMatch(discovery, /Verified marketplace information only\./);
assert.doesNotMatch(salonsPage, /AI-powered|AI-assisted|\bAI\b/);

// Verification is data-backed. Unverified profiles do not receive a fallback
// identity pill, while the operational status pill remains independent.
assert.match(
  salonPage,
  /const isVerified = salon\.verification_status\?\.toLowerCase\(\)\.startsWith\("verified"\)/,
);
assert.match(
  salonPage,
  /getEngineText\("trust\.verified_label","Verified Salon",60\)/,
);
assert.match(
  salonPage,
  /<SalonVerificationBadge verified=\{isVerified\} label=\{verifiedLabel\} \/>/,
);
assert.match(salonTrustLabels, /if \(!verified\) return null;/);
assert.match(salonTrustLabels, /data-salon-verification-badge/);
assert.match(salonTrustLabels, /\{label\}/);
assert.match(salonPage, /<Clock3 size=\{14\}\/?>\{statusLabel\}/);
assert.doesNotMatch(salonPage, /isVerified\s*\?[^:]+:\s*["']Salon Profile["']/);

// Empty and populated review states are distinct; a zero-review salon never
// receives a fabricated rating/history label.
assert.match(reviews, />No reviews yet<\/p>/);
assert.match(reviews, /activeReview\.written_review/);
assert.match(rating, /"No reviews yet"/);
assert.match(rating, /reviewCount > 0 && rating > 0/);
assert.doesNotMatch(reviews, />\s*New\s*</);
assert.doesNotMatch(rating, />\s*New\s*</);

console.log(
  "Founder discovery presentation verification passed: resolved-service price/navigation alignment, honest marketplace badges, hidden generated summary, conditional profile verification and truthful review states are wired.",
);
