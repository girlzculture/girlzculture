import "server-only";

import { supabase } from "@/lib/supabase";
import { capturePlatformError } from "@/lib/platformErrors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type ContentCard = {
  id?: string;
  content_type?: "image" | "video" | "link" | "salon";
  salon_id?: string;
  title?: string;
  body?: string;
  media_url?: string;
  href?: string;
};
export type ContentSection = {
  id?: string;
  type?: "text" | "card_grid" | "carousel" | "banner" | "community_carousel";
  title?: string;
  body?: string;
  image_url?: string;
  cta_label?: string;
  cta_href?: string;
  is_visible?: boolean;
  columns?: number;
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
export type NavigationItem = { id?:string;surface:"header"|"mobile_menu"|"mobile_bottom"|"footer";group_key:string;item_key:string;label:string;translation_key?:string|null;href:string;sort_order:number;is_enabled?:boolean;show_new_badge?:boolean };
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
  const { data, error } = await supabase.from("content_pages").select("*").eq("slug", slug).eq("status", "Published").maybeSingle();
  if (error) await reportPublicContentFailure(error, "load-content-page", "content_page", slug);
  return (data as ContentPage | null) || fallback;
}

export async function getPublishedContentPage(slug: string) {
  const { data, error } = await supabase.from("content_pages").select("*").eq("slug", slug).eq("status", "Published").eq("is_enabled", true).maybeSingle();
  if (error) await reportPublicContentFailure(error, "load-published-content-page", "content_page", slug);
  return data as ContentPage | null;
}

export async function getVisibleLegalLinks() {
  const slugs = LEGAL_LINKS.map(([, , slug]) => slug);
  const { data, error } = await supabase.from("content_pages").select("slug").in("slug", slugs).eq("status", "Published").eq("is_enabled", true);
  if (error) {
    await reportPublicContentFailure(error, "load-visible-legal-links", "content_page");
    return [];
  }
  const visible = new Set((data || []).map((row) => row.slug));
  return LEGAL_LINKS.filter(([, , slug]) => visible.has(slug)).map(([label, href]) => [label, href] as [string, string]);
}

export async function getNavigationItems(surface:NavigationItem["surface"],fallback:NavigationItem[]){
  const{data,error}=await supabase.from("navigation_items").select("id,surface,group_key,item_key,label,translation_key,href,sort_order,is_enabled,show_new_badge").eq("surface",surface).eq("is_enabled",true).is("archived_at",null).order("sort_order");
  if(error){await reportPublicContentFailure(error,"load-navigation-items","navigation_surface",surface);return fallback}
  return(data?.length?data:fallback) as NavigationItem[];
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
