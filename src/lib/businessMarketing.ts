import { BUSINESS_MARKETING_DRAFT_MESSAGES } from "@/i18n/business-marketing-draft-messages";
export const MARKETING_LOCALES = ["en", "fr", "es", "zh-CN"] as const;
export type MarketingLocale = typeof MARKETING_LOCALES[number];
export type MarketingSource = { photo_urls: string[]; service_id: string | null; promotion_id: string | null; booking_id: string | null };
export type MarketingCopy = { title: string; body: string; tags: string[] };
export type MarketingCopies = Record<MarketingLocale, MarketingCopy>;
export type MarketingSnapshot = {
  business: { id: string; name: string; slug: string; vanity_slug?: string | null; time_zone: string };
  photos: { url: string; category: string; title: string }[];
  service: { id: string; name: string; base_price: number | null; price_display_min: number | null; price_display_max: number | null } | null;
  promotion: { id: string; title: string; promotion_type: string; discount_value: number | null; starts_at: string | null; ends_at: string | null; terms: string } | null;
  completed_service: { id: string; style_id: string; completed_at: string | null } | null;
};
export type MarketingPost = {
  id: string; revision: number; status: "draft" | "scheduled" | "published" | "cancelled" | "needs_review" | "expired";
  source: MarketingSource; snapshot: MarketingSnapshot; copies: MarketingCopies;
  booking_path: string; public_path: string; scheduled_at: string | null; expires_at: string | null;
  published_at: string | null; updated_at: string; last_error: string | null;
};
export class MarketingInputError extends Error {
  constructor(public code: string) { super(code); }
}
const invalid = (code = "MARKETING_INVALID"): never => { throw new MarketingInputError(code); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function marketingRecord(value: unknown, allowed: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !allowed.includes(key))) return invalid();
  return row;
}
export function marketingId(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !uuid.test(value)) return invalid();
  return value;
}
export function marketingRevision(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 1) return invalid();
  return Number(value);
}
export function marketingSource(value: unknown): MarketingSource {
  const row = marketingRecord(value, ["photo_urls", "service_id", "promotion_id", "booking_id"]);
  if (!Array.isArray(row.photo_urls) || row.photo_urls.length > 4 || row.photo_urls.some(url => typeof url !== "string" || url.length > 2048)) return invalid();
  const photos = row.photo_urls as string[];
  for (const photo of photos) {
    try { const url = new URL(photo); if (url.protocol !== "https:" || url.username || url.password) invalid(); } catch { invalid(); }
  }
  if (new Set(photos).size !== photos.length) return invalid();
  const source = { photo_urls: photos, service_id: marketingId(row.service_id, true), promotion_id: marketingId(row.promotion_id, true), booking_id: marketingId(row.booking_id, true) };
  if (!photos.length && !source.service_id && !source.promotion_id && !source.booking_id) return invalid("MARKETING_SOURCE_REQUIRED");
  return source;
}
function copyText(value: unknown, maximum: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return invalid();
  // The reviewed destination is a separate server-derived field. An edited
  // caption cannot replace it with an unverified or another business's URL.
  if (/https?:\/\/|www\./iu.test(value)) return invalid("MARKETING_LINK_IN_COPY");
  return value.trim();
}
export function marketingCopies(value: unknown): MarketingCopies {
  const row = marketingRecord(value, MARKETING_LOCALES);
  return Object.fromEntries(MARKETING_LOCALES.map(locale => {
    const copy = marketingRecord(row[locale], ["title", "body", "tags"]);
    if (!Array.isArray(copy.tags) || copy.tags.length > 8 || copy.tags.some(tag => typeof tag !== "string" || !/^#[\p{L}\p{N}_]{1,60}$/u.test(tag))) return invalid();
    return [locale, { title: copyText(copy.title, 160), body: copyText(copy.body, 2400), tags: [...new Set(copy.tags)] }];
  })) as MarketingCopies;
}
export function marketingDestinations(snapshot: MarketingSnapshot) {
  if (!/^[a-z0-9-]+$/.test(snapshot.business.slug) || snapshot.business.slug.startsWith("pending-")) return invalid("MARKETING_PAGE_NOT_READY");
  const vanity = snapshot.business.vanity_slug;
  if (vanity && !/^[a-z0-9-]+$/.test(vanity)) return invalid("MARKETING_PAGE_NOT_READY");
  const params = new URLSearchParams();
  if (snapshot.service) params.set("style", snapshot.service.id);
  if (snapshot.promotion) params.set("promotion", snapshot.promotion.id);
  return {
    public_path: vanity ? `/${vanity}` : `/salon/${snapshot.business.slug}`,
    booking_path: `/salon/${snapshot.business.slug}/book${params.size ? `?${params}` : ""}`,
  };
}
function money(value: number) { return `USD ${value.toFixed(2)}`; }
function servicePrice(snapshot: MarketingSnapshot) {
  const service = snapshot.service;
  if (!service) return "";
  const low = service.price_display_min ?? service.base_price;
  const high = service.price_display_max ?? low;
  if (low === null || !Number.isFinite(Number(low)) || Number(low) < 0 || high !== null && (!Number.isFinite(Number(high)) || Number(high) < Number(low))) return "";
  return high !== null && Number(high) > Number(low) ? `${money(Number(low))}–${money(Number(high))}` : money(Number(low));
}
/** Deterministic multilingual copy uses only current, scoped facts. No image
 * analysis, customer identities, invented outcomes or extra provider call. */
export function draftMarketingCopies(snapshot: MarketingSnapshot): MarketingCopies {
  const business = snapshot.business.name;
  const service = snapshot.service?.name;
  const price = servicePrice(snapshot);
  const promo = snapshot.promotion;
  const amount = promo?.discount_value == null ? null : Number(promo.discount_value);
  const offer = promo?.promotion_type === "percentage" && amount !== null ? `${Math.min(100, Math.max(0, amount))}%`
    : promo?.promotion_type === "fixed" && amount !== null ? money(Math.max(0, amount)) : null;
  const fullTitle = service ? `${service} · ${business}` : business;
  // Keep full names in the body; a valid long catalog name must not make
  // preparation impossible merely because two names exceed the headline cap.
  const title = fullTitle.length <= 160 ? fullTitle : (service || business).slice(0, 160);
  const tag = service?.replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 60);
  const tags = ["#GirlzCulture", ...(tag ? [`#${tag}`] : [])];
  const values: Record<string, string> = { business, service: service || "", price, offer: offer || "" };
  const interpolate = (template: string) => template.replace(/\{(business|service|price|offer)\}/g, (_, key: string) => values[key]);
  return marketingCopies(Object.fromEntries(MARKETING_LOCALES.map(locale => {
    const copy = BUSINESS_MARKETING_DRAFT_MESSAGES[locale];
    const body = [service ? copy.service : copy.portfolio, ...(price ? [copy.price] : []), ...(promo ? [offer ? copy.discount : copy.offer] : []), copy.cta].map(interpolate).join("\n\n");
    return [locale, { title, body, tags }];
  })));
}
export function marketingPublication(value: unknown, now = Date.now()) {
  const row = marketingRecord(value, ["action", "id", "revision", "scheduled_at", "expires_at", "reviewed_locales", "media_permission", "confirm"]);
  const reviewed = row.reviewed_locales;
  if (row.action !== "approve" || row.confirm !== true || row.media_permission !== true || !Array.isArray(reviewed) || reviewed.length !== 4 || new Set(reviewed).size !== 4 || MARKETING_LOCALES.some(locale => !reviewed.includes(locale))) return invalid("MARKETING_REVIEW_REQUIRED");
  const scheduled = row.scheduled_at === null ? new Date(now).toISOString() : row.scheduled_at;
  if (typeof scheduled !== "string" || typeof row.expires_at !== "string" || !/Z$|[+-]\d{2}:\d{2}$/.test(scheduled) || !/Z$|[+-]\d{2}:\d{2}$/.test(row.expires_at)) return invalid("MARKETING_SCHEDULE_INVALID");
  const starts = Date.parse(scheduled), ends = Date.parse(row.expires_at);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || starts < now - 60_000 || starts > now + 180 * 86400_000 || ends <= starts || ends > now + 366 * 86400_000) return invalid("MARKETING_SCHEDULE_INVALID");
  return { id: marketingId(row.id)!, revision: marketingRevision(row.revision), scheduled_at: new Date(starts).toISOString(), expires_at: new Date(ends).toISOString() };
}
