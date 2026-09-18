export type PublicNavigationLink = {
  item_key: string;
  label: string;
  href: string;
  translation_key?: string | null;
};
export type PublicNavigationGroup = {
  id: string;
  label: string;
  translation_key: string;
  links: PublicNavigationLink[];
};

/** Keep published CMS destinations, but put business acquisition and pricing
 * inside the business menu. Customer Home is the marketplace, not onboarding. */
export function publicNavigationGroups(records: PublicNavigationLink[]) {
  const explore: PublicNavigationLink[] = [];
  const business: PublicNavigationLink[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const href = record.href === "/" ? "/site-access" : record.href;
    if (!href.startsWith("/") || href.startsWith("//") || seen.has(href) || href === "/how-it-works") continue;
    seen.add(href);
    const item = { ...record, href };
    if (/^\/(?:plans|pricing|partner|business(?:es)?|for-businesses)(?:[/?#]|$)/.test(href)) {
      if (href === "/plans" || href === "/pricing") continue;
      business.push(item);
    } else explore.push(item);
  }
  for (const item of [
    { item_key: "salons", label: "Find Salons", href: "/salons", translation_key: "nav.salons" },
    { item_key: "styles", label: "Browse Styles", href: "/styles", translation_key: "nav.styles" },
  ]) if (!seen.has(item.href)) explore.unshift(item);
  if (!business.some(item => item.href.startsWith("/business/signup"))) business.unshift({ item_key: "business-center", label: "Business center", href: "/business/signup", translation_key: "nav.businessCenter" });
  business.push({ item_key: "pricing", label: "Pricing", href: "/plans", translation_key: "nav.pricing" });
  if (!business.some(item => /\/(?:salon|business)\/login/.test(item.href))) business.push({ item_key: "business-login", label: "Business login", href: "/business/login", translation_key: "nav.businessLogin" });
  return [
    { id: "explore", label: "Explore", translation_key: "nav.explore", links: explore },
    { id: "business", label: "For Businesses", translation_key: "nav.forBusinesses", links: business },
  ] satisfies PublicNavigationGroup[];
}
