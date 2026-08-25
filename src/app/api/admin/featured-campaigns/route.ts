import { revalidatePath } from "next/cache";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanText } from "@/lib/requestSecurity";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { verifyMarketingEntitlement } from "@/lib/marketingEntitlements";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["Draft", "Scheduled", "Active", "Paused", "Expired", "Archived"]);
const SAVE_STATUSES = new Set(["Draft", "Scheduled", "Active", "Paused", "Expired"]);
const LIFECYCLE_ACTIONS = new Set(["archive", "restore", "delete", "pause", "resume", "expire"]);
const PAID_SOURCES = new Set(["stripe_payment", "verified_invoice"]);
const BASES = new Set(["paid", "platform_credit", "complimentary_admin"]);

type Row = Record<string, unknown>;

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number, label: string, integer = false) {
  const parsed = value === null || value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || integer && !Number.isInteger(parsed)) {
    rejectRequest(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function validTimezone(value: unknown) {
  const timezone = cleanText(value, 80) || "America/New_York";
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); }
  catch { rejectRequest("Choose a valid IANA timezone."); }
  return timezone;
}

function safeSearch(value: string) {
  return value.replace(/[%_,()]/g, "");
}

function isoDate(value: unknown, label: string, required = true) {
  const text = cleanText(value, 50);
  if (!text && !required) return null;
  const time = Date.parse(text);
  if (!Number.isFinite(time)) rejectRequest(`Choose a valid ${label}.`);
  return new Date(time).toISOString();
}

async function saveCampaign(args: {
  admin: SupabaseClient;
  actorId: string;
  body: Record<string, unknown>;
}) {
  const { admin, actorId, body } = args;
  const campaignId = cleanText(body.id, 60) || null;
  const salonId = cleanText(body.salon_id, 60);
  const requestedStatus = cleanText(body.status, 20) || "Draft";
  const placementBasis = cleanText(body.placement_basis, 30) || "paid";
  const startsAt = isoDate(body.starts_at, "campaign start time");
  const indefinite = body.indefinite === true || body.indefinite === "true";
  const endsAt = indefinite ? null : isoDate(body.ends_at, "campaign end time");
  if (campaignId && !UUID.test(campaignId)) rejectRequest("Campaign ID is invalid.");
  if (!UUID.test(salonId)) rejectRequest("Choose an eligible salon.");
  if (!SAVE_STATUSES.has(requestedStatus)) rejectRequest("Choose a valid campaign status.");
  if (!BASES.has(placementBasis)) rejectRequest("Choose Stripe payment, verified invoice, platform credit, or complimentary Admin placement.");
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt!)) rejectRequest("Campaign end time must be after its start time.");

  const timezone = validTimezone(body.timezone);
  const radiusMiles = boundedNumber(body.radius_miles, 25, 1, 250, "Radius");
  const priority = boundedNumber(body.priority, 50, 0, 100, "Priority", true);
  const rotationWeight = boundedNumber(body.rotation_weight, 1, 0.1, 100, "Rotation weight");
  const internalNote = cleanText(body.internal_note, 1000) || null;
  const optionalNote = cleanText(body.optional_note, 1000) || null;
  let entitlementSource = cleanText(body.entitlement_source, 40) || null;
  let entitlementReference = cleanText(body.entitlement_reference, 160) || null;
  let entitlementAmount = body.entitlement_amount_minor === null || body.entitlement_amount_minor === "" || body.entitlement_amount_minor === undefined
    ? null
    : boundedNumber(body.entitlement_amount_minor, 0, 0, 100_000_000, "Entitlement amount", true);

  if (placementBasis === "paid") {
    if (entitlementSource && !PAID_SOURCES.has(entitlementSource)) rejectRequest("Choose verified Stripe payment or invoice evidence.");
    if (entitlementSource || entitlementReference) {
      if (!entitlementSource || !entitlementReference) rejectRequest("Enter both the verified funding source and its reference.");
      const verified = await verifyMarketingEntitlement({
        admin,
        source: entitlementSource,
        reference: entitlementReference,
        salonId,
        placement: "Featured Salon",
        startsAt: startsAt!,
        endsAt,
      });
      entitlementAmount = verified?.amountMinor ?? entitlementAmount;
    }
  } else {
    entitlementSource = null;
    entitlementReference = null;
  }

  const saved = await admin.rpc("admin_save_featured_campaign_v2", {
    p_actor_user_id: actorId,
    p_campaign_id: campaignId,
    p_salon_id: salonId,
    p_requested_status: requestedStatus,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_timezone: timezone,
    p_radius_miles: radiusMiles,
    p_priority: priority,
    p_rotation_weight: rotationWeight,
    p_internal_note: internalNote,
    p_placement_basis: placementBasis,
    p_entitlement_source: entitlementSource,
    p_entitlement_reference: entitlementReference,
    p_entitlement_amount_minor: entitlementAmount,
    p_optional_note: optionalNote,
  });
  if (saved.error || !saved.data) throw saved.error || new Error("The campaign could not be saved.");
  const readback = await admin
    .from("featured_salon_campaigns")
    .select("*,salon:salons(id,name,slug,address_city,address_state),entitlement:marketing_entitlements(id,source,external_reference,status,amount_minor,currency,valid_from,valid_until)")
    .eq("id", saved.data)
    .maybeSingle();
  if (readback.error) throw readback.error;
  if (!readback.data) throw new Error("The saved campaign could not be read back.");
  return readback.data;
}

