import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { deterministicContentDecision } from "../src/lib/contentModerationCore.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260804200000_salon_profile_assistance_and_review_safety.sql");
const authoritative = read("supabase/migrations/20260807020000_authoritative_submission_lifecycle.sql");
const cleanDatabaseVerifier = read("scripts/sql/verify-clean-database.sql");
const passwordInput = read("src/components/auth/PasswordInput.tsx");
const passwordSurfaces = [
  "src/components/AdminLogin.tsx",
  "src/components/SalonLogin.tsx",
  "src/components/CustomerAuth.tsx",
  "src/components/SalonSignup.tsx",
  "src/components/PasswordRecovery.tsx",
].map(read);
const publicProfile = read("src/app/salon/[slug]/page.tsx");
const description = read("src/components/public/ExpandableSalonDescription.tsx");
const rating = read("src/components/public/SalonRatingSummary.tsx");
const reviews = read("src/components/SalonReviews.tsx");
const reviewForm = read("src/components/ReviewForm.tsx");
const reviewRoute = read("src/app/api/reviews/[token]/route.ts");
const moderation = read("src/lib/contentModerationServer.ts");
const draftRoute = read("src/app/api/salon/profile/description-draft/route.ts");
const draftServer = read("src/lib/salonDescriptionDraftServer.ts");
const descriptionEditor = read("src/components/owner/SalonDescriptionEditor.tsx");
const profileRoute = read("src/app/api/salon/profile/route.ts");
const fallbackEditor = read("src/components/owner/StylistSectionFallbackEditor.tsx");
const fallbackPublic = read("src/components/public/SalonStylistFallback.tsx");
const setupGuide = read("src/app/salon/setup-guide/page.tsx");
const ownerApp = read("src/components/owner/OwnerDashboardApp.tsx");
const messageRoute = read("src/app/api/messages/route.ts");
const supportRoute = read("src/app/api/support/route.ts");
const complaintRoute = read("src/app/api/complaints/route.ts");
const recordRoute = read("src/app/api/salon/records/save/route.ts");
const supportInbox = read("src/components/AdminSupportInbox.tsx");

function sourceFiles(directory) {
  return readdirSync(new URL(`../${directory}/`, import.meta.url)).flatMap((name) => {
    const relative = `${directory}/${name}`;
    const url = new URL(`../${relative}`, import.meta.url);
    return statSync(url).isDirectory()
      ? sourceFiles(relative)
      : /\.tsx?$/.test(name) ? [relative] : [];
  });
}

