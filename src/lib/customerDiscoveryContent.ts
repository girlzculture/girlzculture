import type { ContentSection } from "@/lib/content";

export function isFutureBusinessWaitlist(href: unknown) {
  if (typeof href !== "string") return false;
  try {
    const url = new URL(href, "https://girlzculture.com");
    return ["girlzculture.com", "www.girlzculture.com"].includes(url.hostname) && /^\/business\/waitlist(?:\/|$)/.test(url.pathname);
  } catch { return false; }
}

/** Business-category applications stay in the business center. Operational
 * appointment waitlists and other published customer content are unaffected. */
export function customerDiscoverySections(sections: ContentSection[]) {
  return sections.flatMap(section => {
    if (isFutureBusinessWaitlist(section.cta_href)) return [];
    const cards = section.cards?.filter(card => !isFutureBusinessWaitlist(card.href));
    if (section.cards?.length && !cards?.length) return [];
    return [{ ...section, ...(cards ? { cards } : {}) }];
  });
}
