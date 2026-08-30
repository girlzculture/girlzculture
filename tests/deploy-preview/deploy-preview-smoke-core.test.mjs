import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertDeploymentConfig,
  assertDiscoveryPayload,
  assertFeaturedPayload,
  assertPreviewSeedReadiness,
  assertTrendingPayload,
  PREVIEW_SEED_READINESS_LABEL,
  previewSeedReadiness,
  runtimeShaFromNetlifyComment,
  safeResponseHeaders,
  sanitizeText,
  sanitizeUrl,
  sanitizeValue,
  summarizeJsonBody,
} from "../../scripts/deploy-preview-smoke-core.mjs";

const head = "1234567890abcdef1234567890abcdef12345678";
const pullRequestNumber = "51";

function salon(index) {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Preview Harlem Studio ${index}`,
    slug: `preview-harlem-studio-${index}`,
    address_city: "New York",
    address_state: "NY",
    borough: "Manhattan",
    cover_photo_url: "/images/preview-salon.jpg",
    verification_status: "verified",
    rating_overall: 4.9,
    review_count: 12,
    latitude: 40.8116 + index / 10_000,
    longitude: -73.9465 + index / 10_000,
    starting_price: 120 + index,
    services: [{ id: `service-${index}`, name: "Knotless Braids" }],
    distance_miles: index / 10,
    total_count: 6,
  };
}

test("Netlify readiness accepts only a ready comment with a full release SHA", () => {
  assert.equal(runtimeShaFromNetlifyComment("Deploy Preview is building"), "");
  assert.equal(
    runtimeShaFromNetlifyComment(`Deploy Preview ready! Commit ${head}`),
    head,
  );
  assert.equal(
    runtimeShaFromNetlifyComment("Deploy Preview ready! Commit 1234567"),
    "",
  );
});

test("deep preview smoke requires a fresh seed-readiness label event for the exact PR head", () => {
  const attestation = {
    eventAction: "labeled",
    eventLabel: PREVIEW_SEED_READINESS_LABEL,
    attestedPullRequestNumber: pullRequestNumber,
    attestedHeadSha: head,
    expectedPullRequestNumber: pullRequestNumber,
    expectedHeadSha: head,
  };

  assert.deepEqual(previewSeedReadiness(attestation), {
    ready: true,
    reason: "Preview seed readiness is explicitly attested.",
  });
  assert.equal(
    previewSeedReadiness({ ...attestation, eventAction: "synchronize" }).ready,
    false,
    "A persistent label must not attest a newly synchronized PR head.",
  );
  assert.equal(
    previewSeedReadiness({ ...attestation, attestedPullRequestNumber: "52" }).ready,
    false,
  );
  assert.equal(
    previewSeedReadiness({
      ...attestation,
      attestedHeadSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }).ready,
    false,
  );
  assert.throws(
    () => assertPreviewSeedReadiness({ ...attestation, eventLabel: "ready" }),
    /requires a fresh provider-preview-seeded label event/,
  );
});

test("workflow keeps strict smoke behind the visible per-head capability gate", () => {
  const workflow = readFileSync(".github/workflows/deploy-preview-smoke.yml", "utf8");
  const runner = readFileSync("scripts/run-deploy-preview-smoke.mjs", "utf8");

  assert.match(
    workflow,
    /types:\s*\[opened, synchronize, reopened, labeled, unlabeled\]/,
  );
  assert.match(
    workflow,
    /provider-preview-smoke:[\s\S]*?if:\s*\$\{\{\s*github\.event\.action == 'labeled' && github\.event\.label\.name == 'provider-preview-seeded'\s*\}\}/,
  );
  assert.match(workflow, /BLOCKED \/ NOT RUN — deep provider smoke is intentionally skipped/);
  assert.match(workflow, /A later commit requires a fresh label event/);
  assert.match(
    workflow,
    /provider-preview-smoke:[\s\S]*?node scripts\/run-deploy-preview-smoke\.mjs/,
  );
  assert.match(runner, /assertPreviewSeedReadiness\(\{/);
  assert(
    runner.indexOf("assertPreviewSeedReadiness({") < runner.indexOf("async function githubJson"),
    "Seed readiness must be checked before the runner performs network readiness checks.",
  );
  assert(
    runner.indexOf('await import("./verify-deploy-preview.mjs")') <
      runner.indexOf('await import("./capture-deploy-preview-response.mjs")'),
    "The exact-release and staging verifier must pass before any visible preview evidence is captured.",
  );
});

test("Google Maps smoke scopes salon markers to the provider surface", () => {
  const verifier = readFileSync("scripts/verify-deploy-preview.mjs", "utf8");

  assert.match(verifier, /const mapSurface = page\.locator\("\.gm-style"\)/);
  assert.match(
    verifier,
    /const marker = mapSurface\.locator\('button\[aria-label\^="Open "\]'\)\.first\(\)/,
  );
  assert.doesNotMatch(
    verifier,
    /const marker = page\.locator\('button\[aria-label\^="Open "\]'\)/,
    "The responsive navigation button must never be mistaken for a map marker.",
  );
});

test("evidence sanitization removes credentials, contact data, payment numbers, and secret query values", () => {
  const raw = [
    "Authorization: Bearer secret.jwt.value",
    "set-cookie=session=private-cookie",
    "api_key=private-api-key",
    "owner@example.com",
    "phone: (212) 555-0199",
    "card number: 4242 4242 4242 4242",
    "cvc=123",
    "sb_publishable_privatevalue",
  ].join("\n");
  const sanitized = sanitizeText(raw);
  for (const secret of [
    "secret.jwt.value",
    "private-cookie",
    "private-api-key",
    "owner@example.com",
    "(212) 555-0199",
    "4242 4242 4242 4242",
    "cvc=123",
    "sb_publishable_privatevalue",
  ]) {
    assert(!sanitized.includes(secret), `Sanitized evidence leaked ${secret}.`);
  }
  const sanitizedQueryText = sanitizeText(
    "REQUEST_FAILED https://preview.example.test/callback?code=private-code&token=private-token&key=private-key&signature=private-signature&location=Harlem",
  );
  for (const secret of [
    "private-code",
    "private-token",
    "private-key",
    "private-signature",
  ]) {
    assert(!sanitizedQueryText.includes(secret));
  }
  assert.match(sanitizedQueryText, /code=\[redacted\]/);
  assert.match(sanitizedQueryText, /token=\[redacted\]/);
  assert.match(sanitizedQueryText, /key=\[redacted\]/);
  assert.match(sanitizedQueryText, /signature=\[redacted\]/);
  assert.match(sanitizedQueryText, /location=Harlem/);
  assert.equal(
    sanitizeUrl(
      "https://preview.example.test/callback?code=abc123&location=Harlem&phone=2125550199&token=xyz&key=maps-private",
    ),
    "https://preview.example.test/callback?code=%5Bredacted%5D&location=Harlem&phone=%5Bredacted%5D&token=%5Bredacted%5D&key=%5Bredacted%5D",
  );
  assert.deepEqual(
    safeResponseHeaders({
      "content-type": "application/json",
      "set-cookie": "session=private",
      authorization: "Bearer private",
      "x-nf-request-id": "safe-request-id",
    }),
    {
      "content-type": "application/json",
      "x-nf-request-id": "safe-request-id",
    },
  );
  assert.deepEqual(
    sanitizeValue({
      token: "private",
      phone: "212-555-0199",
      nested: { email: "a@b.com", card_number: "4242424242424242" },
    }),
    {
      token: "[redacted]",
      phone: "[redacted]",
      nested: { email: "[email redacted]", card_number: "[redacted]" },
    },
  );
});

test("deployment contract requires deploy-preview and exact PR head", () => {
  assert.doesNotThrow(() =>
    assertDeploymentConfig(
      { deployment: { environment: "deploy-preview", release: head } },
      head,
    ),
  );
  assert.throws(
    () =>
      assertDeploymentConfig(
        { deployment: { environment: "production", release: head } },
        head,
      ),
    /not running in the Netlify deploy-preview environment/,
  );
  assert.throws(
    () =>
      assertDeploymentConfig(
        {
          deployment: {
            environment: "deploy-preview",
            release: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        },
        head,
      ),
    /does not match the exact pull-request head/,
  );
});

test("provider-backed discovery requires six labelled, geocoded, priced salons", () => {
  const salons = Array.from({ length: 6 }, (_, index) => salon(index + 1));
  assert.doesNotThrow(() => assertDiscoveryPayload({ salons, total: 6 }));
  assert.throws(
    () => assertDiscoveryPayload({ salons: salons.slice(0, 5), total: 5 }),
    /at least 6 staging salons are required/,
  );
  assert.throws(
    () =>
      assertDiscoveryPayload({
        salons: [{ ...salons[0], email: "private@example.com" }, ...salons.slice(1)],
        total: 6,
      }),
    /exposed private fields/,
  );
  assert.throws(
    () =>
      assertDiscoveryPayload({
        salons: [{ ...salons[0], slug: "production-salon" }, ...salons.slice(1)],
        total: 6,
      }),
    /is not staging-labelled/,
  );
});

test("featured and trending APIs preserve their public JSON contracts", () => {
  assert.doesNotThrow(() =>
    assertFeaturedPayload({ salons: [salon(1)], total: 1 }),
  );
  assert.throws(
    () => assertFeaturedPayload({ salons: [], total: 0 }),
    /no eligible staging campaign/,
  );
  assert.doesNotThrow(() => assertTrendingPayload({ videos: [], total: 0 }));
  assert.throws(
    () => assertTrendingPayload({ videos: "not-an-array", total: 0 }),
    /videos array/,
  );
});

test("captured JSON summaries retain only operationally useful metadata", () => {
  assert.deepEqual(
    summarizeJsonBody({
      salons: [salon(1), salon(2)],
      total: 2,
      token: "must-not-appear",
      request_id: "safe-reference-id",
      warnings: [],
      deployment: { environment: "deploy-preview", release: head },
    }),
    {
      keys: ["salons", "total", "request_id", "warnings", "deployment"],
      salon_count: 2,
      warning_count: 0,
      total: 2,
      deployment: { environment: "deploy-preview", release: head },
      reference: "safe-reference-id",
    },
  );
});
