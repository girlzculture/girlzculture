import { normalizeLocale } from "@/i18n/catalog";

export function localeAuthScope(pathname: string, hostname = ""): "customer" | "salon" | "admin" {
  if (/^\/(admin|superadmin)(\/|$)/.test(pathname)) return "admin";
  if (/^\/business(\/|$)/.test(pathname) || /^\/salon\/(dashboard|login|signup|onboarding|setup-guide|application-submitted)(\/|$)/.test(pathname)) return "salon";
  // Public /salon/:slug pages belong to the customer's session. Only the
  // configured dashboard host uses short /salon/:section owner URLs.
  const salonHost = process.env.NEXT_PUBLIC_SALON_DASHBOARD_HOST || "dashboard.girlzculture.com";
  if (hostname.toLowerCase() === salonHost.toLowerCase() && /^\/salon(\/|$)/.test(pathname)) return "salon";
  return "customer";
}

export const localeStorageKey = (scope: string, userId: string | null) => userId
  ? `girlz-culture-locale:${scope}:${userId}` : "girlz-culture-locale";
export function preferredLocale(input: { userId: string | null; accountLocale?: unknown; accountCachedLocale?: string | null; anonymousLocale?: string | null; fallback?: string }) {
  if (input.userId) return normalizeLocale(input.accountLocale || input.accountCachedLocale || input.fallback || "en");
  return normalizeLocale(input.anonymousLocale || input.fallback || "en");
}
