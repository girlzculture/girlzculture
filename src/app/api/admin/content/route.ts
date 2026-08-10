import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { revalidatePath } from "next/cache";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { sortCatalogRecords } from "@/lib/catalogOrdering";
import {
  homepagePromotionPreview,
  isHomepagePromotionCardComplete,
  type HomepagePromotionDiagnosticOptions,
} from "@/lib/homePromotionCore";
import type { ContentCard } from "@/lib/content";
import { retainedPublishedVersion } from "@/lib/contentPublicationCore";

const pageFields = ["slug", "title", "eyebrow", "hero_title", "hero_subtitle", "hero_image_url", "background_image_url", "hero_position_x", "hero_position_y", "hero_zoom", "page_group", "sections", "labels", "seo_title", "seo_description"] as const;
const postFields = ["id", "slug", "title", "excerpt", "content", "category", "cover_image_url", "author", "featured"] as const;
type PublicationAction = "save_draft" | "publish" | "schedule" | "unpublish" | "restore" | "archive";

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
    const maximum = type === "community_carousel" ? 20 : type === "promo_rail" ? 200 : 12;
    const cards = Array.isArray(section.cards) ? section.cards.slice(0, maximum).map((rawCard) => {
      const card = rawCard && typeof rawCard === "object" ? rawCard as Record<string, unknown> : {};
      const requestedContentType = safeCardTypes.has(String(card.content_type)) ? String(card.content_type) : "image";
      const contentType = requestedContentType;
      const sourceKind = ["upload", "video", "salon", "blog", "custom", "campaign"].includes(String(card.source_kind))
        ? String(card.source_kind)
        : contentType === "salon"
          ? "salon"
          : contentType === "video"
            ? "video"
            : contentType === "link"
              ? "custom"
              : "upload";
      const associationType = ["salon", "campaign"].includes(String(card.association_type)) ? String(card.association_type) : contentType === "salon" ? "salon" : "";
      const salonId = associationType === "salon" && /^[0-9a-f-]{36}$/i.test(text(card.salon_id, 50)) ? text(card.salon_id, 50) : "";
      const campaignId = associationType === "campaign" && /^[0-9a-f-]{36}$/i.test(text(card.campaign_id, 50)) ? text(card.campaign_id, 50) : "";
      const status = ["Draft", "Active", "Archived"].includes(String(card.status)) ? String(card.status) : "Active";
      const marketId = /^[0-9a-f-]{36}$/i.test(text(card.market_id, 50)) ? text(card.market_id, 50) : "";
      const targetLatitude = card.target_latitude === "" || card.target_latitude == null ? null : Number(card.target_latitude);
      const targetLongitude = card.target_longitude === "" || card.target_longitude == null ? null : Number(card.target_longitude);
      const radiusMiles = Math.max(1, Math.min(250, Number(card.radius_miles || 25)));
      const validLatitude = targetLatitude !== null && Number.isFinite(targetLatitude) && targetLatitude >= -90 && targetLatitude <= 90;
      const validLongitude = targetLongitude !== null && Number.isFinite(targetLongitude) && targetLongitude >= -180 && targetLongitude <= 180;
      const priority = Math.max(0, Math.min(100, Number(card.priority ?? 50)));
      const rotationWeight = Math.max(0.1, Math.min(100, Number(card.rotation_weight ?? 1)));
      return { id: text(card.id, 80), content_type: contentType, source_kind: sourceKind, association_type: associationType, salon_id: salonId, campaign_id: campaignId, title: text(card.title, 120), body: text(card.body, 1200), media_url: safeUrl(card.media_url), href: safeUrl(card.href), cta_label: text(card.cta_label, 60), alt_text: text(card.alt_text, 180), status, starts_at: safeDate(card.starts_at), ends_at: safeDate(card.ends_at), market_id: marketId, target_label: text(card.target_label, 120), target_latitude: validLatitude ? targetLatitude : null, target_longitude: validLongitude ? targetLongitude : null, radius_miles: radiusMiles, priority: Number.isFinite(priority) ? priority : 50, rotation_weight: Number.isFinite(rotationWeight) ? rotationWeight : 1, editorial_fallback: false };
    }) : [];
    const displayLimit = Math.max(1, Math.min(20, Math.round(Number(section.display_limit || 8))));
    return { id: text(section.id, 80), type, title: text(section.title, 140), body: text(section.body, 20000), is_visible: section.is_visible !== false, columns: [2,3,4].includes(Number(section.columns)) ? Number(section.columns) : 4, cta_label: text(section.cta_label, 80), cta_href: safeUrl(section.cta_href), display_limit: Number.isFinite(displayLimit) ? displayLimit : 8, scroll_direction: section.scroll_direction === "reverse" ? "reverse" : "forward", cards };
  });
}

