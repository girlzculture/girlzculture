import { supabase } from "@/lib/supabase";

export type ContentSection = { title?: string; body?: string; image_url?: string; cta_label?: string; cta_href?: string };
export type ContentPage = {
  slug: string;
  title: string;
  eyebrow?: string;
  hero_title?: string;
  hero_subtitle?: string;
  hero_image_url?: string;
  background_image_url?: string;
  sections?: ContentSection[];
  labels?: Record<string, string>;
};
export type BlogPost = { id?: string; slug: string; title: string; excerpt?: string; content: string; category: string; cover_image_url?: string; author?: string; featured?: boolean; published_at?: string };
// Kept as an empty compatibility export while older routes transition away from fallbacks.
export const fallbackPosts: BlogPost[] = [];

export async function getContentPage(slug: string, fallback: ContentPage) {
  const { data, error } = await supabase.from("content_pages").select("*").eq("slug", slug).eq("status", "Published").maybeSingle();
  if (error) console.error("Public content load failed", { slug, error: error.message });
  return (data as ContentPage | null) || fallback;
}

export async function getBlogPosts() {
  const { data, error } = await supabase.from("blog_posts").select("*").eq("status", "Published").order("featured", { ascending: false }).order("published_at", { ascending: false });
  if (error) console.error("Blog list load failed", error.message);
  return (data || []) as BlogPost[];
}

export async function getBlogPost(slug: string) {
  const { data, error } = await supabase.from("blog_posts").select("*").eq("slug", slug).eq("status", "Published").maybeSingle();
  if (error) console.error("Blog post load failed", { slug, error: error.message });
  return data as BlogPost | null;
}
