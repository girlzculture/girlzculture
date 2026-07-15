import { requireAdminPermission } from "@/lib/supabaseAdmin";

const pageFields = ["slug", "title", "eyebrow", "hero_title", "hero_subtitle", "hero_image_url", "background_image_url", "hero_position_x", "hero_position_y", "hero_zoom", "page_group", "sections", "labels", "seo_title", "seo_description", "status", "is_enabled"] as const;
const postFields = ["id", "slug", "title", "excerpt", "content", "category", "cover_image_url", "author", "featured", "status", "published_at"] as const;

function pick(payload: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(fields.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
}

function validSlug(value: unknown) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

const safeSectionTypes = new Set(["text", "card_grid", "carousel", "banner", "community_carousel"]);
const safeCardTypes = new Set(["image", "video", "link", "salon"]);
const text = (value: unknown, maximum: number) => String(value || "").trim().slice(0, maximum);
function safeUrl(value: unknown) {
  const url = text(value, 1200);
  if (!url || url.startsWith("/")) return url;
  try { const parsed = new URL(url); return parsed.protocol === "https:" ? parsed.toString() : ""; } catch { return ""; }
}
function sanitizeSections(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((raw) => {
    const section = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const type = safeSectionTypes.has(String(section.type)) ? String(section.type) : "text";
    const maximum = type === "community_carousel" ? 20 : 12;
    const cards = Array.isArray(section.cards) ? section.cards.slice(0, maximum).map((rawCard) => {
      const card = rawCard && typeof rawCard === "object" ? rawCard as Record<string, unknown> : {};
      const contentType = safeCardTypes.has(String(card.content_type)) ? String(card.content_type) : "image";
      const salonId = contentType === "salon" && /^[0-9a-f-]{36}$/i.test(text(card.salon_id, 50)) ? text(card.salon_id, 50) : "";
      return { id: text(card.id, 80), content_type: contentType, salon_id: salonId, title: text(card.title, 120), body: text(card.body, 1200), media_url: safeUrl(card.media_url), href: safeUrl(card.href) };
    }) : [];
    return { id: text(section.id, 80), type, title: text(section.title, 140), body: text(section.body, 20000), is_visible: section.is_visible !== false, columns: [2,3,4].includes(Number(section.columns)) ? Number(section.columns) : 4, cta_label: text(section.cta_label, 80), cta_href: safeUrl(section.cta_href), cards };
  });
}

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "content");
    const [pages, posts, masterStyles, serviceCategories, serviceGroups, serviceAddons, salons, products] = await Promise.all([
      admin.from("content_pages").select("*").order("slug"),
      admin.from("blog_posts").select("*").order("updated_at", { ascending: false }),
      admin.from("master_styles").select("*,service_category:service_categories(id,name,slug),service_group:service_groups(id,name,category_id)").order("name"),
      admin.from("service_categories").select("*").order("name"),
      admin.from("service_groups").select("*,service_category:service_categories(id,name,slug)").order("name"),
      admin.from("service_addons").select("*,service_category:service_categories(id,name,slug)").order("name"),
      admin.from("salons").select("id,name,slug,cover_photo_url,address_city,address_state").eq("status", "Active").eq("is_discoverable", true).not("slug", "is", null).order("name"),
      admin.from("salon_products").select("id,name,salon:salons(name,slug)").eq("is_visible", true).order("name"),
    ]);
    if (pages.error) throw pages.error;
    if (posts.error) throw posts.error;
    if (masterStyles.error) throw masterStyles.error;
    if (serviceCategories.error) throw serviceCategories.error;
    if (serviceGroups.error) throw serviceGroups.error;
    if (serviceAddons.error) throw serviceAddons.error;
    if (salons.error) throw salons.error;
    if (products.error) throw products.error;
    const linkTargets = [
      ...(salons.data || []).map((salon) => ({ id: salon.id, type: "Salon", label: salon.name, href: `/salon/${salon.slug}`, media_url: salon.cover_photo_url || "", body: [salon.address_city, salon.address_state].filter(Boolean).join(", ") })),
      ...(products.data || []).flatMap((product) => {
        const salon = Array.isArray(product.salon) ? product.salon[0] : product.salon;
        return salon?.slug ? [{ type: "Product", label: `${product.name} â€” ${salon.name}`, href: `/salon/${salon.slug}/product/${product.id}` }] : [];
      }),
    ];
    return Response.json({ pages: pages.data || [], posts: posts.data || [], masterStyles: masterStyles.data || [], serviceCategories: serviceCategories.data || [], serviceGroups: serviceGroups.data || [], serviceAddons: serviceAddons.data || [], linkTargets });
  } catch (error) {
    console.error("Admin content load failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load content" }, { status: 403 });
  }
}