function rawPromotionRail(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "promo_rail") as Record<string, unknown> | undefined || null;
}

function promotionIdentity(card: Record<string, unknown>) {
  const associationType = text(card.association_type, 20);
  if (associationType === "campaign" && card.campaign_id) return `campaign:${text(card.campaign_id, 80).toLowerCase()}`;
  if (associationType === "salon" && card.salon_id) return `salon:${text(card.salon_id, 80).toLowerCase()}`;
  return `editorial:${text(card.href, 1200).toLowerCase()}|${text(card.media_url, 1200).toLowerCase()}`;
}

function promotionCardIds(value: unknown) {
  const rail = rawPromotionRail(value);
  const cards = Array.isArray(rail?.cards) ? rail.cards : [];
  return cards.map((item) => text((item as Record<string, unknown>)?.id, 80)).filter(Boolean);
}

function validatePromotionCollection(sections: ReturnType<typeof sanitizeSections>) {
  const rail = sections.find((section) => section.type === "promo_rail");
  if (!rail) return;
  const ids = new Set<string>();
  const identities = new Set<string>();
  for (const card of rail.cards) {
    if (!card.id) rejectRequest("Every homepage promotion card must have a stable card ID.");
    const normalizedId = card.id.toLowerCase();
    if (ids.has(normalizedId)) rejectRequest("Homepage promotion cards cannot reuse the same card ID.");
    ids.add(normalizedId);
    const identity = promotionIdentity(card);
    if (identities.has(identity)) rejectRequest("The same salon, campaign, or editorial promotion cannot appear twice in the homepage rail.");
    identities.add(identity);
    if (card.status === "Active" && !isHomepagePromotionCardComplete(card as ContentCard)) {
      rejectRequest(
        `Active homepage promotion "${card.title || card.id}" needs a title, card text, image, destination, call-to-action label, and alternative text. Save it as Draft until every field is complete.`,
      );
    }
  }
}

async function validatePromotionAssociations(
  admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"],
  sections: ReturnType<typeof sanitizeSections>,
) {
  const cards = sections.flatMap((section) => section.cards);
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
      if (!card.campaign_id) rejectRequest("Choose an eligible featured campaign.");
      const { data: campaign, error } = await admin
        .from("featured_salon_campaigns")
        .select("id,salon_id,status,starts_at,ends_at,placement_basis,complimentary_reason,complimentary_approved_by,entitlement:marketing_entitlements(status,valid_from,valid_until)")
        .eq("id", card.campaign_id)
        .maybeSingle();
      if (error) throw error;
      const entitlement = Array.isArray(campaign?.entitlement) ? campaign.entitlement[0] : campaign?.entitlement;
      const eligibleCampaign = campaign
        && ["Scheduled", "Active"].includes(String(campaign.status))
        && Date.parse(campaign.ends_at) > Date.now()
        && (campaign.placement_basis === "complimentary_admin"
          ? Boolean(campaign.complimentary_approved_by) && String(campaign.complimentary_reason || "").trim().length >= 5
          : ["Paid", "Credited"].includes(String(entitlement?.status || "")));
      if (!eligibleCampaign) rejectRequest("That campaign is paused, expired, or no longer eligible.");
      const { data: visible, error: visibilityError } = await admin.rpc("is_marketplace_visible", { target_salon_id: campaign.salon_id });
      if (visibilityError) throw visibilityError;
      if (!visible) rejectRequest("The campaign salon is not currently eligible for public placement.");
    }
  }
}

async function saveContentCatalogRecord(
  admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"],
  userId: string,
  recordType: "master_style" | "service_category" | "service_group" | "service_addon",
  record: Record<string, unknown>,
) {
  const mutation = await admin.rpc("admin_save_content_catalog_record", {
    p_record_type: recordType,
    p_actor_user_id: userId,
    p_record: record,
  });
  if (mutation.error) throw mutation.error;
  const saved = (mutation.data as { record?: Record<string, unknown> } | null)?.record;
  if (!saved) throw new Error("CONTENT_CATALOG_SAVE_EMPTY");
  return saved;
}