assert.match(passwordInput, /aria-label=\{visible \? "Hide password" : "Show password"\}/);
assert.match(passwordInput, /aria-pressed=\{visible\}/);
assert.match(passwordInput, /type=\{visible \? "text" : "password"\}/);
for (const surface of passwordSurfaces) assert.match(surface, /<PasswordInput/);
for (const [index, surface] of passwordSurfaces.entries()) {
  if (index < 2) continue;
  assert.match(surface, /readApiResponse/, "customer, signup, and password recovery must use the safe API parser");
  assert.doesNotMatch(surface, /response\.json\(\)/, "authentication UI must not parse an HTML proxy response as JSON");
}
for (const path of sourceFiles("src")) {
  if (path === "src/components/auth/PasswordInput.tsx") continue;
  assert.doesNotMatch(read(path), /type=(?:"password"|\{[^\n}]*["']password["'])/i, `${path} bypasses the shared password-visibility control`);
}

assert.match(migration, /add column if not exists description_ai_assisted boolean not null default false/);
assert.match(authoritative, /if v_word_count>200 then/);
assert.match(authoritative, /SALON_DESCRIPTION_WORD_LIMIT/);
assert.match(profileRoute, /countWords\(value\) > 200/);
assert.match(profileRoute, /description must be 200 words or fewer/);
assert.match(profileRoute, /feature_key", "salon_description"/);
assert.match(profileRoute, /String\(draft\.data\.output_text\) !== String\(patch\.description/);
assert.match(profileRoute, /descriptionChanged \|\| context\.salon\.description_ai_assisted !== true/);
assert.match(description, /const PREVIEW_WORDS = 50/);
assert.match(description, /const MAX_WORDS = 200/);
assert.match(description, /slice\(0, MAX_WORDS\)/);
assert.match(description, /Read more/);
assert.match(description, /AI-assisted/);
assert.match(publicProfile, /<ExpandableSalonDescription/);

assert.match(rating, /No reviews yet/);
assert.match(rating, /fill \* 100/);
assert.match(rating, /scrollIntoView\(\{ behavior: "smooth"/);
assert.match(rating, /section\.focus/);
assert.match(reviews, /id="reviews" tabIndex=\{-1\}/);
assert.match(publicProfile, /<SalonRatingSummary/);

assert.match(reviewForm, />First name</);
assert.match(reviewRoute, /Enter your first name only/);
assert.match(reviewRoute, /name: displayName,[\s\S]*title: reviewTitle,[\s\S]*body: writtenReview/);
assert.match(migration, /new\.review_title is distinct from old\.review_title/);
assert.match(migration, /p_review_title text/);
assert.match(migration, /v_display_name ~ '\[\[:space:\]\[:digit:\]\[:cntrl:\]\]'/);
assert.match(moderation, /catch \{[\s\S]*return deterministic/);
const verifiedGuestReviewSignature =
  /public\.submit_verified_guest_review\(text,text,text,integer,integer,integer,integer,integer,boolean,text,jsonb\)/g;
assert.equal(
  cleanDatabaseVerifier.match(verifiedGuestReviewSignature)?.length,
  4,
  "clean-database verification must check the current review-title function and all three role grants",
);
assert.match(
  cleanDatabaseVerifier,
  /to_regprocedure\([\s\S]*submit_verified_guest_review\(text,text,integer,integer,integer,integer,integer,boolean,text,jsonb\)[\s\S]*\) is not null/,
  "clean-database verification must reject the obsolete overload",
);

assert.deepEqual(deterministicContentDecision({ name: "Ava", body: "The appointment was thoughtful and professional." }), { allowed: true, source: "deterministic" });
assert.equal(deterministicContentDecision({ name: "bitch", body: "Ordinary review body." }).reason, "abusive");
assert.equal(deterministicContentDecision({ title: "white power", body: "Ordinary review body." }).reason, "hate");
assert.equal(deterministicContentDecision({ body: "I will hurt you after work." }).reason, "threat");
assert.equal(deterministicContentDecision({ body: "You should join isis." }).reason, "terror");

assert.doesNotMatch(draftRoute, /\.from\("salons"\)\.update/);
assert.match(draftServer, /Returns an editable draft only/);
assert.match(draftServer, /humanReviewRequired: true/);
assert.match(draftServer, /ai\.emergency_kill_switch/);
assert.match(draftServer, /daily_request_limit,monthly_budget_cents/);
assert.match(draftServer, /truthfulFallback/);
assert.match(draftServer, /fallbackUsed: true/);
assert.match(draftServer, /provider: "deterministic"/);
assert.match(descriptionEditor, /never publishes it until you choose the draft and save/);
assert.match(descriptionEditor, /Use this draft/);
assert.match(descriptionEditor, /200 words/);
assert.match(migration, /human_review_required=true/);

assert.match(fallbackEditor, /Growth and Premium plans/);
assert.match(fallbackEditor, /only on your salon page/);
assert.match(fallbackEditor, /does not guarantee placement/);
assert.match(fallbackPublic, /Stylist profiles are being prepared/);
assert.match(fallbackPublic, /View services and prices/);
assert.match(fallbackPublic, /Current salon offer/);
assert.match(fallbackPublic, /Featured salon product/);
assert.match(profileRoute, /Choose an active product from this salon/);
assert.match(profileRoute, /Choose an active promotion from this salon/);
assert.match(migration, /STYLIST_FALLBACK_REQUIRES_GROWTH/);
assert.match(ownerApp, /c\.stylists\.length === 0/);

assert.match(ownerApp, /<OwnerSetupGuideLink/);
assert.match(setupGuide, /phone, tablet, or desktop/);
assert.match(setupGuide, /owner\.image_resizer_resource_url/);
assert.match(setupGuide, /url\.protocol !== "https:"/);
assert.doesNotMatch(setupGuide, /https:\/\/(?:www\.)?(?:resizepixel|iloveimg|img2go|canva)/i);
assert.match(migration, /'owner\.image_resizer_resource_url'/);
assert.match(migration, /Use only a reviewed open-source HTTPS service/);
assert.match(migration, /"20260804200000"/);

assert.match(messageRoute, /moderatePublicContent\(admin, \{ body: messageBody \}\)/);
assert.match(messageRoute, /Please revise the message/);
assert.match(profileRoute, /Please revise the public salon content/);
assert.match(recordRoute, /\["styles", "stylists", "salon_products", "salon_promotions"\]/);
assert.match(supportRoute, /content_moderation_status: moderation\.allowed \? "Clear" : "Flagged"/);
assert.match(complaintRoute, /content_moderation_status: moderation\.allowed \? "Clear" : "Flagged"/);
assert.match(migration, /add column if not exists content_moderation_status text not null default 'Clear'/);
assert.match(migration, /support_tickets_moderation_queue_idx/);
assert.match(migration, /complaints_log_moderation_queue_idx/);
assert.match(supportInbox, /Content review required/);
assert.match(supportInbox, /report was preserved so evidence is not lost/);

console.log("Verified accessible password visibility, 200-word salon descriptions, reliable reviewed writing drafts, compact rating navigation, first-name review safety, cross-surface content moderation, enhanced Growth+ salon-page fallback content, and the configurable owner setup guide.");