export async function PUT(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "content");
    const { type, payload } = await request.json() as { type: "page" | "post" | "master_style" | "service_category" | "service_group" | "service_addon"; payload: Record<string, unknown> };
    if (!payload) return Response.json({ error: "Content payload is required." }, { status: 400 });

    if (type === "master_style") {
      const name = String(payload.name || "").trim().slice(0, 100);
      const groupId = String(payload.service_group_id || "").trim();
      if (!name || !/^[0-9a-f-]{36}$/i.test(groupId)) return Response.json({ error: "Service name and service group are required." }, { status: 400 });
      const { data: group, error: groupError } = await admin.from("service_groups").select("id,name,category_id").eq("id", groupId).eq("is_active", true).maybeSingle();
      if (groupError) throw groupError;
      if (!group) return Response.json({ error: "Choose an active service group." }, { status: 400 });
      const record = { name, category: group.name, category_id: group.category_id, service_group_id: group.id, is_active: payload.is_active !== false, updated_at: new Date().toISOString() };
      const query = payload.id
        ? admin.from("master_styles").update(record).eq("id", payload.id).select().single()
        : admin.from("master_styles").insert(record).select().single();
      const { data, error } = await query;
      if (error) throw error;
      console.info("Admin master style saved", { styleId: data.id, name: data.name, admin: user.email });
      return Response.json({ data });
    }

    if (type === "service_category") {
      const name = text(payload.name, 80);
      const slug = text(payload.slug, 80).toLowerCase();
      if (!name || !validSlug(slug)) return Response.json({ error: "Category name and a lowercase URL slug are required." }, { status: 400 });
      const record = { name, slug, description: text(payload.description, 500) || null, is_active: payload.is_active !== false, updated_at: new Date().toISOString() };
      const query = payload.id ? admin.from("service_categories").update(record).eq("id", payload.id).select().single() : admin.from("service_categories").insert(record).select().single();
      const { data, error } = await query;
      if (error) throw error;
      console.info("Admin service category saved", { id: data.id, name: data.name, admin: user.email });
      return Response.json({ data });
    }

    if (type === "service_group" || type === "service_addon") {
      const name = text(payload.name, 80);
      const categoryId = text(payload.category_id, 50);
      if (!name || !/^[0-9a-f-]{36}$/i.test(categoryId)) return Response.json({ error: "Name and category are required." }, { status: 400 });
      const { data: category, error: categoryError } = await admin.from("service_categories").select("id").eq("id", categoryId).eq("is_active", true).maybeSingle();
      if (categoryError) throw categoryError;
      if (!category) return Response.json({ error: "Choose an active service category." }, { status: 400 });
      const table = type === "service_group" ? "service_groups" : "service_addons";
      const record = { name, category_id: categoryId, is_active: payload.is_active !== false, updated_at: new Date().toISOString() };
      const query = payload.id ? admin.from(table).update(record).eq("id", payload.id).select().single() : admin.from(table).insert(record).select().single();
      const { data, error } = await query;
      if (error) throw error;
      console.info(`Admin ${type} saved`, { id: data.id, name: data.name, admin: user.email });
      return Response.json({ data });
    }

    if (!validSlug(payload.slug)) return Response.json({ error: "Enter a valid lowercase page slug." }, { status: 400 });

    if (type === "page") {
      const record = {
        ...pick(payload, pageFields),
        sections: sanitizeSections(payload.sections),
        hero_position_x: Math.min(100, Math.max(0, Number(payload.hero_position_x ?? 50))),
        hero_position_y: Math.min(100, Math.max(0, Number(payload.hero_position_y ?? 50))),
        hero_zoom: Math.min(2.5, Math.max(1, Number(payload.hero_zoom ?? 1))),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
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
    const { admin, user } = await requireAdminPermission(request, "content");
    const { id, type = "post" } = await request.json() as { id?: string; type?: "post" | "master_style" | "service_category" | "service_group" | "service_addon" };
    if (!id) return Response.json({ error: "Record ID is required" }, { status: 400 });
    const table = ({ post: "blog_posts", master_style: "master_styles", service_category: "service_categories", service_group: "service_groups", service_addon: "service_addons" } as const)[type];
    if (!table) return Response.json({ error: "Unknown catalog record type" }, { status: 400 });
    const { error } = await admin.from(table).delete().eq("id", id);
    if (error) throw error;
    console.info("Admin content record deleted", { id, type, admin: user.email });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Admin blog delete failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unable to delete post" }, { status: 500 });
  }
}
