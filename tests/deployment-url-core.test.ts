import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL(
  "../src/lib/deploymentUrlCore.ts",
  import.meta.url,
).href;
const {
  GIRLZ_CULTURE_PRODUCTION_ORIGIN,
  LOCAL_DEVELOPMENT_ORIGIN,
  deploymentDomainReady,
  deploymentEnvironmentTier,
  resolveDeploymentContext,
  resolveDeploymentSiteUrl,
  validatedSiteOrigin,
} = (await import(moduleUrl)) as typeof import("../src/lib/deploymentUrlCore");

test("deploy previews ignore a stale public site URL", () => {
  assert.deepEqual(
    resolveDeploymentSiteUrl({
      environment: {
        CONTEXT: "deploy-preview",
        DEPLOY_PRIME_URL: "https://deploy-preview-51--girlzculture.netlify.app",
        DEPLOY_URL: "https://68c000000000000000000051--girlzculture.netlify.app",
        URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
        NEXT_PUBLIC_SITE_URL:
          "https://deploy-preview-21--girlzculture.netlify.app",
      },
    }),
    {
      origin: "https://deploy-preview-51--girlzculture.netlify.app",
      source: "DEPLOY_PRIME_URL",
      context: "deploy-preview",
      configured: true,
    },
  );
});

test("deploy preview falls through to the immutable deploy URL when needed", () => {
  const result = resolveDeploymentSiteUrl({
    environment: {
      CONTEXT: "deploy-preview",
      DEPLOY_PRIME_URL: "javascript:alert(1)",
      DEPLOY_URL: "https://68c000000000000000000000051--girlzculture.netlify.app/path",
      NEXT_PUBLIC_SITE_URL: "https://deploy-preview-21--girlzculture.netlify.app",
    },
  });
  assert.equal(
    result.origin,
    "https://68c000000000000000000000051--girlzculture.netlify.app",
  );
  assert.equal(result.source, "DEPLOY_URL");
});

test("deploy preview uses its branch-scoped public URL before production URL", () => {
  const result = resolveDeploymentSiteUrl({
    environment: {
      CONTEXT: "deploy-preview",
      REVIEW_ID: "51",
      URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
      NEXT_PUBLIC_SITE_URL:
        "https://deploy-preview-51--girlzculture.netlify.app",
    },
  });
  assert.equal(
    result.origin,
    "https://deploy-preview-51--girlzculture.netlify.app",
  );
  assert.equal(result.source, "NEXT_PUBLIC_SITE_URL");
});

test("deploy previews reject stale or unproven public preview URLs", () => {
  for (const environment of [
    {
      CONTEXT: "deploy-preview",
      REVIEW_ID: "51",
      NEXT_PUBLIC_SITE_URL:
        "https://deploy-preview-21--girlzculture.netlify.app",
    },
    {
      CONTEXT: "deploy-preview",
      NEXT_PUBLIC_SITE_URL:
        "https://deploy-preview-51--girlzculture.netlify.app",
    },
  ] as const) {
    assert.deepEqual(resolveDeploymentSiteUrl({ environment }), {
      origin: LOCAL_DEVELOPMENT_ORIGIN,
      source: "local-fallback",
      context: "deploy-preview",
      configured: false,
    });
  }
});

test("branch deploys accept only the public alias proven by the current branch", () => {
  const current = resolveDeploymentSiteUrl({
    environment: {
      CONTEXT: "branch-deploy",
      BRANCH: "codex/workstream-1",
      NEXT_PUBLIC_SITE_URL:
        "https://codex-workstream-1--girlzculture.netlify.app",
    },
  });
  assert.equal(
    current.origin,
    "https://codex-workstream-1--girlzculture.netlify.app",
  );
  assert.equal(current.source, "NEXT_PUBLIC_SITE_URL");

  assert.equal(
    resolveDeploymentSiteUrl({
      environment: {
        CONTEXT: "branch-deploy",
        BRANCH: "codex/workstream-2",
        NEXT_PUBLIC_SITE_URL:
          "https://codex-workstream-1--girlzculture.netlify.app",
      },
    }).configured,
    false,
  );
});