function revalidatePublishedContent() {
  revalidatePath("/", "layout");
  revalidatePath("/styles");
  revalidatePath("/blog");
  revalidatePath("/about");
  revalidatePath("/legal");
  revalidatePath("/salon/[slug]", "page");
}

function requestedPublicationAction(payload: Record<string, unknown>, action: unknown): PublicationAction {
  const requested = String(action || "");
  if (["save_draft", "publish", "schedule", "unpublish", "restore", "archive"].includes(requested)) {
    return requested as PublicationAction;
  }
  const legacyStatus = String(payload.status || "Draft");
  if (legacyStatus === "Published") return "publish";
  if (legacyStatus === "Scheduled") return "schedule";
  if (legacyStatus === "Hidden") return "unpublish";
  if (legacyStatus === "Archived") return "archive";
  return "save_draft";
}

function publicationTransition(
  current: Record<string, unknown> | null,
  payload: Record<string, unknown>,
  action: PublicationAction,
  page: boolean,
  draftRecord: Record<string, unknown>,
) {
  const now = new Date().toISOString();
  const previousPublishedAt = current?.published_at || null;
  const snapshot = (publishedAt: string) => ({
    ...pick(draftRecord, page ? pageFields : postFields),
    status: "Published",
    ...(page ? { is_enabled: true } : {}),
    published_at: publishedAt,
    scheduled_publish_at: null,
    archived_at: null,
  });
  const scheduledAt = Date.parse(String(current?.scheduled_publish_at || ""));
  const dueScheduledIsPublic = Boolean(current?.scheduled_payload)
    && Number.isFinite(scheduledAt)
    && scheduledAt <= Date.now()
    && ["Published", "Scheduled"].includes(String(current?.publication_state || ""))
    && current?.is_enabled !== false
    && !current?.archived_at;
  const futureScheduledIsQueued = Boolean(current?.scheduled_payload)
    && Number.isFinite(scheduledAt)
    && scheduledAt > Date.now()
    && ["Published", "Scheduled"].includes(String(current?.publication_state || ""))
    && !current?.archived_at;
  const retainedPublicVersion = retainedPublishedVersion(current);
  if (action === "publish") return {
    status: "Published",
    publication_state: "Published",
    ...(page ? { is_enabled: true } : {}),
    scheduled_publish_at: null,
    scheduled_payload: null,
    published_at: now,
    published_payload: snapshot(now),
    archived_at: null,
  };
  if (action === "schedule") {
    const scheduled = safeDate(payload.scheduled_publish_at);
    if (!scheduled || Date.parse(scheduled) <= Date.now()) rejectRequest("Choose a future publication date and time.");
    const hasPublishedVersion = Boolean(retainedPublicVersion);
    return {
      status: "Scheduled",
      publication_state: hasPublishedVersion ? "Published" : "Scheduled",
      ...(page ? { is_enabled: true } : {}),
      scheduled_publish_at: scheduled,
      scheduled_payload: snapshot(scheduled),
      // If the prior scheduled snapshot is already due, it is the live public
      // version. Promote it before replacing scheduled_payload so the public
      // page cannot fall back to an older published snapshot while it waits.
      ...(retainedPublicVersion
        ? {
            published_payload: retainedPublicVersion.payload,
            published_at: retainedPublicVersion.publishedAt,
          }
        : { published_at: previousPublishedAt }),
      archived_at: null,
    };
  }
  if (action === "unpublish") return { status: "Hidden", publication_state: "Hidden", ...(page ? { is_enabled: false } : {}), scheduled_publish_at: null, scheduled_payload: null, published_at: previousPublishedAt, archived_at: null };
  if (action === "archive") return { status: "Archived", publication_state: "Archived", ...(page ? { is_enabled: false } : {}), scheduled_publish_at: null, scheduled_payload: null, published_at: previousPublishedAt, archived_at: now };
  if (action === "restore") return { status: "Draft", publication_state: "Hidden", ...(page ? { is_enabled: false } : {}), scheduled_publish_at: null, scheduled_payload: null, published_at: previousPublishedAt, archived_at: null };
  const keepsPublicVersion = (
    current?.publication_state === "Published"
    && Boolean(current?.published_payload)
    && current?.is_enabled !== false
    && !current?.archived_at
  ) || dueScheduledIsPublic;
  return {
    status: futureScheduledIsQueued ? "Scheduled" : "Draft",
    publication_state: keepsPublicVersion
      ? "Published"
      : futureScheduledIsQueued
        ? "Scheduled"
        : String(current?.publication_state || "Hidden"),
    ...(page ? { is_enabled: keepsPublicVersion || futureScheduledIsQueued } : {}),
    published_at: previousPublishedAt,
    archived_at: null,
  };
}

