import { requireAdmin } from "@/lib/supabaseAdmin";

const pageFields = ["slug", "title", "eyebrow", "hero_title", "hero_subtitle", "hero_image_url", "background_image_url", "sections", "labels", "seo_title", "seo_description", "status"] as const;
const postFields = ["id", "slug", "title", "excerpt", "content", "category", "cover_image_url", "author", "featured", "status", "published_at"] as const;

function pick(payload: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(fields.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
}

function validSlug(value: unknown) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdmin(request);
    const [pages, posts] = await Promise.all([
      admin.from("content_pages").select("*").order("slug"),
      admin.from("blog_posts").select("*").order("updated_at", { ascending: false }),
    ]);
    if (pages.error) throw pages.error;
    if (posts.error) throw posts.error;
    return Response.json({ pages: pages.data || [], posts: posts.data || [] });
  } catch (error) {
    console.error("Admin content load failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load content" }, { status: 403 });
  }
}

export async function PUT(request: Request) {
  try {
    const { admin, user } = await requireAdmin(request);
    const { type, payload } = await request.json() as { type: "page" | "post"; payload: Record<string, unknown> };
    if (!payload || !validSlug(payload.slug)) return Response.json({ error: "Enter a valid lowercase page slug." }, { status: 400 });

    if (type === "page") {
      const record = { ...pick(payload, pageFields), updated_by: user.id, updated_at: new Date().toISOString() };
      const { data, error } = await admin.from("content_pages").upsert(record, { onConflict: "slug" }).select().single();
      if (error) throw error;
      console.info("Admin page content saved", { slug: data.slug, admin: user.email });
      return Response.json({ data });
    }

    if (type === "post") {
      const record = { ...pick(payload, postFields), updated_at: new Date().toISOString() };
      const { data, error } = await admin.from("blog_posts").upsert(record, { onConflict: payload.id ? "id" : "slug" }).select().single();
      if (error) throw error;
      console.info("Admin blog post saved", { slug: data.slug, admin: user.email });
      return Response.json({ data });
    }

    return Response.json({ error: "Unknown content type" }, { status: 400 });
  } catch (error) {
    console.error("Admin content save failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save content" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin, user } = await requireAdmin(request);
    const { id } = await request.json() as { id?: string };
    if (!id) return Response.json({ error: "Post ID is required" }, { status: 400 });
    const { error } = await admin.from("blog_posts").delete().eq("id", id);
    if (error) throw error;
    console.info("Admin blog post deleted", { id, admin: user.email });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Admin blog delete failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete post" }, { status: 500 });
  }
}
