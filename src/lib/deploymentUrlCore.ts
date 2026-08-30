export const GIRLZ_CULTURE_PRODUCTION_ORIGIN = "https://girlzculture.com";
export const LOCAL_DEVELOPMENT_ORIGIN = "http://localhost:3000";
const GIRLZ_CULTURE_NETLIFY_HOST = "girlzculture.netlify.app";

export type DeploymentUrlEnvironment = Readonly<
  Partial<
    Record<
      | "CONTEXT"
      | "DEPLOY_CONTEXT"
      | "NODE_ENV"
      | "VERCEL_ENV"
      | "BRANCH"
      | "PULL_REQUEST"
      | "REVIEW_ID"
      | "DEPLOY_PRIME_URL"
      | "DEPLOY_URL"
      | "URL"
      | "NEXT_PUBLIC_SITE_URL",
      string
    >
  >
>;

export type DeploymentUrlSource =
  | "DEPLOY_PRIME_URL"
  | "DEPLOY_URL"
  | "URL"
  | "NEXT_PUBLIC_SITE_URL"
  | "request"
  | "production-fallback"
  | "local-fallback";

export type DeploymentUrlResolution = {
  origin: string;
  source: DeploymentUrlSource;
  context: string;
  configured: boolean;
};

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost")
  );
}

function netlifyPreviewHostname(value: string) {
  return Boolean(netlifyPreviewNumber(validatedSiteOrigin(value)));
}

function netlifyPreviewNumber(value: string | null) {
  if (!value) return "";
  try {
    return (
      new URL(value).hostname.match(
        new RegExp(
          `^deploy-preview-(\\d+)--${GIRLZ_CULTURE_NETLIFY_HOST.replaceAll(".", "\\.")}$`,
          "i",
        ),
      )?.[1] || ""
    );
  } catch {
    return "";
  }
}

function netlifyBranchAlias(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function netlifyBranchHostnameMatches(value: string | null, branch: unknown) {
  const alias = netlifyBranchAlias(branch);
  if (!value || !alias) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === `${alias}--${GIRLZ_CULTURE_NETLIFY_HOST}`;
  } catch {
    return false;
  }
}

function expectedPreviewNumber(environment: DeploymentUrlEnvironment) {
  return [environment.REVIEW_ID, environment.PULL_REQUEST]
    .map((value) => String(value || "").trim())
    .find((value) => /^\d+$/.test(value)) || "";
}

function previewRequestOriginIsProven(
  origin: string | null,
  context: string,
  environment: DeploymentUrlEnvironment,
  providerOrigins: ReadonlySet<string>,
) {
  if (!origin || isGirlzCultureProductionOrigin(origin)) return false;
  if (providerOrigins.has(origin)) return true;

  if (context === "deploy-preview" || context === "preview") {
    const requestPreviewNumber = netlifyPreviewNumber(origin);
    const expected = expectedPreviewNumber(environment);
    if (requestPreviewNumber && (!expected || requestPreviewNumber === expected)) {
      return true;
    }
  }
  if (context === "branch-deploy" || context === "preview") {
    return netlifyBranchHostnameMatches(origin, environment.BRANCH);
  }
  return false;
}

function previewPublicOriginIsProven(
  origin: string | null,
  context: string,
  environment: DeploymentUrlEnvironment,
  trustedOrigins: ReadonlySet<string>,
) {
  if (!origin || isGirlzCultureProductionOrigin(origin)) return false;
  if (trustedOrigins.has(origin)) return true;
  if (context === "deploy-preview" || context === "preview") {
    const expected = expectedPreviewNumber(environment);
    return Boolean(expected && netlifyPreviewNumber(origin) === expected);
  }
  if (context === "branch-deploy") {
    return netlifyBranchHostnameMatches(origin, environment.BRANCH);
  }
  return false;
}

function isGirlzCultureProductionOrigin(value: string | null) {
  if (!value) return false;
  return (
    value === GIRLZ_CULTURE_PRODUCTION_ORIGIN ||
    value === `https://www.${new URL(GIRLZ_CULTURE_PRODUCTION_ORIGIN).hostname}`
  );
}

/**
 * Netlify Functions can omit CONTEXT while still providing deploy URLs, and
 * NODE_ENV is "production" for both production and preview bundles. Infer the
 * deploy context from the current request/prime URL before trusting NODE_ENV.
 */
export function resolveDeploymentContext(
  environment: DeploymentUrlEnvironment = {},
  requestUrl?: string | URL | null,
) {
  const explicit = String(
    environment.CONTEXT ||
      environment.DEPLOY_CONTEXT ||
      environment.VERCEL_ENV ||
      "",
  )
    .trim()
    .toLowerCase();
  if (explicit) return explicit;

  const requestOrigin = validatedSiteOrigin(requestUrl);
  const primeOrigin = validatedSiteOrigin(environment.DEPLOY_PRIME_URL);
  const canonicalOrigin =
    validatedSiteOrigin(environment.URL) ||
    validatedSiteOrigin(environment.NEXT_PUBLIC_SITE_URL);
  if (
    netlifyPreviewHostname(requestOrigin || "") ||
    netlifyPreviewHostname(primeOrigin || "") ||
    /^(?:true|\d+)$/i.test(String(environment.PULL_REQUEST || "").trim())
  ) {
    return "deploy-preview";
  }
  if (primeOrigin && canonicalOrigin && primeOrigin !== canonicalOrigin) {
    return "branch-deploy";
  }
  if (
    canonicalOrigin === GIRLZ_CULTURE_PRODUCTION_ORIGIN ||
    canonicalOrigin ===
      `https://www.${new URL(GIRLZ_CULTURE_PRODUCTION_ORIGIN).hostname}`
  ) {
    return "production";
  }

  const nodeEnvironment = String(environment.NODE_ENV || "")
    .trim()
    .toLowerCase();
  return nodeEnvironment || "unknown";
}