test("branch deploys use their branch URL instead of production", () => {
  const result = resolveDeploymentSiteUrl({
    environment: {
      CONTEXT: "branch-deploy",
      DEPLOY_PRIME_URL: "https://workstream-1--girlzculture.netlify.app/",
      URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
      NEXT_PUBLIC_SITE_URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
    },
  });
  assert.equal(result.origin, "https://workstream-1--girlzculture.netlify.app");
  assert.equal(result.source, "DEPLOY_PRIME_URL");
});

test("a preview remains a preview when CONTEXT is absent and NODE_ENV is production", () => {
  const environment = {
    NODE_ENV: "production",
    DEPLOY_PRIME_URL:
      "https://deploy-preview-51--girlzculture.netlify.app/path",
    DEPLOY_URL:
      "https://68c000000000000000000051--girlzculture.netlify.app",
    URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
    NEXT_PUBLIC_SITE_URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
  } as const;
  assert.equal(resolveDeploymentContext(environment), "deploy-preview");
  assert.equal(deploymentEnvironmentTier(environment), "preview");
  assert.deepEqual(resolveDeploymentSiteUrl({ environment }), {
    origin: "https://deploy-preview-51--girlzculture.netlify.app",
    source: "DEPLOY_PRIME_URL",
    context: "deploy-preview",
    configured: true,
  });
});

test("a context-less branch deploy is inferred before NODE_ENV", () => {
  const environment = {
    NODE_ENV: "production",
    DEPLOY_PRIME_URL:
      "https://codex-workstream-1--girlzculture.netlify.app",
    URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
  } as const;
  assert.equal(resolveDeploymentContext(environment), "branch-deploy");
  assert.equal(deploymentEnvironmentTier(environment), "preview");
  assert.equal(
    resolveDeploymentSiteUrl({ environment }).origin,
    "https://codex-workstream-1--girlzculture.netlify.app",
  );
});

test("the current preview request wins before production fallbacks", () => {
  const result = resolveDeploymentSiteUrl({
    environment: {
      NODE_ENV: "production",
      REVIEW_ID: "51",
      URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
      NEXT_PUBLIC_SITE_URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
    },
    requestUrl:
      "https://deploy-preview-51--girlzculture.netlify.app/api/config",
  });
  assert.equal(result.context, "deploy-preview");
  assert.equal(
    result.origin,
    "https://deploy-preview-51--girlzculture.netlify.app",
  );
  assert.equal(result.source, "request");
});

test("preview request origins require the current Girlz Culture Netlify identity", () => {
  for (const requestUrl of [
    "https://deploy-preview-51--untrusted.example/api/config",
    "https://untrusted.example/api/config",
    "https://deploy-preview-21--girlzculture.netlify.app/api/config",
  ]) {
    const environment = {
      CONTEXT: "deploy-preview",
      REVIEW_ID: "51",
      URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
    } as const;
    assert.deepEqual(resolveDeploymentSiteUrl({ environment, requestUrl }), {
      origin: LOCAL_DEVELOPMENT_ORIGIN,
      source: "local-fallback",
      context: "deploy-preview",
      configured: false,
    });
    assert.equal(deploymentDomainReady(environment, requestUrl), false);
  }

  const trustedDeployOrigin =
    "https://68c000000000000000000051--girlzculture.netlify.app";
  const trustedFallback = resolveDeploymentSiteUrl({
    environment: {
      CONTEXT: "deploy-preview",
      REVIEW_ID: "51",
      DEPLOY_URL: trustedDeployOrigin,
    },
    requestUrl: "https://deploy-preview-51--untrusted.example/api/config",
  });
  assert.equal(trustedFallback.origin, trustedDeployOrigin);
  assert.equal(trustedFallback.source, "DEPLOY_URL");
});

test("production preserves the configured canonical public URL", () => {
  const result = resolveDeploymentSiteUrl({
    environment: {
      CONTEXT: "production",
      NEXT_PUBLIC_SITE_URL: "https://www.girlzculture.com/",
      URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
      DEPLOY_PRIME_URL: "https://girlzculture.netlify.app",
    },
  });
  assert.equal(result.origin, "https://www.girlzculture.com");
  assert.equal(result.source, "NEXT_PUBLIC_SITE_URL");
});