function resolvedPublicPayload(record: Record<string, unknown>, now = Date.now()) {
  const scheduledAt = Date.parse(String(record.scheduled_publish_at || ""));
  if (
    record.scheduled_payload
    && Number.isFinite(scheduledAt)
    && scheduledAt <= now
    && ["Published", "Scheduled"].includes(String(record.publication_state || ""))
  ) return record.scheduled_payload as Record<string, unknown>;
  if (record.published_payload && record.publication_state === "Published") {
    return record.published_payload as Record<string, unknown>;
  }
  return null;
}

function publicationSummary(
  page: Record<string, unknown>,
  options: HomepagePromotionDiagnosticOptions = {},
) {
  const sections = Array.isArray(page.sections)
    ? page.sections as Array<Record<string, unknown>>
    : [];
  const rail = sections.find((section) => section.type === "promo_rail");
  const cards = Array.isArray(rail?.cards)
    ? rail.cards as ContentCard[]
    : [];
  const displayLimit = Number(rail?.display_limit || 8);
  const preview = homepagePromotionPreview(cards, Date.now(), displayLimit, options);
  const publicPayload = resolvedPublicPayload(page);
  const publicSections = Array.isArray(publicPayload?.sections) ? publicPayload.sections as Array<Record<string, unknown>> : [];
  const publicRail = publicSections.find((section) => section.type === "promo_rail");
  const publicCards = Array.isArray(publicRail?.cards) ? publicRail.cards as ContentCard[] : [];
  const publicLimit = Number(publicRail?.display_limit || displayLimit);
  const publicPreview = homepagePromotionPreview(publicCards, Date.now(), publicLimit, options);
  const scheduledAt = Date.parse(String(page.scheduled_publish_at || ""));
  const dueScheduled = Boolean(page.scheduled_payload) && Number.isFinite(scheduledAt) && scheduledAt <= Date.now();
  const futureScheduled = Boolean(page.scheduled_payload) && Number.isFinite(scheduledAt) && scheduledAt > Date.now();
  const publiclyPublished = Boolean(publicPayload) && page.is_enabled !== false && !page.archived_at;
  return {
    saved_version: page.updated_at || null,
    public_version: publiclyPublished ? (dueScheduled ? page.scheduled_publish_at : page.published_at) || null : null,
    saved_card_count: preview.saved.length,
    public_card_count: publiclyPublished ? publicPreview.eligible.length : 0,
    fallback_count: publiclyPublished ? publicPreview.fallbackCount : publicLimit,
    display_limit: publicLimit,
    is_public: publiclyPublished,
    state: publiclyPublished
      ? `${futureScheduled ? "Scheduled" : String(page.status || "Draft")} / Published version live${futureScheduled ? "; future version queued" : ""}`
      : futureScheduled
        ? `Scheduled / Queued for ${String(page.scheduled_publish_at)}`
        : page.archived_at
        ? "Archived / Not public"
        : `${String(page.status || "Draft")} / Not public`,
  };
}

async function verifyPublicProjection(
  admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"],
  recordType: "page" | "post",
  record: Record<string, unknown>,
) {
  const expected = isPublicPublication(record) ? resolvedPublicPayload(record) : null;
  const { data, error } = recordType === "page"
    ? await admin.rpc("get_public_content_page", { p_slug: String(record.slug || "") })
    : await admin.rpc("get_public_blog_post", { p_slug: String(record.slug || "") });
  if (error) throw error;
  if (JSON.stringify(data ?? null) !== JSON.stringify(expected ?? null)) {
    throw new Error("The saved publication state did not match the anonymous public projection.");
  }
}

function isPublicPublication(record: Record<string, unknown>, now = Date.now()) {
  return !record.archived_at
    && (record.is_enabled === undefined || record.is_enabled !== false)
    && Boolean(resolvedPublicPayload(record, now));
}

