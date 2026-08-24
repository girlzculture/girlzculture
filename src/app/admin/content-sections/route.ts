import { revalidatePath } from "next/cache";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import {
  ABOUT_CAROUSEL_ONE_ID,
  ABOUT_CAROUSEL_TWO_ID,
  HERO_PRESENTATION_LAYOUTS,
  HOME_HERO_SECTION_ID,
  type HeroPresentationLayout,
} from "@/lib/contentSlotCore";
import { isHomepagePromotionCardComplete } from "@/lib/homePromotionCore";
import type { ContentCard, ContentSection } from "@/lib/content";

export const runtime = "nodejs";

type PublicationAction = "save_draft" | "publish" | "unpublish";
type Row = Record<string, unknown>;

const ALLOWED_SLUGS = new Set(["home", "about-carousel-one", "about-carousel-two"]);
const ALLOWED_SECTION_IDS = new Set([HOME_HERO_SECTION_ID, ABOUT_CAROUSEL_ONE_ID, ABOUT_CAROUSEL_TWO_ID]);
const CARD_TYPES = new Set(["image", "video", "link", "salon"]);
const SOURCE_KINDS = new Set(["upload", "video", "salon", "blog", "custom", "campaign"]);
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function text(value: unknown, maximum: number) { return String(value || "").trim().slice(0, maximum); }
function safeUrl(value: unknown) {
  const url = text(value, 1_200);
  if (!url || (url.startsWith("/") && !url.startsWith("//"))) return url;
  try { const parsed = new URL(url); return parsed.protocol === "https:" ? parsed.toString() : ""; } catch { return ""; }
}
function safeDate(value: unknown) {
  const raw = text(value, 50);
  if (!raw) return "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}
function sanitizeCard(raw: unknown): ContentCard {
  const card = raw && typeof raw === "object" ? raw as Row : {};
  const contentType = CARD_TYPES.has(String(card.content_type)) ? String(card.content_type) as ContentCard["content_type"] : "image";
  const sourceKind = SOURCE_KINDS.has(String(card.source_kind)) ? String(card.source_kind) as ContentCard["source_kind"] : contentType === "video" ? "video" : contentType === "salon" ? "salon" : contentType === "link" ? "custom" : "upload";
  const associationType = ["salon", "campaign"].includes(String(card.association_type)) ? String(card.association_type) as "salon" | "campaign" : undefined;
  const targetLatitude = Number(card.target_latitude);
  const targetLongitude = Number(card.target_longitude);
  const status = ["Draft", "Active", "Archived"].includes(String(card.status)) ? String(card.status) as ContentCard["status"] : "Draft";
  return {
    id: text(card.id, 80) || crypto.randomUUID(), content_type: contentType, source_kind: sourceKind, association_type: associationType,
    salon_id: associationType === "salon" && UUID.test(text(card.salon_id, 50)) ? text(card.salon_id, 50) : undefined,
    campaign_id: associationType === "campaign" && UUID.test(text(card.campaign_id, 50)) ? text(card.campaign_id, 50) : undefined,
    title: text(card.title, 120), body: text(card.body, 1_200), media_url: safeUrl(card.media_url), href: safeUrl(card.href), cta_label: text(card.cta_label, 60), alt_text: text(card.alt_text, 180), status,
    starts_at: safeDate(card.starts_at), ends_at: safeDate(card.ends_at), market_id: UUID.test(text(card.market_id, 50)) ? text(card.market_id, 50) : undefined,
    target_label: text(card.target_label, 120), target_latitude: Number.isFinite(targetLatitude) && targetLatitude >= -90 && targetLatitude <= 90 ? targetLatitude : undefined,
    target_longitude: Number.isFinite(targetLongitude) && targetLongitude >= -180 && targetLongitude <= 180 ? targetLongitude : undefined,
    radius_miles: Math.max(1, Math.min(250, Number(card.radius_miles || 25))), priority: Math.max(0, Math.min(100, Number(card.priority ?? 50))),
    rotation_weight: Math.max(0.1, Math.min(100, Number(card.rotation_weight ?? 1))), editorial_fallback: false,
  };
}
function sanitizeSection(raw: unknown, slug: string): ContentSection & { presentation_layout?: HeroPresentationLayout } {
  const section = raw && typeof raw === "object" ? raw as Row : {};
  const expectedId = slug === "home" ? HOME_HERO_SECTION_ID : slug === "about-carousel-one" ? ABOUT_CAROUSEL_ONE_ID : ABOUT_CAROUSEL_TWO_ID;
  if (text(section.id, 80) && text(section.id, 80) !== expectedId) rejectRequest("This editor can only save its assigned content section.");
  const rawLayout = String(section.presentation_layout || "promo_rail");
  const presentationLayout = HERO_PRESENTATION_LAYOUTS.includes(rawLayout as HeroPresentationLayout) ? rawLayout as HeroPresentationLayout : "promo_rail";
  const cards = (Array.isArray(section.cards) ? section.cards : []).slice(0, slug === "home" ? 200 : 20).map(sanitizeCard);
  const ids = new Set<string>();
  for (const card of cards) {
    const id = String(card.id || "").toLowerCase();
    if (!id || ids.has(id)) rejectRequest("Every card needs a unique stable card ID.");
    ids.add(id);
    if (card.starts_at && card.ends_at && Date.parse(card.ends_at) <= Date.parse(card.starts_at)) rejectRequest(`Card "${card.title || card.id}" must end after it starts.`);
    if (card.status === "Active" && !isHomepagePromotionCardComplete(card)) rejectRequest(`Active card "${card.title || card.id}" needs a title, image or GIF, destination, call-to-action label, and alternative text. Save it as Draft until it is complete.`);
  }
  return {
    id: expectedId, type: slug === "home" ? "promo_rail" : "community_carousel", presentation_layout: slug === "home" ? presentationLayout : undefined,
    title: text(section.title, 140), body: text(section.body, 20_000), image_url: safeUrl(section.image_url), cta_label: text(section.cta_label, 80), cta_href: safeUrl(section.cta_href),
    is_visible: section.is_visible !== false, columns: [2,3,4].includes(Number(section.columns)) ? Number(section.columns) : 4,
    display_limit: Math.max(1, Math.min(20, Math.round(Number(section.display_limit || 8)))), scroll_direction: section.scroll_direction === "reverse" ? "reverse" : "forward", cards,
  };
}
function replaceSection(sections: unknown, section: ContentSection, slug: string) {
  const rows = Array.isArray(sections) ? (sections as ContentSection[]).filter(Boolean) : [];
  const expectedId = String(section.id || "");
  let index = rows.findIndex((candidate) => String(candidate.id || "") === expectedId);
  if (index < 0) index = slug === "home" ? rows.findIndex((candidate) => candidate.type === "promo_rail") : rows.findIndex((candidate) => candidate.type === "community_carousel");
  if (index < 0) return [section, ...rows];
  return rows.map((candidate, itemIndex) => itemIndex === index ? section : candidate);
}
function publicSnapshot(record: Row, publishedAt: string) {
  return { slug: record.slug, title: record.title, eyebrow: record.eyebrow, hero_title: record.hero_title, hero_subtitle: record.hero_subtitle, hero_image_url: record.hero_image_url, background_image_url: record.background_image_url, hero_position_x: record.hero_position_x, hero_position_y: record.hero_position_y, hero_zoom: record.hero_zoom, page_group: record.page_group, sections: record.sections, labels: record.labels, seo_title: record.seo_title, seo_description: record.seo_description, status: "Published", is_enabled: true, published_at: publishedAt, scheduled_publish_at: null, archived_at: null };
}
async function validateAssociations(admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"], section: ContentSection) {
  for (const card of section.cards || []) {
    if (card.status !== "Active") continue;
    if (card.association_type === "salon") {
      if (!card.salon_id) rejectRequest("Choose an eligible salon for the card.");
      const { data, error } = await admin.rpc("is_marketplace_visible", { target_salon_id: card.salon_id });
      if (error) throw error;
      if (!data) rejectRequest("That salon is not eligible for public placement.");
    }
    if (card.association_type === "campaign") {
      if (!card.campaign_id) rejectRequest("Choose an eligible campaign for the card.");
      const { data, error } = await admin.from("featured_salon_campaigns").select("id,status,ends_at").eq("id", card.campaign_id).maybeSingle();
      if (error) throw error;
      if (!data || !["Scheduled", "Active"].includes(String(data.status)) || Date.parse(String(data.ends_at || "")) <= Date.now()) rejectRequest("That campaign is paused, expired, or unavailable.");
    }
  }
}
async function PUTHandler(request: Request) {
  let monitoringAdmin;
  try {
    const { admin, user } = await requireAdminPermission(request, "content");
    monitoringAdmin = admin;
    const body = await request.json() as { slug?: unknown; section?: unknown; action?: unknown; expected_updated_at?: unknown };
    const slug = text(body.slug, 80);
    if (!ALLOWED_SLUGS.has(slug)) return Response.json({ error: "Choose a supported content section." }, { status: 400 });
    const action = ["save_draft", "publish", "unpublish"].includes(String(body.action)) ? String(body.action) as PublicationAction : "save_draft";
    const { data: current, error: currentError } = await admin.from("content_pages").select("*").eq("slug", slug).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return Response.json({ error: "This content record does not exist." }, { status: 404 });
    const expectedUpdatedAt = text(body.expected_updated_at, 80);
    if (expectedUpdatedAt !== String(current.updated_at || "")) return Response.json({ error: "This content changed in another tab. Reload before saving so no cards are overwritten.", code: "CONTENT_REVISION_CONFLICT" }, { status: 409 });
    const section = sanitizeSection(body.section, slug);
    if (!ALLOWED_SECTION_IDS.has(String(section.id || ""))) return Response.json({ error: "Choose a supported content section." }, { status: 400 });
    await validateAssociations(admin, section);
    const now = new Date().toISOString();
    const next: Row = { ...current, sections: replaceSection(current.sections, section, slug), updated_by: user.id, scheduled_publish_at: null, scheduled_payload: null, archived_at: null };
    if (action === "publish") Object.assign(next, { status: "Published", publication_state: "Published", is_enabled: true, published_at: now, published_payload: publicSnapshot(next, now) });
    else if (action === "unpublish") Object.assign(next, { status: "Hidden", publication_state: "Hidden", is_enabled: false });
    else {
      const keepsPublished = current.publication_state === "Published" && Boolean(current.published_payload) && current.is_enabled !== false;
      Object.assign(next, { status: "Draft", publication_state: keepsPublished ? "Published" : "Hidden", is_enabled: keepsPublished });
    }
    const mutation = await admin.rpc("admin_save_content_record", { p_record_type: "page", p_actor_user_id: user.id, p_record: next, p_action: action, p_expected_updated_at: current.updated_at });
    if (mutation.error) throw mutation.error;
    const saved = (mutation.data as { record?: Row } | null)?.record;
    if (!saved) throw new Error("CONTENT_SECTION_SAVE_EMPTY");
    const { data: publicPage, error: publicError } = await admin.rpc("get_public_content_page", { p_slug: slug });
    if (publicError) throw publicError;
    const expectedPublic = action === "publish" ? saved.published_payload : action === "unpublish" ? null : current.publication_state === "Published" && current.is_enabled !== false ? current.published_payload : null;
    if (JSON.stringify(publicPage ?? null) !== JSON.stringify(expectedPublic ?? null)) throw new Error("The saved content did not match the anonymous public projection.");
    revalidatePath(slug === "home" ? "/" : "/about", "page");
    revalidatePath("/", "layout");
    return Response.json({ data: saved, public: publicPage });
  } catch (error) {
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "content-management", action: "save-focused-section", actorRole: "admin", safeMessage: "This content section could not be saved." });
  }
}
export const PUT = withOperationalMonitoring(routeMonitoringProfile("/admin/content-sections", "PUT"), PUTHandler);
