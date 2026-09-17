export const ASSISTANT_PAGES = ["overview", "my-page", "photos", "styles", "stylists", "products", "availability", "bookings", "messages", "reviews", "earnings", "promotions", "subscription", "settings"] as const;
export function isAssistantPage(value: unknown): value is typeof ASSISTANT_PAGES[number] {
  return typeof value === "string" && (ASSISTANT_PAGES as readonly string[]).includes(value);
}
/** Only a section hint crosses the API boundary: no record ID, query or URL. */
export function assistantPageFromPath(pathname: string | null) {
  const match = /^\/salon\/dashboard(?:\/([^/?#]+))?(?:\/[^?#]*)?$/u.exec(pathname || "");
  const section = match?.[1] || (match ? "overview" : null);
  return isAssistantPage(section) ? section : null;
}
