function safeOrigin(value: unknown) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}

function resolvedDeploymentEnvironment(
  environment: Record<string, string | undefined>,
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
  const primeOrigin = safeOrigin(environment.DEPLOY_PRIME_URL);
  const canonicalOrigin =
    safeOrigin(environment.URL) || safeOrigin(environment.NEXT_PUBLIC_SITE_URL);
  if (
    /^https:\/\/deploy-preview-\d+--/i.test(primeOrigin) ||
    /^(?:true|\d+)$/i.test(String(environment.PULL_REQUEST || "").trim())
  ) {
    return "deploy-preview";
  }
  if (primeOrigin && canonicalOrigin && primeOrigin !== canonicalOrigin) {
    return "branch-deploy";
  }
  if (
    canonicalOrigin === "https://girlzculture.com" ||
    canonicalOrigin === "https://www.girlzculture.com"
  ) {
    return "production";
  }
  return String(environment.NODE_ENV || "unknown").trim().toLowerCase();
}

// next.config compiles this direct process.env access into every server
// bundle. Accessing it only through an aliased `environment` object prevents
// Next from replacing the value and caused production events to be labeled
// `unidentified-production-release` even though Netlify supplied COMMIT_REF
// during the build.
const COMPILED_RELEASE_ID = process.env.GIRLZ_CULTURE_RELEASE_ID ||
  process.env.COMMIT_REF ||
  process.env.DEPLOY_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.NEXT_PUBLIC_COMMIT_REF;

const COMPILED_DEPLOYMENT_ENVIRONMENT = resolvedDeploymentEnvironment({
  CONTEXT: process.env.CONTEXT,
  DEPLOY_CONTEXT: process.env.DEPLOY_CONTEXT,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NODE_ENV: process.env.NODE_ENV,
  PULL_REQUEST: process.env.PULL_REQUEST,
  DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL,
  DEPLOY_URL: process.env.DEPLOY_URL,
  URL: process.env.URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

export function deploymentEnvironmentId(
  environment: Record<string, string | undefined> = process.env,
) {
  const candidate = String(
    (environment === process.env
      ? COMPILED_DEPLOYMENT_ENVIRONMENT
      : undefined) ||
      resolvedDeploymentEnvironment(environment),
  )
    .trim()
    .toLowerCase();

  if (/^[a-z][a-z0-9-]{1,79}$/.test(candidate)) return candidate;
  return "unknown";
}

export function deploymentEnvironmentTier(
  environment: Record<string, string | undefined> = process.env,
) {
  const id = deploymentEnvironmentId(environment);
  if (id === "production") return "production";
  if (["preview", "deploy-preview", "branch-deploy"].includes(id)) {
    return "preview";
  }
  return "development";
}

export function deploymentReleaseId(
  environment: Record<string, string | undefined> = process.env,
) {
  const candidates = [
    environment === process.env ? COMPILED_RELEASE_ID : undefined,
    environment.GIRLZ_CULTURE_RELEASE_ID,
    environment.COMMIT_REF,
    environment.DEPLOY_ID,
    environment.VERCEL_GIT_COMMIT_SHA,
    environment.VERCEL_DEPLOYMENT_ID,
    environment.NEXT_PUBLIC_COMMIT_REF,
  ];
  const release = candidates
    .map((value) => String(value || "").trim())
    .find((value) => /^[a-z0-9][a-z0-9_.:/-]{5,159}$/i.test(value));
  if (release) return release;
  return environment.NODE_ENV === "production"
    ? "unidentified-production-release"
    : "local-development";
}

export function deploymentIdentity(
  environment: Record<string, string | undefined> = process.env,
) {
  return {
    environment: deploymentEnvironmentId(environment),
    release: deploymentReleaseId(environment),
  };
}

export function deploymentConfigEtag(
  revision: number,
  environment: Record<string, string | undefined> = process.env,
) {
  const normalizedRevision = Number.isFinite(revision)
    ? Math.max(1, Math.trunc(revision))
    : 1;
  return `W/"engine-${normalizedRevision}-${deploymentReleaseId(environment)}"`;
}

export function withDeploymentIdentity<T extends object>(
  payload: T,
  environment: Record<string, string | undefined> = process.env,
) {
  return { ...payload, deployment: deploymentIdentity(environment) };
}
