import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const suggestions = read("src/app/api/search/suggestions/route.ts");
assert.match(suggestions, /Styles/);
assert.match(suggestions, /Salons/);
assert.match(suggestions, /Locations/);
assert.match(suggestions, /Categories/);
assert.match(suggestions, /status.*Active/);
assert.match(suggestions, /is_discoverable/);
assert.doesNotMatch(suggestions, /subscription_tier/);

const autocomplete = read("src/components/search/AutocompleteInputs.tsx");
assert.match(autocomplete, /role="combobox"/);
assert.match(autocomplete, /ArrowDown/);
assert.match(autocomplete, /AbortController/);
assert.match(autocomplete, /No matching styles or salons found/);

const nearby = read("src/components/public/NearbySalonPlacement.tsx");
assert.match(nearby, /api\/discovery\/salons/);
assert.match(nearby, /maxCards=6/);
assert.match(nearby, /limit:\s*String\(Math\.max/);
assert.match(nearby, /No salons are nearby yet/);
assert.doesNotMatch(nearby, /fake|placeholder salon/i);

const cards = read("src/components/public/MarketplaceSalonCard.tsx");
assert.match(cards, /customerLocation\.location/);
assert.match(cards, /bookHref/);
assert.match(cards, /context\.set\("style"/);

const booking = read("src/app/salon/[slug]/book/page.tsx");
assert.match(booking, /Booking unavailable/);
assert.match(booking, /is_discoverable/);
assert.match(booking, /Find another salon/);

console.log("Connected discovery verification passed.");