async function GETHandler(request: Request) {
  let monitoringAdmin;
  try {
    const { admin } = await requireAdminPermission(request, "content");
    monitoringAdmin = admin;
    const targetQuery = new URL(request.url).searchParams.get("target_query")?.trim().slice(0, 80) || "";
    const [pages, posts, masterStyles, serviceCategories, serviceGroups, serviceAddons, targetResult] = await Promise.all([
      admin.from("content_pages").select("*").order("slug"),
      admin.from("blog_posts").select("*").order("updated_at", { ascending: false }),
      admin.from("master_styles").select("*,service_category:service_categories(id,name,slug),service_group:service_groups(id,name,category_id)").order("sort_order").order("name"),
      admin.from("service_categories").select("*").order("sort_order").order("name"),
      admin.from("service_groups").select("*,service_category:service_categories(id,name,slug)").order("sort_order").order("name"),
      admin.from("service_addons").select("*,service_category:service_categories(id,name,slug)").order("sort_order").order("name"),
      admin.rpc("admin_content_link_targets", { p_query: targetQuery, p_limit: 60 }),
    ]);
    if (pages.error) throw pages.error;
    if (posts.error) throw posts.error;
    if (masterStyles.error) throw masterStyles.error;
    if (serviceCategories.error) throw serviceCategories.error;
    if (serviceGroups.error) throw serviceGroups.error;
    if (serviceAddons.error) throw serviceAddons.error;
    if (targetResult.error) throw targetResult.error;
    const governedTargets = Array.isArray(targetResult.data)
      ? targetResult.data as Array<{ id?: unknown; salon_id?: unknown; type: string; label: unknown; href?: unknown; media_url?: unknown; body?: unknown; target_latitude?: unknown; target_longitude?: unknown }>
      : [];
    const linkTargets: Array<{ id?: unknown; salon_id?: unknown; type: string; label: unknown; href?: unknown; media_url?: unknown; body?: unknown; target_latitude?: unknown; target_longitude?: unknown }> = [
      ...governedTargets,
      ...(posts.data || []).flatMap((post) => {
        if (!isPublicPublication(post)) return [];
        const published = resolvedPublicPayload(post);
        return published ? [{ id: post.id, type: "Blog", label: published.title, href: `/blog/${published.slug}`, media_url: published.cover_image_url || "" }] : [];
      }),
      ...(pages.data || []).flatMap((page) => {
        if (page.page_group === "Content Section") return [];
        if (!isPublicPublication(page)) return [];
        const published = resolvedPublicPayload(page);
        return published ? [{ id: published.slug, type: "Page", label: published.title, href: published.slug === "home" ? "/" : `/${published.slug}`, media_url: published.hero_image_url || "" }] : [];
      }),
    ];
    const diagnosticOptions: HomepagePromotionDiagnosticOptions = {
      availableSalonIds: new Set(linkTargets.filter((target) => target.type === "Salon").map((target) => String(target.id || "").toLowerCase())),
      availableCampaignIds: new Set(linkTargets.filter((target) => target.type === "Campaign").map((target) => String(target.id || "").toLowerCase())),
      availableDestinations: new Set(linkTargets.filter((target) => Boolean(target.href)).map((target) => String(target.href))),
    };
    const publicationByPage = Object.fromEntries(
      (pages.data || []).map((page) => [page.slug, publicationSummary(page, diagnosticOptions)]),
    );
    const publicationByPost = Object.fromEntries(
      (posts.data || []).map((post) => [post.id, publicationSummary(post)]),
    );
    return Response.json({
      pages: pages.data || [],
      posts: posts.data || [],
      masterStyles: sortCatalogRecords(masterStyles.data),
      serviceCategories: sortCatalogRecords(serviceCategories.data),
      serviceGroups: sortCatalogRecords(serviceGroups.data),
      serviceAddons: sortCatalogRecords(serviceAddons.data),
      linkTargets,
      publicationByPage,
      publicationByPost,
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
    const { type, payload, action } = await request.json() as { type: "page" | "post" | "master_style" | "service_category" | "service_group" | "service_addon"; payload: Record<string, unknown>; action?: PublicationAction };
    if (!payload) return Response.json({ error: "Content payload is required." }, { status: 400 });

    if (type === "master_style") {
      const name = String(payload.name || "").trim().slice(0, 100);
      const groupId = String(payload.service_group_id || "").trim();
      if (!name || !/^[0-9a-f-]{36}$/i.test(groupId)) return Response.json({ error: "Service name and service group are required." }, { status: 400 });
      const { data: group, error: groupError } = await admin.from("service_groups").select("id,name,category_id").eq("id", groupId).eq("is_active", true).maybeSingle();
      if (groupError) throw groupError;
      if (!group) return Response.json({ error: "Choose an active service group." }, { status: 400 });
      const record = { id: payload.id || null, name, category: group.name, category_id: group.category_id, service_group_id: group.id, sort_order: Math.max(0, Math.min(100000, Number(payload.sort_order || 0))), is_active: payload.is_active !== false, archived_at: payload.is_active === false ? payload.archived_at || null : null };
      const data = await saveContentCatalogRecord(admin, user.id, "master_style", record);
      revalidatePublishedContent();
      console.info("Admin master style saved", { styleId: data.id, adminUserId: user.id });
      return Response.json({ data });
    }

    if (type === "service_category") {
      const name = text(payload.name, 80);
      const slug = text(payload.slug, 80).toLowerCase();
      if (!name || !validSlug(slug)) return Response.json({ error: "Category name and a lowercase URL slug are required." }, { status: 400 });
      const record = { id: payload.id || null, name, slug, description: text(payload.description, 500) || null, sort_order: Math.max(0, Math.min(100000, Number(payload.sort_order || 0))), is_active: payload.is_active !== false, archived_at: payload.is_active === false ? payload.archived_at || null : null };
      const data = await saveContentCatalogRecord(admin, user.id, "service_category", record);
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
      const record = { id: payload.id || null, name, category_id: categoryId, sort_order: Math.max(0, Math.min(100000, Number(payload.sort_order || 0))), is_active: payload.is_active !== false, archived_at: payload.is_active === false ? payload.archived_at || null : null };
      const data = await saveContentCatalogRecord(admin, user.id, type, record);
      revalidatePublishedContent();
      console.info(`Admin ${type} saved`, { id: data.id, adminUserId: user.id });
      return Response.json({ data });
    }

    if (!validSlug(payload.slug)) return Response.json({ error: "Enter a valid lowercase page slug." }, { status: 400 });

    if (type === "page") {
      const { data: before } = await admin.from("content_pages").select("*").eq("slug", payload.slug).maybeSingle();
      const publicationAction = requestedPublicationAction(payload, action);
      const expectedUpdatedAt = text(payload.expected_updated_at, 80);
      if (before?.updated_at && expectedUpdatedAt !== String(before.updated_at)) {
        return Response.json(
          { error: "This page changed in another tab. Reload it before saving so no promotion cards are overwritten.", code: "CONTENT_REVISION_CONFLICT" },
          { status: 409 },
        );
      }
      const sections = sanitizeSections(payload.sections);
      if (payload.slug === "home") {
        const promotionRail = sections.find((section) => section.type === "promo_rail");
        if (!promotionRail || promotionRail.cards.length > 200) {
          return Response.json(
            { error: "The homepage promotion source pool can contain up to 200 saved cards. Empty positions use the approved editorial fallbacks." },
            { status: 400 },
          );
        }
        validatePromotionCollection(sections);
        const rawRail = rawPromotionRail(payload.sections);
        const countChangeAllowed = rawRail?._allow_card_count_change === true;
        const beforeIds = promotionCardIds(before?.sections);
        const afterIds = promotionRail.cards.map((card) => card.id);
        const membershipChanged = beforeIds.length > 0 && (
          beforeIds.length !== afterIds.length ||
          beforeIds.some((cardId) => !afterIds.includes(cardId)) ||
          afterIds.some((cardId) => !beforeIds.includes(cardId))
        );
        if (membershipChanged && !countChangeAllowed) {
          return Response.json(
            { error: "The promotion-card collection changed without using Add promotion to pool or Remove promotion card. Reload and try again so existing cards are not lost.", code: "PROMOTION_COLLECTION_CONFLICT" },
            { status: 409 },
          );
        }
      }
      // Drafts are an honest work-in-progress and may retain an association
      // that is currently paused, expired, or unavailable. Publication and
      // scheduling are the gates that must prove every linked salon/campaign
      // is eligible; the saved draft keeps its diagnostic for administrators.
      if (publicationAction === "publish" || publicationAction === "schedule") {
        await validatePromotionAssociations(admin, sections);
      }
      const updatedAt = new Date().toISOString();
      const draftRecord = {
        ...pick(payload, pageFields),
        sections,
        hero_position_x: Math.min(100, Math.max(0, Number(payload.hero_position_x ?? 50))),
        hero_position_y: Math.min(100, Math.max(0, Number(payload.hero_position_y ?? 50))),
        hero_zoom: Math.min(2.5, Math.max(1, Number(payload.hero_zoom ?? 1))),
        updated_by: user.id,
        updated_at: updatedAt,
      };
      const record = {
        ...draftRecord,
        ...publicationTransition(before, payload, publicationAction, true, draftRecord),
      };
      const mutation = await admin.rpc("admin_save_content_record", {
        p_record_type: "page",
        p_actor_user_id: user.id,
        p_record: record,
        p_action: publicationAction,
        p_expected_updated_at: expectedUpdatedAt || null,
      });
      if (mutation.error) {
        if (/CONTENT_REVISION_CONFLICT/.test(mutation.error.message)) {
          return Response.json(
            { error: "This page changed in another tab. Reload it before saving so no promotion cards are overwritten.", code: "CONTENT_REVISION_CONFLICT" },
            { status: 409 },
          );
        }
        throw mutation.error;
      }
      const data = (mutation.data as { record?: Record<string, unknown> } | null)?.record;
      if (!data) throw new Error("CONTENT_SAVE_EMPTY");
      try {
        await verifyPublicProjection(admin, "page", data);
      } catch (verificationError) {
        // The save and its audit event have already committed atomically in
        // admin_save_content_record. A transient readback failure must not
        // misreport that successful mutation as a failed save; the monitoring
        // wrapper attaches the correlated warning reference to this success.
        noteOperationalFailure(
          "Saved page public-projection verification failed",
          verificationError,
        );
      }
      revalidatePublishedContent();
      console.info("Admin page content saved", { slug: data.slug, adminUserId: user.id });
      return Response.json({ data, publication: publicationSummary(data) });
    }

    if (type === "post") {
      const existingPost = payload.id
        ? await admin.from("blog_posts").select("*").eq("id", payload.id).maybeSingle()
        : await admin.from("blog_posts").select("*").eq("slug", payload.slug).maybeSingle();
      if (existingPost.error) throw existingPost.error;
      const before = existingPost.data;
      const publicationAction = requestedPublicationAction(payload, action);
      const expectedUpdatedAt = text(payload.expected_updated_at, 80);
      if (before?.updated_at && expectedUpdatedAt !== String(before.updated_at)) {
        return Response.json(
          { error: "This blog post changed in another tab. Reload it before saving so no edits are overwritten.", code: "CONTENT_REVISION_CONFLICT" },
          { status: 409 },
        );
      }
      const updatedAt = new Date().toISOString();
      const draftRecord = {
        ...pick(payload, postFields),
        updated_by: user.id,
        updated_at: updatedAt,
      };
      const record = {
        ...draftRecord,
        ...publicationTransition(before, payload, publicationAction, false, draftRecord),
      };
      const mutation = await admin.rpc("admin_save_content_record", {
        p_record_type: "post",
        p_actor_user_id: user.id,
        p_record: record,
        p_action: publicationAction,
        p_expected_updated_at: expectedUpdatedAt || null,
      });
      if (mutation.error) {
        if (/CONTENT_REVISION_CONFLICT/.test(mutation.error.message)) {
          return Response.json(
            { error: "This blog post changed in another tab. Reload it before saving so no edits are overwritten.", code: "CONTENT_REVISION_CONFLICT" },
            { status: 409 },
          );
        }
        throw mutation.error;
      }
      const data = (mutation.data as { record?: Record<string, unknown> } | null)?.record;
      if (!data) throw new Error("CONTENT_SAVE_EMPTY");
      try {
        await verifyPublicProjection(admin, "post", data);
      } catch (verificationError) {
        noteOperationalFailure(
          "Saved blog public-projection verification failed",
          verificationError,
        );
      }
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
      if (/still used|must be archived|cannot|reassign/i.test(error.message)) return Response.json({ error: "This record still has protected dependencies. Archive it or reassign those records before deleting it." }, { status: 409 });
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
