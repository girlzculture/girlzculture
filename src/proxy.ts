import { NextRequest, NextResponse } from "next/server";
import { hostRoutingConfig, resolveHostRoute } from "@/lib/hostRouting";
import { customerMarketplaceLive, isMarketplaceDiscoveryApi, isMarketplaceDiscoveryPage, marketplaceUnavailable, SITE_ACCESS_COOKIE, SITE_ACCESS_COOKIE_VALUE, SITE_ACCESS_ENTRY_PATH, SITE_ACCESS_EXIT_PATH, SITE_ACCESS_HEADER } from "@/lib/marketplaceLaunchCore";

function protectDiscovery(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Netlify-CDN-Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.append("Vary", "Cookie");
  return response;
}

export function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const decision = resolveHostRoute(forwardedHost, request.nextUrl.pathname, hostRoutingConfig());
  const requestHeaders = new Headers(request.headers);
  // This browsing marker is never an authenticated business/customer role.
  // Only the proxy may set it; supplied request headers are discarded.
  requestHeaders.delete(SITE_ACCESS_HEADER);
  if (decision.kind === "pass") {
    const pathname = request.nextUrl.pathname;
    if (pathname === SITE_ACCESS_EXIT_PATH) {
      if (request.method === "GET" || request.method === "HEAD") return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      if (request.method !== "POST") return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET, HEAD, POST" } });
      const origin = request.headers.get("origin");
      if (origin !== request.nextUrl.protocol + "//" + forwardedHost) return NextResponse.json({ error: "This action must start on this site." }, { status: 403 });
      const response = NextResponse.redirect(new URL("/", origin), 303);
      response.cookies.set(SITE_ACCESS_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax" });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const entry=pathname===SITE_ACCESS_ENTRY_PATH || pathname.startsWith(`${SITE_ACCESS_ENTRY_PATH}/`);
    const demonstration=entry || request.cookies.get(SITE_ACCESS_COOKIE)?.value===SITE_ACCESS_COOKIE_VALUE;
    const discovery=customerMarketplaceLive() || demonstration;
    if(!discovery && isMarketplaceDiscoveryApi(pathname))return marketplaceUnavailable();
    if(demonstration)requestHeaders.set(SITE_ACCESS_HEADER,"1");
    // Root stays the approved coming-soon page even during demonstrations.
    // Direct business pages, booking, account and protected APIs remain under
    // their existing business eligibility and authorization boundaries.
    const target = request.nextUrl.clone();
    const closed=pathname === "/" || (!discovery && isMarketplaceDiscoveryPage(pathname));
    if (closed) { target.pathname = "/prelaunch"; target.search = ""; requestHeaders.delete(SITE_ACCESS_HEADER); }
    const response = closed
      ? NextResponse.rewrite(target, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });
    if(entry)response.cookies.set(SITE_ACCESS_COOKIE,SITE_ACCESS_COOKIE_VALUE,{path:"/",httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax"});
    if(closed || demonstration || isMarketplaceDiscoveryPage(pathname) || isMarketplaceDiscoveryApi(pathname))protectDiscovery(response);
    if (decision.surface !== "public") response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }
  const target = request.nextUrl.clone();
  target.pathname = decision.pathname;
  if (decision.kind === "redirect") {
    target.protocol = "https:"; target.host = decision.host;
    return NextResponse.redirect(target, decision.status);
  }
  const response = NextResponse.rewrite(target, { request: { headers: requestHeaders } });
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|pwa-|sw\\.js).*)"] };
