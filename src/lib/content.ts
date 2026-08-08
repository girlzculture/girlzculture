import "server-only";

import { supabase } from "@/lib/supabase";
import { capturePlatformError } from "@/lib/platformErrors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const PUBLIC_CONTENT_READ_TIMEOUT_MS = 2_500;

export type ContentCard = {
  id?: string;
  content_type?: "image" | "video" | "link" | "salon";
  source_kind?: "upload" | "video" | "salon" | "blog" | "custom" | "campaign";
  association_type?: "salon" | "campaign";
  salon_id?: string;
  campaign_id?: string;
  title?: string;
  body?: string;
  media_url?: string;
  href?: string;
  cta_label?: string;
  alt_text?: string;
  status?: "Draft" | "Active" | "Archived";
  starts_at?: string;
  ends_at?: string;
  market_id?: string;
  target_label?: string;
  target_latitude?: number;
  target_longitude?: number;
  radius_miles?: number;
  priority?: number;
  rotation_weight?: number;
  editorial_fallback?: boolean;
  /** Server-provided per-visitor display intent; never persisted on a card. */
  display_limit?: number;
};
export type ContentSection = {
  id?: string;
  type?: "text" | "card_grid" | "carousel" | "banner" | "community_carousel" | "promo_rail";
  title?: string;
  body?: string;
  image_url?: string;
  cta_label?: string;
  cta_href?: string;
  is_visible?: boolean;
  columns?: number;
  /** Number selected for one visitor; the national source pool may be larger. */
  display_limit?: number;
  scroll_direction?: "forward" | "reverse";
  cards?: ContentCard[];
};
export type ContentPage = {
  slug: string;
  title: string;
  eyebrow?: string;
  hero_title?: string;
  hero_subtitle?: string;
  hero_image_url?: string;
  background_image_url?: string;
  hero_position_x?: number;
  hero_position_y?: number;
  hero_zoom?: number;
  page_group?: string;
  sections?: ContentSection[];
  labels?: Record<string, string>;
  is_enabled?: boolean;
};
export type BlogPost = { id?: string; slug: string; title: string; excerpt?: string; content: string; category: string; cover_image_url?: string; author?: string; featured?: boolean; published_at?: string };
export type NavigationItem = { id?:string;surface:"header"|"mobile_menu"|"mobile_bottom"|"footer";group_key:string;item_key:string;label:string;translation_key?:string|null;href:string;sort_order:number;is_enabled?:boolean;show_new_badge?:boolean;archived_at?:string|null };
// Kept as an empty compatibility export while older routes transition away from fallbacks.
export const fallbackPosts: BlogPost[] = [];

async function reportPublicContentFailure(
  error: unknown,
  action: string,
  recordType: string,
  recordId?: string,
) {
  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    admin = undefined;
  }
  return capturePlatformError({
    admin,
    error,
    feature: "public-content",
    action,
    actorRole: "public",
    recordType,
    recordId: recordId || null,
    provider: "supabase",
    safeMessage: "Published content could not be loaded.",
    severity: "high",
    metadata: { fallback_used: true },
  });
}

export const LEGAL_LINKS = [
  ["Terms of Service", "/terms", "terms"],
  ["Privacy Policy", "/privacy", "privacy"],
  ["Cookie & Tracking Notice", "/cookie-notice", "cookie-notice"],
  ["Deposit & Refund Policy", "/deposit-refund-policy", "deposit-refund-policy"],
  ["Salon Partner Agreement", "/salon-partner-agreement", "salon-partner-agreement"],
  ["Photo & Content Consent", "/photo-content-consent", "photo-content-consent"],
  ["Message Monitoring Disclosure", "/message-monitoring-disclosure", "message-monitoring-disclosure"],
  ["Do Not Sell or Share My Information", "/do-not-sell-or-share", "do-not-sell-or-share"],
  ["Accessibility Statement", "/accessibility", "accessibility"],
  ["Community Guidelines", "/community-guidelines", "community-guidelines"],
] as const;

