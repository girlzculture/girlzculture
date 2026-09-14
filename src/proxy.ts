import { NextRequest, NextResponse } from "next/server";
import { hostRoutingConfig, resolveHostRoute } from "@/lib/hostRouting";
import {
  customerMarketplaceLive,
  isCustomerMarketplaceApi,
  isCustomerMarketplacePage,
  isMarketplacePreviewApi,
  isMarketplacePreviewPage,
  marketplaceUnavailable,
} from "@/lib/marketplaceLaunchCore";
import {
  MARKETPLACE_PREVIEW_COOKIE,
  verifyMarketplacePreviewGrant,
} from "@/lib/marketplacePreviewGrant";

export async function proxy(request: NextRequest) {
  const forwardedHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const decision = resolveHostRoute(
    forwardedHost,
    request.nextUrl.pathname,
    hostRoutingConfig(),
  );
  if (decision.kind === "pass") {
    if (!customerMarketplaceLive()) {
      const marketplaceApi = isCustomerMarketplaceApi(request.nextUrl.pathname);
      const marketplacePage = isCustomerMarketplacePage(request.nextUrl.pathname);
      const previewGrant = marketplaceApi || marketplacePage
        ? await verifyMarketplacePreviewGrant(
            request.cookies.get(MARKETPLACE_PREVIEW_COOKIE)?.value,
          )
        : null;
      if (marketplaceApi) {
        if (
          !previewGrant ||
          !isMarketplacePreviewApi(request.nextUrl.pathname, request.method)
        ) return marketplaceUnavailable();
        const response = NextResponse.next();
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        return response;
      }
      if (isCustomerMarketplacePage(request.nextUrl.pathname)) {
        if (
          previewGrant &&
          isMarketplacePreviewPage(request.nextUrl.pathname)
        ) {
          const response = NextResponse.next();
          response.headers.set("Cache-Control", "private, no-store");
          response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
          return response;
        }
        const target = request.nextUrl.clone();
        target.pathname = "/prelaunch";
        target.search = "";
        const response = NextResponse.rewrite(target);
        response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
    }
    const response = NextResponse.next();
    if (decision.surface !== "public" || isCustomerMarketplacePage(request.nextUrl.pathname))
      response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }
  const target = request.nextUrl.clone();
  target.pathname = decision.pathname;
  if (decision.kind === "redirect") {
    target.protocol = "https:";
    target.host = decision.host;
    return NextResponse.redirect(target, decision.status);
  }
  const response = NextResponse.rewrite(target);
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|pwa-|sw\\.js).*)"],
};
