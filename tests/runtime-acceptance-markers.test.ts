import assert from "node:assert/strict";
import test from "node:test";

const deploymentModuleUrl = new URL(
  "../src/lib/deploymentIdentity.ts",
  import.meta.url,
).href;
const markerModuleUrl = new URL(
  "../src/lib/publicAcceptanceMarkersCore.ts",
  import.meta.url,
).href;
const {
  deploymentConfigEtag,
  deploymentEnvironmentId,
  deploymentEnvironmentTier,
  deploymentIdentity,
  withDeploymentIdentity,
} = (await import(deploymentModuleUrl)) as typeof import(
  "../src/lib/deploymentIdentity"
);
const {
  homepagePromotionCollectionSource,
  homepagePromotionSource,
  publicContentSource,
} = (await import(markerModuleUrl)) as typeof import(
  "../src/lib/publicAcceptanceMarkersCore"
);

test("deployment identity exposes the exact Netlify preview environment and release", () => {
  assert.deepEqual(
    deploymentIdentity({
      CONTEXT: "deploy-preview",
      COMMIT_REF: "bae438652e443b60beb47382415fe6a5bfb85c06",
      NODE_ENV: "production",
    }),
    {
      environment: "deploy-preview",
      release: "bae438652e443b60beb47382415fe6a5bfb85c06",
    },
  );
  assert.equal(
    deploymentEnvironmentId({ CONTEXT: "branch-deploy" }),
    "branch-deploy",
  );
  assert.equal(
    deploymentEnvironmentId({ CONTEXT: "invalid environment value" }),
    "unknown",
  );
  const contextlessPreview = {
    NODE_ENV: "production",
    URL: "https://girlzculture.com",
    DEPLOY_PRIME_URL:
      "https://deploy-preview-51--girlzculture.netlify.app",
  };
  assert.equal(deploymentEnvironmentId(contextlessPreview), "deploy-preview");
  assert.equal(deploymentEnvironmentTier(contextlessPreview), "preview");
});

test("public config payload carries the same deployment identity contract", () => {
  assert.deepEqual(
    withDeploymentIdentity(
      { revision: 7, config: { "search.default_radius_miles": 25 } },
      {
        CONTEXT: "deploy-preview",
        COMMIT_REF: "bae438652e443b60beb47382415fe6a5bfb85c06",
        NODE_ENV: "production",
      },
    ),
    {
      revision: 7,
      config: { "search.default_radius_miles": 25 },
      deployment: {
        environment: "deploy-preview",
        release: "bae438652e443b60beb47382415fe6a5bfb85c06",
      },
    },
  );
});

test("public config cache validators vary with the deployed release", () => {
  const releaseA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const releaseB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  assert.equal(
    deploymentConfigEtag(7, { COMMIT_REF: releaseA, NODE_ENV: "production" }),
    `W/"engine-7-${releaseA}"`,
  );
  assert.notEqual(
    deploymentConfigEtag(7, { COMMIT_REF: releaseA, NODE_ENV: "production" }),
    deploymentConfigEtag(7, {
      COMMIT_REF: releaseB,
      NODE_ENV: "production",
    }),
  );
});

test("public content source distinguishes the exact fallback from a managed snapshot", () => {
  const fallback = { slug: "home", title: "Home" };
  assert.equal(publicContentSource(fallback, fallback), "editorial-fallback");
  assert.equal(publicContentSource({ ...fallback }, fallback), "managed");
});

test("homepage promotion source marks explicit fallbacks as editorial", () => {
  const fallback = {
    id: "editorial-nearby",
    title: "Find trusted salons nearby",
    editorial_fallback: true,
  };
  assert.equal(homepagePromotionSource(fallback), "editorial");
  assert.equal(
    homepagePromotionSource({
      ...fallback,
      id: "managed-preview-campaign",
      editorial_fallback: false,
    }),
    "managed",
  );
  assert.equal(homepagePromotionSource({ id: "managed-without-flag" }), "managed");
  assert.equal(homepagePromotionCollectionSource([fallback]), "editorial");
  assert.equal(
    homepagePromotionCollectionSource([fallback, { id: "managed-card" }]),
    "managed",
  );
});