export async function getContentPage(slug: string, fallback: ContentPage) {
  try {
    const { data, error } = await supabase
      .from("content_pages")
      .select("*")
      .eq("slug", slug)
      .eq("status", "Published")
      .abortSignal(AbortSignal.timeout(PUBLIC_CONTENT_READ_TIMEOUT_MS))
      .maybeSingle();
    if (error) throw error;
    return (data as ContentPage | null) || fallback;
  } catch (error) {
    await reportPublicContentFailure(
      error,
      "load-content-page",
      "content_page",
      slug,
    );
    return fallback;
  }
}

export async function getPublishedContentPage(slug: string) {
  try {
    const { data, error } = await supabase
      .from("content_pages")
      .select("*")
      .eq("slug", slug)
      .eq("status", "Published")
      .eq("is_enabled", true)
      .abortSignal(AbortSignal.timeout(PUBLIC_CONTENT_READ_TIMEOUT_MS))
      .maybeSingle();
    if (error) throw error;
    return data as ContentPage | null;
  } catch (error) {
    await reportPublicContentFailure(
      error,
      "load-published-content-page",
      "content_page",
      slug,
    );
    return null;
  }
}

export async function getVisibleLegalLinks() {
  const slugs = new Set(LEGAL_LINKS.map(([, , slug]) => slug));
  const { data, error } = await supabase
    .from("content_pages")
    .select("slug,title,page_group")
    .eq("status", "Published")
    .eq("is_enabled", true);
  if (error) {
    await reportPublicContentFailure(error, "load-visible-legal-links", "content_page");
    return [];
  }
  const legalRows = (data || []).filter(
    (row) => row.slug !== "legal" && (slugs.has(row.slug) || row.page_group === "Legal"),
  );
  const visible = new Map(legalRows.map((row) => [row.slug, row.title]));
  const known = LEGAL_LINKS
    .filter(([, , slug]) => visible.has(slug))
    .map(([label, href, slug]) => [String(visible.get(slug) || label), href] as [string, string]);
  const additional = legalRows
    .filter((row) => !slugs.has(row.slug))
    .sort((left, right) => String(left.title || left.slug).localeCompare(String(right.title || right.slug)))
    .map((row) => [String(row.title || row.slug), `/${row.slug}`] as [string, string]);
  return [...known, ...additional];
}

export async function getNavigationItems(surface:NavigationItem["surface"],fallback:NavigationItem[]){
  // The public projection returns only publishable links plus a separate
  // configured flag. This preserves an administrator-authored all-disabled
  // surface without exposing disabled or archived destinations to visitors.
  const{data,error}=await supabase.rpc("get_public_navigation_surface",{p_surface:surface});
  if(error){await reportPublicContentFailure(error,"load-navigation-items","navigation_surface",surface);return fallback}
  const payload = data && typeof data === "object" && !Array.isArray(data)
    ? data as { configured?: unknown; items?: unknown }
    : null;
  if(payload?.configured !== true)return fallback;
  return Array.isArray(payload.items) ? payload.items as NavigationItem[] : [];
}

export async function getBlogPosts() {
  try {
    const { data, error } = await supabase.from("blog_posts").select("*").eq("status", "Published").is("archived_at", null).order("featured", { ascending: false }).order("published_at", { ascending: false }).abortSignal(AbortSignal.timeout(7_000));
    if (error) await reportPublicContentFailure(error, "load-blog-post-list", "blog_post");
    return (data || []) as BlogPost[];
  } catch (error) {
    await reportPublicContentFailure(error, "load-blog-post-list", "blog_post");
    return [];
  }
}

export async function getBlogPost(slug: string) {
  try {
    const { data, error } = await supabase.from("blog_posts").select("*").eq("slug", slug).eq("status", "Published").is("archived_at", null).abortSignal(AbortSignal.timeout(7_000)).maybeSingle();
    if (error) await reportPublicContentFailure(error, "load-blog-post", "blog_post", slug);
    return data as BlogPost | null;
  } catch (error) {
    await reportPublicContentFailure(error, "load-blog-post", "blog_post", slug);
    return null;
  }
}
