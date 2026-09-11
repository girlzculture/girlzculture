// Generated only from the founder-approved PNG; the hash changes with its bytes.
export const DEFAULT_FAVICON_HREF = "/brand/girlz-culture-favicon.4ebd6933f8981c9a.ico";

type PublishedFavicon = {
  published_url?: string | null;
  published_version?: number | null;
};

const LOCAL_ORIGIN = "https://favicon-local.invalid";
type FaviconOrigin = { storageUrl?: string; acceptanceHarness?: boolean };

function approvedFaviconUrl(value: string, origin: FaviconOrigin): URL | null {
  if (!value || value !== value.trim() || /[\\\s<>\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\<>\u0000-\u001f\u007f]/.test(decoded)) return null;
    if (value.startsWith("/")) {
      if (value.startsWith("//") || decoded.startsWith("//")) return null;
      const url = new URL(value, LOCAL_ORIGIN);
      if (url.origin !== LOCAL_ORIGIN || url.pathname.startsWith("//") || !/\.(?:png|ico|svg)$/i.test(url.pathname)) return null;
      // The implicit browser route redirects here; never redirect it to itself.
      if (decodeURIComponent(url.pathname).toLowerCase() === "/favicon.ico") return null;
      return url;
    }
    const url = new URL(value);
    const storage = new URL((origin.storageUrl || "").replace(/\/rest\/v1\/?$/i, ""));
    const localFixture = origin.acceptanceHarness === true
      && storage.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(storage.hostname);
    if ((url.protocol !== "https:" && !localFixture) || url.origin !== storage.origin || url.username || url.password) return null;
    return url.pathname.startsWith("/storage/v1/object/public/platform-brand-assets/") ? url : null;
  } catch {
    return null;
  }
}

/** Published Engine identity wins; each publication has one stable cache key. */
export function getPublishedFaviconHref(asset?: PublishedFavicon | null, origin: FaviconOrigin = {
  storageUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  acceptanceHarness: process.env.NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS === "true",
}): string {
  const version = asset?.published_version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1 || typeof asset?.published_url !== "string") return DEFAULT_FAVICON_HREF;
  const url = approvedFaviconUrl(asset.published_url, origin);
  if (!url) return DEFAULT_FAVICON_HREF;
  // Replaces duplicate and historical timestamp versions while retaining all
  // other query values and the fragment. Restore creates a new published version.
  url.searchParams.set("v", String(version));
  return url.origin === LOCAL_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : url.href;
}