export function deploymentEnvironmentTier(
  environment: DeploymentUrlEnvironment = {},
  requestUrl?: string | URL | null,
): "development" | "preview" | "production" {
  const context = resolveDeploymentContext(environment, requestUrl);
  if (context === "production") return "production";
  if (["preview", "deploy-preview", "branch-deploy"].includes(context)) {
    return "preview";
  }
  return "development";
}

export function deploymentDomainReady(
  environment: DeploymentUrlEnvironment = {},
  requestUrl?: string | URL | null,
) {
  const tier = deploymentEnvironmentTier(environment, requestUrl);
  if (tier === "production") {
    const canonical = validatedSiteOrigin(environment.NEXT_PUBLIC_SITE_URL);
    return (
      canonical === GIRLZ_CULTURE_PRODUCTION_ORIGIN ||
      canonical === `https://www.${new URL(GIRLZ_CULTURE_PRODUCTION_ORIGIN).hostname}`
    );
  }
  const resolved = resolveDeploymentSiteUrl({ environment, requestUrl });
  if (tier === "preview") {
    return (
      resolved.configured &&
      resolved.origin.startsWith("https://") &&
      ["DEPLOY_PRIME_URL", "request", "DEPLOY_URL"].includes(resolved.source)
    );
  }
  return resolved.configured && resolved.origin.startsWith("https://");
}

export function validatedSiteOrigin(value: unknown) {
  const candidate = String(value || "").trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.username || parsed.password) return null;
    if (
      parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && isLocalHostname(parsed.hostname))
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Resolves the canonical server origin for links, provider callbacks, and
 * redirects. Netlify deploy previews and branch deploys must use the URL that
 * Netlify assigned to that exact deploy; a public variable can be frozen into
 * the bundle by Next.js and may still point at an older preview.
 */
export function resolveDeploymentSiteUrl(input: {
  environment?: DeploymentUrlEnvironment;
  requestUrl?: string | URL | null;
} = {}): DeploymentUrlResolution {
  const environment = input.environment || {};
  const context = resolveDeploymentContext(environment, input.requestUrl);
  const previewContext =
    context === "preview" ||
    context === "deploy-preview" ||
    context === "branch-deploy";
  const productionContext = context === "production";
  const requestOrigin = validatedSiteOrigin(input.requestUrl);
  const primeOrigin = validatedSiteOrigin(environment.DEPLOY_PRIME_URL);
  const deployOrigin = validatedSiteOrigin(environment.DEPLOY_URL);
  const providerPreviewOrigins = new Set(
    [primeOrigin, deployOrigin].filter(
      (origin): origin is string => Boolean(origin),
    ),
  );
  const requestOriginProven = previewContext
    ? previewRequestOriginIsProven(
        requestOrigin,
        context,
        environment,
        providerPreviewOrigins,
      )
    : false;
  const trustedPreviewOrigins = new Set(
    [
      ...providerPreviewOrigins,
      ...(requestOriginProven && requestOrigin ? [requestOrigin] : []),
    ].filter(
      (origin): origin is string => Boolean(origin),
    ),
  );

  const candidates: Array<[DeploymentUrlSource, unknown]> = previewContext
    ? [
        ["DEPLOY_PRIME_URL", environment.DEPLOY_PRIME_URL],
        ["request", requestOrigin],
        ["DEPLOY_URL", environment.DEPLOY_URL],
        ["NEXT_PUBLIC_SITE_URL", environment.NEXT_PUBLIC_SITE_URL],
        ["URL", environment.URL],
      ]
    : productionContext
      ? [
          ["NEXT_PUBLIC_SITE_URL", environment.NEXT_PUBLIC_SITE_URL],
          ["URL", environment.URL],
          ["DEPLOY_PRIME_URL", environment.DEPLOY_PRIME_URL],
          ["DEPLOY_URL", environment.DEPLOY_URL],
          ["request", requestOrigin],
        ]
      : [
          ["request", requestOrigin],
          ["NEXT_PUBLIC_SITE_URL", environment.NEXT_PUBLIC_SITE_URL],
          ["DEPLOY_PRIME_URL", environment.DEPLOY_PRIME_URL],
          ["DEPLOY_URL", environment.DEPLOY_URL],
          ["URL", environment.URL],
        ];

  for (const [source, value] of candidates) {
    const origin = validatedSiteOrigin(value);
    // A preview can inherit Netlify's production URL and a stale public URL.
    // Returning either as the preview origin can route links, callbacks, or
    // internal requests across the environment boundary. Fail closed until
    // the current deploy supplies its own origin.
    if (previewContext && source === "request" && !requestOriginProven) {
      continue;
    }
    if (
      previewContext &&
      (source === "NEXT_PUBLIC_SITE_URL" || source === "URL") &&
      !previewPublicOriginIsProven(
        origin,
        context,
        environment,
        trustedPreviewOrigins,
      )
    ) {
      continue;
    }
    if (origin) {
      return {
        origin,
        source,
        context: context === "unknown" ? "local" : context,
        configured: true,
      };
    }
  }

  if (productionContext) {
    return {
      origin: GIRLZ_CULTURE_PRODUCTION_ORIGIN,
      source: "production-fallback",
      context,
      configured: false,
    };
  }
  return {
    origin: LOCAL_DEVELOPMENT_ORIGIN,
    source: "local-fallback",
    context: context === "unknown" ? "local" : context,
    configured: false,
  };
}
