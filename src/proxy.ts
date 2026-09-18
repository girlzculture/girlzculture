import { NextRequest, NextResponse } from "next/server";
import { hostRoutingConfig, resolveHostRoute } from "@/lib/hostRouting";
import { SITE_ACCESS_COOKIE, SITE_ACCESS_ENTRY_PATH, SITE_ACCESS_EXIT_PATH, SITE_ACCESS_HEADER } from "@/lib/marketplaceLaunchCore";

export function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const decision = resolveHostRoute(forwardedHost, request.nextUrl.pathname, hostRoutingConfig());
  const requestHeaders = new Headers(request.headers);
  // A stale demonstration cookie or a forged header grants no access or mode.
  requestHeaders.delete(SITE_ACCESS_HEADER);
  if (decision.kind === "pass") {
    const pathname = request.nextUrl.pathname;
    if (pathname === SITE_ACCESS_EXIT_PATH) {
      if (request.method === "GET" || request.method === "HEAD") return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      if (request.method !== "POST") return NextResponse.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET, HEAD, POST" } });
      const origin = request.headers.get("origin");
      if (origin !== request.nextUrl.protocol + "//" + forwardedHost) return NextResponse.json({ error: "This action must start on this site." }, { status: 403 });
      const response = NextResponse.redirect(new URL(SITE_ACCESS_ENTRY_PATH, origin), 303);
      response.cookies.set(SITE_ACCESS_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax" });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    // Preserve the founder-approved business landing independently of the
    // customer marketplace. Home inside the marketplace is /site-access.
    const target = request.nextUrl.clone();
    if (pathname === "/") { target.pathname = "/prelaunch"; target.search = ""; }
    const response = pathname === "/"
      ? NextResponse.rewrite(target, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });
    if (request.cookies.get(SITE_ACCESS_COOKIE)) response.cookies.set(SITE_ACCESS_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax" });
    if (pathname === "/" || pathname === SITE_ACCESS_ENTRY_PATH) {
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Netlify-CDN-Cache-Control", "no-store");
    }
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
