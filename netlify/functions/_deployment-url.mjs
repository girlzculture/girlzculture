function localHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost")
  );
}

const GIRLZ_CULTURE_NETLIFY_HOST = "girlzculture.netlify.app";

function safeOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.username || url.password) return "";
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && localHostname(url.hostname))
    ) {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}

function previewHostname(value) {
  return Boolean(previewNumber(safeOrigin(value)));
}

function previewNumber(value) {
  try {
    return (
      new URL(String(value || "")).hostname.match(
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

function branchAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function branchHostnameMatches(value, branch) {
  const alias = branchAlias(branch);
  if (!value || !alias) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === `${alias}--${GIRLZ_CULTURE_NETLIFY_HOST}`;
  } catch {
    return false;
  }
}

function expectedPreviewNumber(environment) {
  return [environment.REVIEW_ID, environment.PULL_REQUEST]
    .map((value) => String(value || "").trim())
    .find((value) => /^\d+$/.test(value)) || "";
}

function previewRequestOriginIsProven(
  origin,
  context,
  environment,
  providerOrigins,
) {
  if (!origin || productionOrigins.has(origin)) return false;
  if (providerOrigins.has(origin)) return true;

  if (context === "deploy-preview" || context === "preview") {
    const requestPreviewNumber = previewNumber(origin);
    const expected = expectedPreviewNumber(environment);
    if (requestPreviewNumber && (!expected || requestPreviewNumber === expected)) {
      return true;
    }
  }
  if (context === "branch-deploy" || context === "preview") {
    return branchHostnameMatches(origin, environment.BRANCH);
  }
  return false;
}

function publicPreviewOriginIsProven(origin, context, environment, trustedOrigins) {
  if (!origin || productionOrigins.has(origin)) return false;
  if (trustedOrigins.has(origin)) return true;
  if (context === "deploy-preview" || context === "preview") {
    const expected = expectedPreviewNumber(environment);
    return Boolean(expected && previewNumber(origin) === expected);
  }
  if (context === "branch-deploy") {
    return branchHostnameMatches(origin, environment.BRANCH);
  }
  return false;
}

const productionOrigins = new Set([
  "https://girlzculture.com",
  "https://www.girlzculture.com",
]);

export function netlifyDeploymentContext(
  environment = process.env,
  requestUrl = null,
) {
  const explicit = String(
    environment.CONTEXT || environment.DEPLOY_CONTEXT || "",
  )
    .trim()
    .toLowerCase();
  if (explicit) return explicit;

  const requestOrigin = safeOrigin(requestUrl);
  const primeOrigin = safeOrigin(environment.DEPLOY_PRIME_URL);
  const canonicalOrigin =
    safeOrigin(environment.URL) ||
    safeOrigin(environment.NEXT_PUBLIC_SITE_URL);
  if (
    previewHostname(requestOrigin) ||
    previewHostname(primeOrigin) ||
    /^(?:true|\d+)$/i.test(String(environment.PULL_REQUEST || "").trim())
  ) {
    return "deploy-preview";
  }
  if (primeOrigin && canonicalOrigin && primeOrigin !== canonicalOrigin) {
    return "branch-deploy";
  }
  if (productionOrigins.has(canonicalOrigin)) return "production";
  return String(environment.NODE_ENV || "unknown").trim().toLowerCase();
}

/**
 * Resolve the URL assigned to the current Netlify deploy. `URL` is the main
 * site address even inside a Deploy Preview, so deploy-specific values must
 * take precedence for scheduled/background callbacks and internal workers.
 */
export function netlifySiteOrigin(
  environment = process.env,
  requestUrl = null,
) {
  const context = netlifyDeploymentContext(environment, requestUrl);
  const preview = ["preview", "deploy-preview", "branch-deploy"].includes(
    context,
  );
  const requestOrigin = safeOrigin(requestUrl);
  const primeOrigin = safeOrigin(environment.DEPLOY_PRIME_URL);
  const deployOrigin = safeOrigin(environment.DEPLOY_URL);
  const providerPreviewOrigins = new Set(
    [primeOrigin, deployOrigin].filter(Boolean),
  );
  const requestOriginProven = preview
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
    ],
  );
  const candidates = preview
    ? [
        ["DEPLOY_PRIME_URL", environment.DEPLOY_PRIME_URL],
        ["request", requestOrigin],
        ["DEPLOY_URL", environment.DEPLOY_URL],
        ["NEXT_PUBLIC_SITE_URL", environment.NEXT_PUBLIC_SITE_URL],
      ]
    : context === "production"
      ? [
          ["URL", environment.URL],
          ["NEXT_PUBLIC_SITE_URL", environment.NEXT_PUBLIC_SITE_URL],
          ["DEPLOY_PRIME_URL", environment.DEPLOY_PRIME_URL],
          ["DEPLOY_URL", environment.DEPLOY_URL],
          ["request", requestOrigin],
        ]
      : [
          ["request", requestOrigin],
          ["DEPLOY_PRIME_URL", environment.DEPLOY_PRIME_URL],
          ["DEPLOY_URL", environment.DEPLOY_URL],
          ["URL", environment.URL],
          ["NEXT_PUBLIC_SITE_URL", environment.NEXT_PUBLIC_SITE_URL],
        ];
  for (const [source, candidate] of candidates) {
    const origin = safeOrigin(candidate);
    // Netlify's URL variable identifies the main site inside deploy-preview
    // and branch-deploy functions. Never let a preview worker fall through to
    // that production identity, including via a stale public URL.
    if (preview && source === "request" && !requestOriginProven) continue;
    if (
      preview &&
      source === "NEXT_PUBLIC_SITE_URL" &&
      !publicPreviewOriginIsProven(
        origin,
        context,
        environment,
        trustedPreviewOrigins,
      )
    ) {
      continue;
    }
    if (origin) return origin;
  }
  return "";
}