async function GETHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin, user } = await requireAdminPermission(request, "marketing");
    monitoringAdmin = admin;
    await admin.rpc("expire_featured_campaigns");
    const params = new URL(request.url).searchParams;

    if (params.get("mode") === "salons") {
      const q = safeSearch(cleanText(params.get("q"), 100));
      const page = Math.max(1, Number(params.get("page") || 1));
      const pageSize = Math.max(25, Math.min(100, Number(params.get("page_size") || 100)));
      let query = admin
        .from("salons")
        .select("id,name,slug,address_city,address_state,address_zip,subscription_status,is_discoverable,latitude,longitude", { count: "exact" })
        .eq("status", "Active")
        .eq("is_discoverable", true)
        .eq("geocode_status", "success")
        .eq("address_needs_review", false)
        .not("latitude", "is", null)
        .not("longitude", "is", null);
      if (q) query = query.or(`name.ilike.%${q}%,address_city.ilike.%${q}%,address_state.ilike.%${q}%`);
      const from = (page - 1) * pageSize;
      const result = await query.order("name", { ascending: true }).range(from, from + pageSize - 1);
      if (result.error) throw result.error;
      return Response.json({ salons: result.data || [], total: result.count || 0, page, page_size: pageSize }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const status = cleanText(params.get("status"), 20);
    const q = safeSearch(cleanText(params.get("q"), 100));
    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = Math.max(10, Math.min(100, Number(params.get("page_size") || 50)));
    let campaignsQuery = admin
      .from("featured_salon_campaigns")
      .select("*,salon:salons(id,name,slug,address_city,address_state,subscription_status,is_discoverable,latitude,longitude),entitlement:marketing_entitlements(id,source,external_reference,status,amount_minor,currency,valid_from,valid_until),audit:featured_campaign_audit(id,action,reason,created_at,acting_admin_id)", { count: "exact" });
    if (STATUSES.has(status)) campaignsQuery = campaignsQuery.eq("status", status);
    if (q) campaignsQuery = campaignsQuery.or(`internal_note.ilike.%${q}%`);
    const from = (page - 1) * pageSize;
    const [campaigns, settings, adminRow] = await Promise.all([
      campaignsQuery.order("created_at", { ascending: false }).range(from, from + pageSize - 1),
      admin.from("homepage_sections").select("section_key,title,description,empty_title,empty_body,empty_href").eq("section_key", "featured_salons").single(),
      admin.from("admin_users").select("id,user_id,is_super_admin").or(`user_id.eq.${user.id},id.eq.${user.id}`).maybeSingle(),
    ]);
    if (campaigns.error) throw campaigns.error;
    if (settings.error) throw settings.error;
    if (adminRow.error) throw adminRow.error;
    return Response.json({
      campaigns: campaigns.data || [],
      total: campaigns.count || 0,
      page,
      page_size: pageSize,
      settings: settings.data,
      can_delete: Boolean(adminRow.data?.is_super_admin),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "marketing", action: "load_featured_campaigns", actorRole: "admin", safeMessage: "We couldn't load Featured Salon campaigns." });
  }
}

async function POSTHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin, user } = await requireAdminPermission(request, "marketing");
    monitoringAdmin = admin;
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 30);

    if (action === "settings") {
      const emptyTitle = cleanText(body.empty_title, 100);
      const emptyBody = cleanText(body.empty_body, 240);
      const emptyHref = cleanText(body.empty_href, 300);
      if (!emptyTitle || !emptyBody || !/^\/(?!\/)/.test(emptyHref)) rejectRequest("Enter valid promotional card copy and an internal link.");
      const updated = await admin.from("homepage_sections").update({ empty_title: emptyTitle, empty_body: emptyBody, empty_href: emptyHref, updated_by: user.id, updated_at: new Date().toISOString() }).eq("section_key", "featured_salons").select().single();
      if (updated.error) throw updated.error;
      revalidatePath("/");
      return Response.json({ settings: updated.data });
    }

    if (action === "save") {
      const campaign = await saveCampaign({ admin, actorId: user.id, body });
      revalidatePath("/");
      revalidatePath("/admin/marketing");
      return Response.json({ campaign });
    }

    if (LIFECYCLE_ACTIONS.has(action)) {
      const campaignId = cleanText(body.id, 60);
      if (!UUID.test(campaignId)) rejectRequest("Choose a campaign.");
      const optionalNote = cleanText(body.optional_note, 1000) || null;
      if (["archive", "restore", "delete"].includes(action)) {
        const result = await admin.rpc("admin_manage_featured_campaign", {
          p_actor_user_id: user.id,
          p_campaign_id: campaignId,
          p_action: action,
          p_optional_note: optionalNote,
        });
        if (result.error) throw result.error;
        revalidatePath("/");
        revalidatePath("/admin/marketing");
        return Response.json({ result: result.data });
      }
      const existing = await admin.from("featured_salon_campaigns").select("*").eq("id", campaignId).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) return Response.json({ error: "Campaign not found." }, { status: 404 });
      const targetStatus = action === "pause" ? "Paused" : action === "expire" ? "Expired" : "Active";
      const campaign = await saveCampaign({
        admin,
        actorId: user.id,
        body: {
          ...existing.data,
          id: campaignId,
          status: targetStatus,
          indefinite: existing.data.ends_at == null,
          optional_note: optionalNote,
        } as Row,
      });
      revalidatePath("/");
      revalidatePath("/admin/marketing");
      return Response.json({ campaign });
    }

    rejectRequest("Choose a valid campaign action.");
  } catch (error) {
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "marketing", action: "save_featured_campaign", actorRole: "admin", safeMessage: "We couldn't save this Featured Salon campaign." });
  }
}

export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/featured-campaigns", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/featured-campaigns", "POST"), POSTHandler);