import "server-only";

import {
  deploymentDomainReady,
  resolveDeploymentSiteUrl,
  type DeploymentUrlEnvironment,
} from "@/lib/deploymentUrlCore";

// Keep these as direct process.env reads. Next can freeze NEXT_PUBLIC_* during
// compilation, while Netlify injects the unprefixed deploy identity into the
// server runtime. The resolver deliberately gives the latter precedence for
// deploy-preview and branch-deploy contexts.
function runtimeEnvironment(): DeploymentUrlEnvironment {
  return {
    CONTEXT: process.env.CONTEXT,
    NODE_ENV: process.env.NODE_ENV,
    BRANCH: process.env.BRANCH,
    PULL_REQUEST: process.env.PULL_REQUEST,
    REVIEW_ID: process.env.REVIEW_ID,
    DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL,
    DEPLOY_URL: process.env.DEPLOY_URL,
    URL: process.env.URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  };
}

function requestUrl(request?: Pick<Request, "url"> | string | URL | null) {
  if (!request) return null;
  return typeof request === "object" && "url" in request
    ? request.url
    : request;
}

export function serverSiteUrlDiagnostic(
  request?: Pick<Request, "url"> | string | URL | null,
  environment: DeploymentUrlEnvironment = runtimeEnvironment(),
) {
  return resolveDeploymentSiteUrl({
    environment,
    requestUrl: requestUrl(request),
  });
}

export function serverSiteUrl(
  request?: Pick<Request, "url"> | string | URL | null,
  environment?: DeploymentUrlEnvironment,
) {
  return serverSiteUrlDiagnostic(request, environment).origin;
}

export function serverDomainReady(
  request?: Pick<Request, "url"> | string | URL | null,
  environment: DeploymentUrlEnvironment = runtimeEnvironment(),
) {
  return deploymentDomainReady(environment, requestUrl(request));
}
