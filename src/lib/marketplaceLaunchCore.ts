/** Server-owned customer-booking gate. Missing or malformed values fail closed. */
export function customerMarketplaceLive() {
  return process.env.CUSTOMER_MARKETPLACE_LIVE === "true";
}

export const SITE_ACCESS_ENTRY_PATH = "/site-access";
export const SITE_ACCESS_EXIT_PATH = "/site-access/exit";
export const SITE_ACCESS_COOKIE = "gc_site_access";
export const SITE_ACCESS_COOKIE_VALUE = "marketplace-demo";
export const SITE_ACCESS_HEADER = "x-gc-site-access";

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

/** Browsing-only customer surfaces available from the unlisted demonstration
 * entrance. Booking, checkout, reservation and account-management pages stay
 * behind the production launch gate. */
export function isSiteAccessMarketplacePage(path: string) {
  const segments = path.split("/").filter(Boolean);
  const first = segments[0];
  if (path === "/" || ["salons", "search", "styles", "featured", "trending", "social"].includes(first)) return true;
  if (first !== "salon" || ownerRoutes.has(segments[1])) return false;
  if (segments.length === 2) return true;
  return segments.length === 4 && ["stylist", "product"].includes(segments[2]);
}

export function isCustomerMarketplaceApi(path: string) {
  return ["/api/discovery", "/api/concierge", "/api/search", "/api/guest/bookings", "/api/pickup", "/api/salons"].some(prefix => path === prefix || path.startsWith(`${prefix}/`))
    || ["/api/booking-availability", "/api/stripe/booking-checkout", "/api/stripe/commerce-checkout", "/api/stripe/pickup-reservation", "/api/promo/validate"].includes(path);
}

/** Read-only data requests needed by the demonstration marketplace. The three
 * POST routes below perform searches only; no customer, booking or payment
 * record can be created through this allowlist. */
export function isSiteAccessMarketplaceApi(path: string, method: string) {
  const normalizedMethod = method.toUpperCase();
  if (["GET", "HEAD"].includes(normalizedMethod)) {
    return ["/api/discovery", "/api/search", "/api/salons"].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  }
  if (normalizedMethod !== "POST") return false;
  return [
    "/api/discovery/decision-search",
    "/api/discovery/availability",
    "/api/concierge/search",
  ].includes(path);
}
