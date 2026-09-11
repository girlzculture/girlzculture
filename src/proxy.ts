import { NextRequest, NextResponse } from "next/server";
import { hostRoutingConfig, resolveHostRoute } from "@/lib/hostRouting";
import { DASHBOARD_SURFACE_HEADER, RENDER_PATH_HEADER } from "@/lib/publicTranslation";

export function proxy(request: NextRequest) {
  const forwardedHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const decision = resolveHostRoute(
    forwardedHost,
    request.nextUrl.pathname,
    hostRoutingConfig(),
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(RENDER_PATH_HEADER, decision.kind === "pass" ? request.nextUrl.pathname : decision.pathname);
  requestHeaders.set(DASHBOARD_SURFACE_HEADER, decision.surface);
  if (decision.kind === "pass") {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    if (decision.surface !== "public")
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
  const response = NextResponse.rewrite(target, { request: { headers: requestHeaders } });
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|pwa-|sw\\.js).*)"],
};
