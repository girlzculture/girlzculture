/** Discovery opens only through the existing explicit founder-controlled flag.
 * Business counts never change it. Direct business booking has its own checks. */
export function customerMarketplaceLive() { return process.env.CUSTOMER_MARKETPLACE_LIVE === "true"; }
export const SITE_ACCESS_ENTRY_PATH = "/site-access";
export const SITE_ACCESS_EXIT_PATH = "/site-access/exit";
export const SITE_ACCESS_COOKIE = "gc_site_access";
export const SITE_ACCESS_COOKIE_VALUE = "marketplace-demo";
export const SITE_ACCESS_HEADER = "x-gc-site-access";

export function isMarketplaceDiscoveryPage(path: string) {
  return ["salons", "search", "styles", "featured", "trending", "social"].includes(path.split("/")[1]);
}
export function isMarketplaceDiscoveryApi(path: string) {
  return ["/api/discovery", "/api/search", "/api/concierge"].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}
export function isMarketplaceNavigationHref(href: string) {
  const path=href.split(/[?#]/)[0];
  return path === SITE_ACCESS_ENTRY_PATH || path.startsWith(`${SITE_ACCESS_ENTRY_PATH}/`) || isMarketplaceDiscoveryPage(path);
}
export function marketplaceUnavailable() {
  return Response.json({code:"CUSTOMER_MARKETPLACE_NOT_LIVE",error:"Marketplace discovery is preparing to launch. You can still book through your business's direct link."},{status:503,headers:{"Cache-Control":"private, no-store","Netlify-CDN-Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow, noarchive"}});
}
