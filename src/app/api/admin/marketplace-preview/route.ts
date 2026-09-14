import { NextResponse } from "next/server";
import { hostRoutingConfig, normalizeRequestHost } from "@/lib/hostRouting";
import {
  MARKETPLACE_PREVIEW_COOKIE,
  MARKETPLACE_PREVIEW_TTL_SECONDS,
  issueMarketplacePreviewGrant,
} from "@/lib/marketplacePreviewGrant";
import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { requireAdmin } from "@/lib/supabaseAdmin";

function sharedCookieDomain(request: Request) {
  const host = normalizeRequestHost(new URL(request.url).hostname);
  const publicHost = hostRoutingConfig().publicHost;
  if (
    publicHost.includes(".") &&
    (host === publicHost || host.endsWith(`.${publicHost}`))
  ) return `.${publicHost}`;
  return undefined;
}

function cookieOptions(request: Request) {
  return {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "strict" as const,
    path: "/",
    domain: sharedCookieDomain(request),
  };
}

async function POSTHandler(request: Request) {
  try {
    const { admin, user } = await requireAdmin(request);
    const grant = await issueMarketplacePreviewGrant(user.id);
    const config = hostRoutingConfig();
    const previewUrl = config.enabled
      ? `https://${config.publicHost}/?marketplace_preview=1`
      : "/?marketplace_preview=1";
    const response = NextResponse.json({
      preview_url: previewUrl,
      expires_at: grant.expiresAt.toISOString(),
      transactions_enabled: false,
    });
    response.cookies.set(MARKETPLACE_PREVIEW_COOKIE, grant.value, {
      ...cookieOptions(request),
      maxAge: MARKETPLACE_PREVIEW_TTL_SECONDS,
      expires: grant.expiresAt,
    });
    const { error: auditError } = await admin.from("admin_security_events").insert({
      actor_user_id: user.id,
      target_user_id: user.id,
      action: "marketplace_preview_started",
      result: "Allowed",
      details: {
        expires_at: grant.expiresAt.toISOString(),
        transactions_enabled: false,
      },
    });
    if (auditError) throw auditError;
    return response;
  } catch (error) {
    noteOperationalFailure("Marketplace preview authorization failed", error);
    const message = error instanceof Error ? error.message : "";
    const status = /^Unauthorized$/i.test(message)
      ? 401
      : /^Forbidden(?::|$)/i.test(message)
        ? 403
        : 500;
    return Response.json(
      {
        error:
          status === 401
            ? "Your Platform Admin session has expired. Sign in again."
            : status === 403
              ? "This account cannot open the private marketplace preview."
              : "The private marketplace preview could not be opened.",
      },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

async function DELETEHandler(request: Request) {
  const response = NextResponse.json({ ended: true });
  response.cookies.set(MARKETPLACE_PREVIEW_COOKIE, "", {
    ...cookieOptions(request),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/marketplace-preview", "POST"),
  POSTHandler,
);
export const DELETE = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/marketplace-preview", "DELETE"),
  DELETEHandler,
);
