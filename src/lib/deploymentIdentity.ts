export function deploymentReleaseId(
  environment: Record<string, string | undefined> = process.env,
) {
  const candidates = [
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
