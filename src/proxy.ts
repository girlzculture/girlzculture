import { NextRequest, NextResponse } from "next/server";
import { hostRoutingConfig, resolveHostRoute } from "@/lib/hostRouting";
import {
  customerMarketplaceLive,
  isCustomerMarketplaceApi,
  isCustomerMarketplacePage,
  isSiteAccessMarketplaceApi,
  isSiteAccessMarketplacePage,
  isSiteAccessPrefetch,
  marketplaceUnavailable,
  SITE_ACCESS_COOKIE,
  SITE_ACCESS_COOKIE_VALUE,
  SITE_ACCESS_ENTRY_PATH,
  SITE_ACCESS_EXIT_PATH,
  SITE_ACCESS_HEADER,
} from "@/lib/marketplaceLaunchCore";

function downstreamHeaders(request: NextRequest, siteAccess = false) {
  const headers = new Headers(request.headers);
  headers.delete(SITE_ACCESS_HEADER);
  if (siteAccess) headers.set(SITE_ACCESS_HEADER, "1");
  return headers;
}

function protectSiteAccessResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Netlify-CDN-Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.append("Vary", "Cookie");
  return response;
}

function siteAccessCookieOptions(request: NextRequest) {
  return {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
  };
}

export function proxy(request: NextRequest) {
  const forwardedHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const decision = resolveHostRoute(
    forwardedHost,
    request.nextUrl.pathname,
    hostRoutingConfig(),
  );
  if (decision.kind === "pass") {
    const pathname = request.nextUrl.pathname;
    const marketplaceLive = customerMarketplaceLive();

    if (pathname === SITE_ACCESS_EXIT_PATH) {
      // A speculative request must not end a visitor's demonstration session.
      if (isSiteAccessPrefetch(request.headers)) {
        return protectSiteAccessResponse(new NextResponse(null, { status: 204 }));
      }
      const target = request.nextUrl.clone();
      target.pathname = "/";
      target.search = "";
      const response = NextResponse.redirect(target, 307);
      response.cookies.set(SITE_ACCESS_COOKIE, "", {
        ...siteAccessCookieOptions(request),
        maxAge: 0,
        expires: new Date(0),
      });
      return protectSiteAccessResponse(response);
    }

    if (pathname === SITE_ACCESS_ENTRY_PATH) {
      if (marketplaceLive) {
        const target = request.nextUrl.clone();
        target.pathname = "/";
        target.search = "";
        return NextResponse.redirect(target, 307);
      }
      const response = NextResponse.next({
        request: { headers: downstreamHeaders(request, true) },
      });
      response.cookies.set(
        SITE_ACCESS_COOKIE,
        SITE_ACCESS_COOKIE_VALUE,
        siteAccessCookieOptions(request),
      );
      return protectSiteAccessResponse(response);
    }

    if (!marketplaceLive) {
      const siteAccess =
        request.cookies.get(SITE_ACCESS_COOKIE)?.value ===
        SITE_ACCESS_COOKIE_VALUE;
      const marketplaceApi = isCustomerMarketplaceApi(pathname);
      if (marketplaceApi) {
        if (!siteAccess || !isSiteAccessMarketplaceApi(pathname, request.method))
          return marketplaceUnavailable();
        return protectSiteAccessResponse(
          NextResponse.next({
            request: { headers: downstreamHeaders(request, true) },
          }),
        );
      }
      if (isCustomerMarketplacePage(pathname)) {
        if (
          pathname !== "/" &&
          siteAccess &&
          isSiteAccessMarketplacePage(pathname)
        ) {
          return protectSiteAccessResponse(
            NextResponse.next({
              request: { headers: downstreamHeaders(request, true) },
            }),
          );
        }
        const target = request.nextUrl.clone();
        target.pathname = "/prelaunch";
        target.search = "";
        const response = NextResponse.rewrite(target, {
          request: { headers: downstreamHeaders(request) },
        });
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
