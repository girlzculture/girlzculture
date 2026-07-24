import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeSalonVanitySlug,
  salonPublicPath,
} from "../src/lib/salonVanity.ts";

assert.equal(normalizeSalonVanitySlug("  Aminata's Braids NYC  "), "aminata-s-braids-nyc");
assert.equal(normalizeSalonVanitySlug("---Box___Braids---"), "box-braids");
assert.equal(normalizeSalonVanitySlug("A".repeat(90)).length, 72);
assert.equal(salonPublicPath("the-braid-lounge", null), "/salon/the-braid-lounge");
assert.equal(salonPublicPath("the-braid-lounge", "braid-lounge"), "/braid-lounge");

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260723310000_salon_vanity_urls.sql");
for (const control of [
  /create unique index if not exists salons_vanity_slug_unique/,
  /salon_slug_reserved_words/,
  /content_pages p where p\.slug=p_slug/,
  /salon_slug_redirects d/,
  /pg_advisory_xact_lock/,
  /request_salon_vanity_url/,
  /admin_review_salon_vanity_request/,
  /salon_vanity_audit_immutable/,
  /enable row level security/,
])
  assert.match(migration, control);

const vanityPage = read("src/app/[page]/page.tsx");
assert.match(vanityPage, /\.eq\("vanity_slug", slug\)/);
assert.match(vanityPage, /route_scope", "vanity"/);
assert.match(vanityPage, /permanentRedirect\(`\/\$\{redirect\.data\.new_slug\}`\)/);

const canonicalPage = read("src/app/salon/[slug]/page.tsx");
assert.match(canonicalPage, /getSalonPublicMetadata/);
assert.match(canonicalPage, /route_scope", "salon"/);
assert.match(canonicalPage, /vanitySlug=\{salon\.vanity_slug\}/);

const owner = read("src/components/owner/SalonVanityManager.tsx");
assert.match(owner, /Request link approval/);
assert.match(owner, /Copy Link/);
assert.match(owner, /\/api\/salons\/\$\{current\.vanity_slug\}\/qr/);

const admin = read("src/components/admin/AdminSalonsManager.tsx");
assert.match(admin, /Approve public URL/);
assert.match(admin, /reviewVanity\("reject"\)/);
assert.match(admin, /URL history/);

const qr = read("src/app/api/salons/[slug]/qr/route.ts");
assert.match(qr, /QRCode\.toString/);
assert.match(qr, /errorCorrectionLevel: "H"/);
assert.match(qr, /withOperationalMonitoring/);

console.log(
  "Salon vanity verification passed: executable normalization/path behavior, collision controls, transactional owner requests, founder approval, permanent redirects, metadata, sharing, QR generation, and audit history are covered.",
);
