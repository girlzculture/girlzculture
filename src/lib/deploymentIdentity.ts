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
