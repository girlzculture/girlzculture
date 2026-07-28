import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { revalidatePath } from "next/cache";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { sortCatalogRecords } from "@/lib/catalogOrdering";

const pageFields = ["slug", "title", "eyebrow", "hero_title", "hero_subtitle", "hero_image_url", "background_image_url", "hero_position_x", "hero_position_y", "hero_zoom", "page_group", "sections", "labels", "seo_title", "seo_description", "status", "is_enabled"] as const;
const postFields = ["id", "slug", "title", "excerpt", "content", "category", "cover_image_url", "author", "featured", "status", "published_at"] as const;

function pick(payload: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(fields.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
}

function validSlug(value: unknown) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

const safeSectionTypes = new Set(["text", "card_grid", "carousel", "banner", "community_carousel", "promo_rail"]);
const safeCardTypes = new Set(["image", "video", "link", "salon"]);
const text = (value: unknown, maximum: number) => String(value || "").trim().slice(0, maximum);
function safeUrl(value: unknown) {
  const url = text(value, 1200);
  if (!url || url.startsWith("/")) return url;
  try { const parsed = new URL(url); return parsed.protocol === "https:" ? parsed.toString() : ""; } catch { return ""; }
}
function safeDate(value: unknown) {
  const date = text(value, 40);
  if (!date) return "";
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}
function sanitizeSections(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((raw) => {
    const section = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const type = safeSectionTypes.has(String(section.type)) ? String(section.type) : "text";
    const maximum = type === "community_carousel" ? 20 : type === "promo_rail" ? 8 : 12;
    const cards = Array.isArray(section.cards) ? section.cards.slice(0, maximum).map((rawCard) => {
      const card = rawCard && typeof rawCard === "object" ? rawCard as Record<string, unknown> : {};
      const requestedContentType = safeCardTypes.has(String(card.content_type)) ? String(card.content_type) : "image";
      const contentType = type === "promo_rail" && requestedContentType === "video" ? "image" : requestedContentType;
      const associationType = ["salon", "campaign"].includes(String(card.association_type)) ? String(card.association_type) : contentType === "salon" ? "salon" : "";
      const salonId = associationType === "salon" && /^[0-9a-f-]{36}$/i.test(text(card.salon_id, 50)) ? text(card.salon_id, 50) : "";
      const campaignId = associationType === "campaign" && /^[0-9a-f-]{36}$/i.test(text(card.campaign_id, 50)) ? text(card.campaign_id, 50) : "";
      const status = ["Draft", "Active", "Archived"].includes(String(card.status)) ? String(card.status) : "Active";
      return { id: text(card.id, 80), content_type: contentType, association_type: associationType, salon_id: salonId, campaign_id: campaignId, title: text(card.title, 120), body: text(card.body, 1200), media_url: safeUrl(card.media_url), href: safeUrl(card.href), cta_label: text(card.cta_label, 60), alt_text: text(card.alt_text, 180), status, starts_at: safeDate(card.starts_at), ends_at: safeDate(card.ends_at) };
    }) : [];
    return { id: text(section.id, 80), type, title: text(section.title, 140), body: text(section.body, 20000), is_visible: section.is_visible !== false, columns: [2,3,4].includes(Number(section.columns)) ? Number(section.columns) : 4, cta_label: text(section.cta_label, 80), cta_href: safeUrl(section.cta_href), cards };
  });
}

async function validatePromotionAssociations(
  admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"],
  sections: ReturnType<typeof sanitizeSections>,
) {
  const cards = sections
    .filter((section) => section.type === "promo_rail")
    .flatMap((section) => section.cards);
  for (const card of cards) {
    if (card.starts_at && card.ends_at && Date.parse(card.ends_at) <= Date.parse(card.starts_at)) {
      rejectRequest(`Promotion card "${card.title || card.id}" must end after it starts.`);
    }
    if (card.association_type === "salon") {
      if (!card.salon_id) rejectRequest("Choose an eligible salon for every associated promotion card.");
      const { data, error } = await admin.rpc("is_marketplace_visible", { target_salon_id: card.salon_id });
      if (error) throw error;
      if (!data) rejectRequest("That salon is not currently eligible for a public promotion.");
    }
    if (card.association_type === "campaign") {
      if (!card.campaign_id) rejectRequest("Choose an eligible paid campaign.");
      const { data: campaign, error } = await admin
        .from("featured_salon_campaigns")
        .select("id,salon_id,status,starts_at,ends_at,entitlement:marketing_entitlements(status,valid_from,valid_until)")
        .eq("id", card.campaign_id)
        .maybeSingle();
      if (error) throw error;
      const entitlement = Array.isArray(campaign?.entitlement) ? campaign.entitlement[0] : campaign?.entitlement;
      const eligibleCampaign = campaign
        && ["Scheduled", "Active"].includes(String(campaign.status))
        && Date.parse(campaign.ends_at) > Date.now()
        && ["Paid", "Credited"].includes(String(entitlement?.status || ""));
      if (!eligibleCampaign) rejectRequest("That campaign is paused, expired, unpaid, or no longer eligible.");
      const { data: visible, error: visibilityError } = await admin.rpc("is_marketplace_visible", { target_salon_id: campaign.salon_id });
      if (visibilityError) throw visibilityError;
      if (!visible) rejectRequest("The campaign salon is not currently eligible for public placement.");
    }
  }
}

async function auditContentChange(admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"], userId: string, recordType: string, recordId: string, label: string, beforeValues: unknown, afterValues: unknown) {
  const { error } = await admin.from("record_management_events").insert({
    record_type: recordType,
    record_id: recordId,
    record_label: label,
    action: beforeValues ? "Updated" : "Created",
    before_values: beforeValues || null,
    after_values: afterValues || null,
    reason: "Saved from Content Management",
    acting_user_id: userId,
    acting_scope: "platform_admin",
  });
  if (error) throw error;
}

function revalidatePublishedContent() {
  revalidatePath("/", "layout");
  revalidatePath("/styles");
  revalidatePath("/blog");
  revalidatePath("/salon/[slug]", "page");
}

async function GETHandler(request: Request) {
  let monitoringAdmin;
  try {
    const { admin } = await requireAdminPermission(request, "content");
    monitoringAdmin = admin;
    const [pages, posts, masterStyles, serviceCategories, serviceGroups, serviceAddons, salons, products, campaigns] = await Promise.all([
      admin.from("content_pages").select("*").order("slug"),
      admin.from("blog_posts").select("*").order("updated_at", { ascending: false }),
      admin.from("master_styles").select("*,service_category:service_categories(id,name,slug),service_group:service_groups(id,name,category_id)").order("sort_order").order("name"),
      admin.from("service_categories").select("*").order("sort_order").order("name"),
      admin.from("service_groups").select("*,service_category:service_categories(id,name,slug)").order("sort_order").order("name"),
      admin.from("service_addons").select("*,service_category:service_categories(id,name,slug)").order("sort_order").order("name"),
      admin.from("salons").select("id,name,slug,cover_photo_url,address_city,address_state").eq("status", "Active").eq("is_discoverable", true).not("slug", "is", null).order("name"),
      admin.from("salon_products").select("id,name,salon:salons(name,slug)").eq("is_visible", true).order("name"),
      admin.from("featured_salon_campaigns").select("id,status,starts_at,ends_at,salon_id,entitlement:marketing_entitlements(status,valid_from,valid_until),salon:salons(id,name,slug,cover_photo_url,address_city,address_state)").in("status", ["Scheduled", "Active"]).gt("ends_at", new Date().toISOString()).order("starts_at"),
    ]);
    if (pages.error) throw pages.error;
    if (posts.error) throw posts.error;
    if (masterStyles.error) throw masterStyles.error;
    if (serviceCategories.error) throw serviceCategories.error;
    if (serviceGroups.error) throw serviceGroups.error;
    if (serviceAddons.error) throw serviceAddons.error;
    if (salons.error) throw salons.error;
    if (products.error) throw products.error;
    if (campaigns.error) throw campaigns.error;
    const eligibility = await Promise.all((salons.data || []).map(async (salon) => {
      const { data, error } = await admin.rpc("is_marketplace_visible", { target_salon_id: salon.id });
      if (error) throw error;
      return data ? salon : null;
    }));
    const eligibleSalons = eligibility.filter(Boolean) as NonNullable<(typeof eligibility)[number]>[];
    const eligibleSalonIds = new Set(eligibleSalons.map((salon) => salon.id));
    const linkTargets = [
      ...eligibleSalons.map((salon) => ({ id: salon.id, type: "Salon", label: salon.name, href: `/salon/${salon.slug}`, media_url: salon.cover_photo_url || "", body: [salon.address_city, salon.address_state].filter(Boolean).join(", ") })),
      ...(campaigns.data || []).flatMap((campaign) => {
        const salon = Array.isArray(campaign.salon) ? campaign.salon[0] : campaign.salon;
        const entitlement = Array.isArray(campaign.entitlement) ? campaign.entitlement[0] : campaign.entitlement;
        if (!salon?.slug || !eligibleSalonIds.has(campaign.salon_id) || !["Paid", "Credited"].includes(String(entitlement?.status || ""))) return [];
        return [{ id: campaign.id, salon_id: campaign.salon_id, type: "Campaign", label: `${salon.name} · ${campaign.status}`, href: `/salon/${salon.slug}?campaign=${campaign.id}`, media_url: salon.cover_photo_url || "", body: [salon.address_city, salon.address_state].filter(Boolean).join(", ") }];
      }),
      ...(products.data || []).flatMap((product) => {
        const salon = Array.isArray(product.salon) ? product.salon[0] : product.salon;
        return salon?.slug ? [{ type: "Product", label: `${product.name} â€” ${salon.name}`, href: `/salon/${salon.slug}/product/${product.id}` }] : [];
      }),
    ];
    return Response.json({
      pages: pages.data || [],
      posts: posts.data || [],
      masterStyles: sortCatalogRecords(masterStyles.data),
      serviceCategories: sortCatalogRecords(serviceCategories.data),
      serviceGroups: sortCatalogRecords(serviceGroups.data),
      serviceAddons: sortCatalogRecords(serviceAddons.data),
      linkTargets,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "content-management", action: "load", actorRole: "admin", safeMessage: "Content could not be loaded." });
  }
}

async function PUTHandler(request: Request) {
  let monitoringAdmin;
  try {
    const { admin, user } = await requireAdminPermission(request, "content");
    monitoringAdmin = admin;
    const { type, payload } = await request.json() as { type: "page" | "post" | "master_style" | "service_category" | "service_group" | "service_addon"; payload: Record<string, unknown> };
    if (!payload) return Response.json({ error: "Content payload is required." }, { status: 400 });

    if (type === "master_style") {
      const name = String(payload.name || "").trim().slice(0, 100);
      const groupId = String(payload.service_group_id || "").trim();
      if (!name || !/^[0-9a-f-]{36}$/i.test(groupId)) return Response.json({ error: "Service name and service group are required." }, { status: 400 });
      const { data: group, error: groupError } = await admin.from("service_groups").select("id,name,category_id").eq("id", groupId).eq("is_active", true).maybeSingle();
      if (groupError) throw groupError;
      if (!group) return Response.json({ error: "Choose an active service group." }, { status: 400 });
      const { data: before } = payload.id ? await admin.from("master_styles").select("*").eq("id", payload.id).maybeSingle() : { data: null };
      const record = { name, category: group.name, category_id: group.category_id, service_group_id: group.id, sort_order: Math.max(0, Math.min(100000, Number(payload.sort_order || 0))), is_active: payload.is_active !== false, archived_at: payload.is_active === false ? payload.archived_at || null : null, updated_at: new Date().toISOString() };
      const query = payload.id
        ? admin.from("master_styles").update(record).eq("id", payload.id).select().single()
        : admin.from("master_styles").insert(record).select().single();
      const { data, error } = await query;
      if (error) throw error;
      await auditContentChange(admin, user.id, "master_style", data.id, data.name, before, data);
      revalidatePublishedContent();
      console.info("Admin master style saved", { styleId: data.id, adminUserId: user.id });
      return Response.json({ data });
    }

    if (type === "service_category") {
      const name = text(payload.name, 80);
      const slug = text(payload.slug, 80).toLowerCase();
      if (!name || !validSlug(slug)) return Response.json({ error: "Category name and a lowercase URL slug are required." }, { status: 400 });
      const { data: before } = payload.id ? await admin.from("service_categories").select("*").eq("id", payload.id).maybeSingle() : { data: null };
      const record = { name, slug, description: text(payload.description, 500) || null, sort_order: Math.max(0, Math.min(100000, Number(payload.sort_order || 0))), is_active: payload.is_active !== false, archived_at: payload.is_active === false ? payload.archived_at || null : null, updated_at: new Date().toISOString() };
      const query = payload.id ? admin.from("service_categories").update(record).eq("id", payload.id).select().single() : admin.from("service_categories").insert(record).select().single();
      const { data, error } = await query;
      if (error) throw error;
      await auditContentChange(admin, user.id, "service_category", data.id, data.name, before, data);
      revalidatePublishedContent();
      console.info("Admin service category saved", { id: data.id, adminUserId: user.id });
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
      const { data: before } = payload.id ? await admin.from(table).select("*").eq("id", payload.id).maybeSingle() : { data: null };
      const record = { name, category_id: categoryId, sort_order: Math.max(0, Math.min(100000, Number(payload.sort_order || 0))), is_active: payload.is_active !== false, archived_at: payload.is_active === false ? payload.archived_at || null : null, updated_at: new Date().toISOString() };
      const query = payload.id ? admin.from(table).update(record).eq("id", payload.id).select().single() : admin.from(table).insert(record).select().single();
      const { data, error } = await query;
      if (error) throw error;
      await auditContentChange(admin, user.id, type, data.id, data.name, before, data);
      revalidatePublishedContent();
      console.info(`Admin ${type} saved`, { id: data.id, adminUserId: user.id });
      return Response.json({ data });
    }

    if (!validSlug(payload.slug)) return Response.json({ error: "Enter a valid lowercase page slug." }, { status: 400 });

    if (type === "page") {
      const { data: before } = await admin.from("content_pages").select("*").eq("slug", payload.slug).maybeSingle();
      const sections = sanitizeSections(payload.sections);
      if (payload.slug === "home") {
        const promotionRail = sections.find((section) => section.type === "promo_rail");
        if (!promotionRail || promotionRail.cards.length !== 8) {
          return Response.json(
            { error: "The homepage promotion rail must contain exactly eight cards." },
            { status: 400 },
          );
        }
      }
      await validatePromotionAssociations(admin, sections);
      const record = {
        ...pick(payload, pageFields),
        sections,
        hero_position_x: Math.min(100, Math.max(0, Number(payload.hero_position_x ?? 50))),
        hero_position_y: Math.min(100, Math.max(0, Number(payload.hero_position_y ?? 50))),
        hero_zoom: Math.min(2.5, Math.max(1, Number(payload.hero_zoom ?? 1))),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await admin.from("content_pages").upsert(record, { onConflict: "slug" }).select().single();
      if (error) throw error;
      await auditContentChange(admin, user.id, "content_page", data.slug, data.title, before, data);
      revalidatePublishedContent();
      console.info("Admin page content saved", { slug: data.slug, adminUserId: user.id });
      return Response.json({ data });
    }

    if (type === "post") {
      const { data: before } = payload.id ? await admin.from("blog_posts").select("*").eq("id", payload.id).maybeSingle() : { data: null };
      const record = {
        ...pick(payload, postFields),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await admin.from("blog_posts").upsert(record, { onConflict: payload.id ? "id" : "slug" }).select().single();
      if (error) throw error;
      await auditContentChange(admin, user.id, "blog_post", data.id, data.title, before, data);
      revalidatePublishedContent();
      console.info("Admin blog post saved", { slug: data.slug, adminUserId: user.id });
      return Response.json({ data });
    }

    return Response.json({ error: "Unknown content type" }, { status: 400 });
  } catch (error) {
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "content-management", action: "save", actorRole: "admin", safeMessage: "We couldn't save this content." });
  }
}

async function DELETEHandler(request: Request) {
  let monitoringAdmin;
  try {
    const { admin, user } = await requireAdminPermission(request, "content");
    monitoringAdmin = admin;
    const { id, type = "post" } = await request.json() as { id?: string; type?: "post" | "master_style" | "service_category" | "service_group" | "service_addon" };
    if (!id) return Response.json({ error: "Record ID is required" }, { status: 400 });
    const recordType = ({ post: "blog_post", master_style: "master_style", service_category: "service_category", service_group: "service_group", service_addon: "service_addon" } as const)[type];
    if (!recordType) return Response.json({ error: "Unknown catalog record type" }, { status: 400 });
    const { data, error } = await admin.rpc("admin_manage_catalog_record", {
      p_record_type: recordType,
      p_record_id: id,
      p_action: "delete",
      p_reassign_to: null,
      p_actor_user_id: user.id,
      p_reason: "Deleted from Content Management",
      p_dependency_summary: {},
    });
    if (error) {
      if (/still used|must be archived|cannot|reassign/i.test(error.message)) return Response.json({ error: error.message }, { status: 409 });
      throw error;
    }
    console.info("Admin content record deleted", { id, type, adminUserId: user.id });
    return Response.json({ ok: true, result: data });
  } catch (error) {
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "content-management", action: "delete", actorRole: "admin", safeMessage: "The record could not be deleted safely. Nothing was changed." });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/content", "GET"), GETHandler);
export const PUT = withOperationalMonitoring(routeMonitoringProfile("/api/admin/content", "PUT"), PUTHandler);
export const DELETE = withOperationalMonitoring(routeMonitoringProfile("/api/admin/content", "DELETE"), DELETEHandler);