test("an explicit production context is not overridden by a deploy URL", () => {
  const result = resolveDeploymentSiteUrl({
    environment: {
      CONTEXT: "production",
      NODE_ENV: "production",
      DEPLOY_PRIME_URL:
        "https://deploy-preview-51--girlzculture.netlify.app",
      URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
    },
  });
  assert.equal(result.context, "production");
  assert.equal(result.origin, GIRLZ_CULTURE_PRODUCTION_ORIGIN);
  assert.equal(result.source, "URL");
});

test("production domain readiness requires the canonical custom public domain", () => {
  assert.equal(
    deploymentDomainReady({
      CONTEXT: "production",
      NODE_ENV: "production",
      URL: "https://girlzculture.netlify.app",
      DEPLOY_PRIME_URL: "https://girlzculture.netlify.app",
    }),
    false,
  );
  assert.equal(
    deploymentDomainReady({
      CONTEXT: "production",
      NODE_ENV: "production",
      URL: "https://girlzculture.netlify.app",
      NEXT_PUBLIC_SITE_URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
    }),
    true,
  );
});

test("preview domain readiness accepts the URL assigned to that preview", () => {
  assert.equal(
    deploymentDomainReady({
      CONTEXT: "deploy-preview",
      DEPLOY_PRIME_URL:
        "https://deploy-preview-51--girlzculture.netlify.app",
      URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
    }),
    true,
  );
});

test("preview domain readiness rejects production and stale public fallbacks", () => {
  assert.deepEqual(
    resolveDeploymentSiteUrl({
      environment: {
        CONTEXT: "deploy-preview",
        URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
        NEXT_PUBLIC_SITE_URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
      },
    }),
    {
      origin: LOCAL_DEVELOPMENT_ORIGIN,
      source: "local-fallback",
      context: "deploy-preview",
      configured: false,
    },
  );
  assert.equal(
    deploymentDomainReady({
      CONTEXT: "deploy-preview",
      URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
    }),
    false,
  );
  assert.equal(
    deploymentDomainReady({
      CONTEXT: "deploy-preview",
      URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
      NEXT_PUBLIC_SITE_URL:
        "https://deploy-preview-21--girlzculture.netlify.app",
    }),
    false,
  );
});

test("a scheduled runtime infers production from the canonical URL", () => {
  assert.equal(
    resolveDeploymentContext({ URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN }),
    "production",
  );
  assert.equal(
    deploymentEnvironmentTier({ URL: GIRLZ_CULTURE_PRODUCTION_ORIGIN }),
    "production",
  );
});

test("a production runtime without configuration uses the stable public fallback", () => {
  assert.deepEqual(
    resolveDeploymentSiteUrl({ environment: { NODE_ENV: "production" } }),
    {
      origin: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
      source: "production-fallback",
      context: "production",
      configured: false,
    },
  );
});

test("local requests use their actual origin and then a deterministic fallback", () => {
  assert.equal(
    resolveDeploymentSiteUrl({
      environment: { NODE_ENV: "development" },
      requestUrl: "http://localhost:4321/api/test",
    }).origin,
    "http://localhost:4321",
  );
  assert.equal(
    resolveDeploymentSiteUrl({ environment: { NODE_ENV: "test" } }).origin,
    LOCAL_DEVELOPMENT_ORIGIN,
  );
});

test("URL validation rejects unsafe schemes, credentials, and non-local HTTP", () => {
  assert.equal(validatedSiteOrigin("javascript:alert(1)"), null);
  assert.equal(validatedSiteOrigin("https://user:password@example.com"), null);
  assert.equal(validatedSiteOrigin("http://example.com"), null);
  assert.equal(validatedSiteOrigin("http://127.0.0.1:3000/path"), "http://127.0.0.1:3000");
  assert.equal(validatedSiteOrigin("https://example.com/path?q=1#fragment"), "https://example.com");
});
