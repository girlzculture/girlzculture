import type { NavigationItem } from "./content";

/** Adapt the existing discovery slots without replacing configured navigation. */
export function publicDiscoveryNavigation(items: readonly NavigationItem[]) {
  return items.map(item => {
    const headerDiscovery = (item.surface === "header" || item.surface === "mobile_menu")
      && item.item_key === "salons";
    const bottomDiscovery = item.surface === "mobile_bottom" && item.item_key === "search";
    if (item.href !== "/salons" || (!headerDiscovery && !bottomDiscovery)) return item;
    return {
      ...item,
      label: "Businesses",
      translation_key: "nav.businesses",
      href: "/businesses",
    };
  });
}
