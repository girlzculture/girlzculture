import { test, expect } from "@playwright/test";
import { BUSINESS_CATEGORIES } from "../../src/lib/businessCategories";
import { customerBusinessCategories } from "../../src/lib/businessDiscovery";
import { DEFAULT_BUSINESS_SIGNUP_CONTENT } from "../../src/lib/businessSignupContent";
import { publicDiscoveryNavigation } from "../../src/lib/publicDiscoveryNavigation";
import type { NavigationItem } from "../../src/lib/content";

test("customer categories share stable presentation while only registered discovery is live", () => {
  const categories = customerBusinessCategories();
  expect(categories.map(category => category.id)).toEqual(BUSINESS_CATEGORIES.map(category => category.slug));
  expect(categories.filter(category => category.destination.state === "live")).toHaveLength(1);
  expect(categories[0].destination).toEqual({ state: "live", href: "/salons" });
  for (const category of categories.slice(1)) expect(category.destination).toEqual({ state: "coming_soon" });

  const edited = structuredClone(DEFAULT_BUSINESS_SIGNUP_CONTENT.categories);
  edited[1].name = "Nails, your way";
  edited[1].image.src = "/images/nails-edited.jpg";
  edited[1].order = -1;
  edited[1].mode = "live_application";
  const next = customerBusinessCategories(edited);
  expect(next[0].id).toBe("nail-studio");
  expect(next[0].name).toBe("Nails, your way");
  expect(next[0].image.src).toBe("/images/nails-edited.jpg");
  expect(next[0].destination).toEqual({ state: "coming_soon" });
  expect(DEFAULT_BUSINESS_SIGNUP_CONTENT.categories[1].name).toBe("Nail Studio");
});

test("public discovery nav adapts legacy slots without reviving hidden or replacing custom navigation", () => {
  const configured: NavigationItem[] = [
    { id: "a", surface: "header", group_key: "main", item_key: "salons", label: "Find All Salons", translation_key: "nav.salons", href: "/salons", sort_order: 30 },
    { id: "b", surface: "mobile_menu", group_key: "main", item_key: "salons", label: "Find Salons", href: "/salons", sort_order: 20 },
    { id: "c", surface: "mobile_bottom", group_key: "main", item_key: "search", label: "Search", href: "/salons", sort_order: 10 },
  ];
  const result = publicDiscoveryNavigation(configured);
  expect(result.map(item => [item.id, item.sort_order])).toEqual([["a", 30], ["b", 20], ["c", 10]]);
  for (const item of result) {
    expect(item.label).toBe("Businesses");
    expect(item.href).toBe("/businesses");
    expect(item.translation_key).toBe("nav.businesses");
  }
  expect(configured[0].href).toBe("/salons");
  expect(publicDiscoveryNavigation([])).toEqual([]);
  const custom = [
    { ...configured[0], href: "/styles", label: "Our styles" },
    { ...configured[0], surface: "footer" as const },
    { ...configured[0], item_key: "salon-shortcut", label: "Hair salons" },
  ];
  expect(publicDiscoveryNavigation(custom)).toEqual(custom);
});
