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

/** Curated destinations retain the existing marketplace access boundary. */
export function publicNavigationGroups(_records: PublicNavigationLink[], discoveryAvailable = false) {
  const link = (item_key: string, label: string, href: string): PublicNavigationLink => ({ item_key, label, href, translation_key: `master.nav.${item_key}` });
  return [
    { id: "explore", label: "Explore", translation_key: "nav.explore", links: [
      ...(discoveryAvailable ? [link("services", "Browse Services", "/styles"), link("businesses", "Browse Businesses", "/salons"), link("near-you", "Near You", "/salons?near=1")] : []),
      ...ACTIVE_BUSINESS_CATEGORIES.map(category => link(category.slug, category.name, category.live ? (discoveryAvailable ? "/salons?category=hair-salon-braiding" : "/business/signup") : `/categories/${category.slug}`)),
      link("about", "About Us", "/about"), link("blog", "Blog", "/blog"),
    ] },
    { id: "business", label: "For Businesses", translation_key: "nav.forBusinesses", links: [
      link("why", "Why Girlz Culture", "/business"), link("plans", "Pricing & Plans", "/plans"),
      link("apply", "Apply to Join", "/business/signup"), link("help", "Help Center", "/help"),
    ] },
  ] satisfies PublicNavigationGroup[];
}
import { ACTIVE_BUSINESS_CATEGORIES } from "@/lib/businessCategories";
