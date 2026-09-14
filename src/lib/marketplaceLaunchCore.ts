/** Server-owned customer-booking gate. Missing or malformed values fail closed. */
export function customerMarketplaceLive() {
  return process.env.CUSTOMER_MARKETPLACE_LIVE === "true";
}

export function marketplaceUnavailable() {
  return Response.json({
    code: "CUSTOMER_MARKETPLACE_NOT_LIVE",
    error: "The customer marketplace is preparing to launch. Booking and payment are not available yet.",
  }, { status: 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" } });
}

const ownerRoutes = new Set(["dashboard", "login", "signup", "onboarding", "setup-guide", "apply", "application-submitted"]);
export function isCustomerMarketplacePage(path: string) {
  const first = path.split("/")[1];
  if (path === "/" || ["salons", "search", "styles", "featured", "trending", "social", "booking", "pickup"].includes(first)) return true;
  return first === "salon" && !ownerRoutes.has(path.split("/")[2]);
}

/** Read-only customer surfaces an authenticated Platform Admin may inspect prelaunch. */
export function isMarketplacePreviewPage(path: string) {
  const segments = path.split("/").filter(Boolean);
  const first = segments[0];
  if (path === "/" || ["salons", "search", "styles", "featured", "trending", "social"].includes(first)) return true;
  if (first !== "salon" || ownerRoutes.has(segments[1])) return false;
  return segments.length === 2 ||
    (segments.length === 4 && segments[2] === "stylist");
}

export function isCustomerMarketplaceApi(path: string) {
  return ["/api/discovery", "/api/concierge", "/api/search", "/api/guest/bookings", "/api/pickup", "/api/salons"].some(prefix => path === prefix || path.startsWith(`${prefix}/`))
    || ["/api/booking-availability", "/api/stripe/booking-checkout", "/api/stripe/commerce-checkout", "/api/stripe/pickup-reservation", "/api/promo/validate"].includes(path);
}

/** Provider reads needed by the private preview. Transactional APIs stay closed. */
export function isMarketplacePreviewApi(path: string, method: string) {
  if (!["GET", "HEAD"].includes(method.toUpperCase())) return false;
  return ["/api/discovery", "/api/search", "/api/salons"].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
