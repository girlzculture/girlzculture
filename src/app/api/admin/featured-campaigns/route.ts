import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanText } from "@/lib/requestSecurity";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { verifyMarketingEntitlement } from "@/lib/marketingEntitlements";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["Draft", "Scheduled", "Active", "Paused", "Expired"]);
const ENTITLEMENT_SOURCES = new Set(["stripe_payment", "verified_invoice", "platform_credit"]);

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

async function GETHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    monitoringAdmin = admin;
    await admin.rpc("expire_featured_campaigns");
    const search = new URL(request.url).searchParams;
    if (search.get("mode") === "salons") {
      const q = cleanText(search.get("q"), 100);
      let query = admin.from("salons").select("id,name,address_city,address_state,subscription_status,is_discoverable,latitude,longitude")
        .eq("status", "Active").eq("is_discoverable", true).eq("geocode_status", "success").eq("address_needs_review", false).not("latitude", "is", null).not("longitude", "is", null).order("name").limit(25);
      if (q) query = query.ilike("name", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return Response.json({ salons: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [{ data: campaigns, error }, { data: settings, error: settingsError }] = await Promise.all([
      admin.from("featured_salon_campaigns").select("*,salon:salons(id,name,slug,address_city,address_state,subscription_status,is_discoverable,latitude,longitude),entitlement:marketing_entitlements(id,source,external_reference,status,amount_minor,currency,valid_from,valid_until),audit:featured_campaign_audit(id,action,reason,created_at,acting_admin_id)").order("created_at", { ascending: false }).limit(200),
      admin.from("homepage_sections").select("section_key,title,description,empty_title,empty_body,empty_href").eq("section_key", "featured_salons").single(),
    ]);
    if (error) throw error;
    if (settingsError) throw settingsError;
    return Response.json({ campaigns: campaigns || [], settings }, { headers: { "Cache-Control": "private, no-store" } });
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
      const { data, error } = await admin.from("homepage_sections").update({ empty_title: emptyTitle, empty_body: emptyBody, empty_href: emptyHref, updated_by: user.id, updated_at: new Date().toISOString() }).eq("section_key", "featured_salons").select().single();
      if (error) throw error;
      return Response.json({ settings: data });
    }
    if (action !== "save") rejectRequest("Choose a valid campaign action.");
    const campaignId = cleanText(body.id, 60) || null;
    const salonId = cleanText(body.salon_id, 60);
    const status = cleanText(body.status, 20) || "Draft";
    const startsAt = cleanText(body.starts_at, 50);
    const endsAt = cleanText(body.ends_at, 50);
    const reason = cleanText(body.reason, 1000) || null;
    if (campaignId && !UUID.test(campaignId)) rejectRequest("Campaign ID is invalid.");
    if (!UUID.test(salonId)) rejectRequest("Choose an eligible salon.");
    const startTime = Date.parse(startsAt);
    const endTime = Date.parse(endsAt);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) rejectRequest("Campaign end time must be after its start time.");
    if (!STATUSES.has(status)) rejectRequest("Choose a valid campaign status.");
    if (campaignId && (!reason || reason.length < 5)) rejectRequest("Enter an internal change reason of at least 5 characters.");
    const placementBasis = cleanText(body.placement_basis, 30) || "paid";
    if (!new Set(["paid", "complimentary_admin"]).has(placementBasis)) rejectRequest("Choose a valid placement basis.");
    if (placementBasis === "complimentary_admin" && (!reason || reason.length < 5)) rejectRequest("Enter an internal reason of at least 5 characters for this complimentary placement.");
    const timezone = validTimezone(body.timezone);
    const radiusMiles = boundedNumber(body.radius_miles, 25, 1, 250, "Radius");
    const priority = boundedNumber(body.priority, 50, 0, 100, "Priority", true);
    const rotationWeight = boundedNumber(body.rotation_weight, 1, 0.1, 100, "Rotation weight");
    const internalNote = cleanText(body.internal_note, 1000) || null;

    if (placementBasis === "complimentary_admin") {
      const { data: salon, error: salonError } = await admin.from("salons")
        .select("id,status,is_discoverable,latitude,longitude,geocode_status,address_needs_review")
        .eq("id", salonId).maybeSingle();
      if (salonError) throw salonError;
      if (!salon) rejectRequest("Salon not found.");
      if (["Scheduled", "Active"].includes(status) && (
        salon.status !== "Active" || !salon.is_discoverable || salon.latitude == null || salon.longitude == null ||
        salon.geocode_status !== "success" || salon.address_needs_review
      )) rejectRequest("Only active, public, discoverable salons with a verified location can be featured.");
      const now = Date.now();
      const normalizedStatus = ["Scheduled", "Active"].includes(status)
        ? startTime > now ? "Scheduled" : endTime <= now ? "Expired" : "Active"
        : status;
      const savedValues = {
        salon_id: salonId,
        entitlement_id: null,
        placement_basis: "complimentary_admin",
        complimentary_reason: reason,
        complimentary_approved_by: user.id,
        complimentary_approved_at: new Date().toISOString(),
        status: normalizedStatus,
        starts_at: new Date(startTime).toISOString(),
        ends_at: new Date(endTime).toISOString(),
        timezone,
        radius_miles: radiusMiles,
        priority,
        rotation_weight: rotationWeight,
        internal_note: internalNote,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      let savedId = campaignId;
      let previous: Record<string, unknown> | null = null;
      if (campaignId) {
        const existingResult = await admin.from("featured_salon_campaigns").select("*").eq("id", campaignId).maybeSingle();
        if (existingResult.error) throw existingResult.error;
        if (!existingResult.data) rejectRequest("Campaign not found.");
        if (existingResult.data.salon_id !== salonId) rejectRequest("A campaign salon cannot be replaced.");
        previous = existingResult.data;
        const updateResult = await admin.from("featured_salon_campaigns").update(savedValues).eq("id", campaignId).select("id").single();
        if (updateResult.error) throw updateResult.error;
      } else {
        const insertResult = await admin.from("featured_salon_campaigns").insert({ ...savedValues, created_by: user.id }).select("id").single();
        if (insertResult.error) throw insertResult.error;
        savedId = insertResult.data.id;
      }
      const auditResult = await admin.from("featured_campaign_audit").insert({
        campaign_id: savedId,
        action: campaignId ? "Complimentary placement edited" : "Complimentary placement created",
        previous_values: previous,
        new_values: savedValues,
        reason,
        acting_admin_id: user.id,
      });
      if (auditResult.error) throw auditResult.error;
      return Response.json({ campaign_id: savedId, placement_basis: placementBasis });
    }
    const entitlementSource = cleanText(body.entitlement_source, 40) || null;
    if (entitlementSource && !ENTITLEMENT_SOURCES.has(entitlementSource)) rejectRequest("Choose a valid paid entitlement source.");
    const entitlementReference = cleanText(body.entitlement_reference, 160) || null;
    if (entitlementSource && !entitlementReference) rejectRequest("Enter the verified payment, invoice, or credit reference.");
    const requestedEntitlementAmount = body.entitlement_amount_minor === null || body.entitlement_amount_minor === "" || body.entitlement_amount_minor === undefined
      ? null
      : boundedNumber(body.entitlement_amount_minor, 0, 0, 100_000_000, "Entitlement amount", true);
    const verifiedEntitlement = await verifyMarketingEntitlement({ admin, source: entitlementSource, reference: entitlementReference, salonId, placement: "Featured Salon", startsAt: new Date(startTime).toISOString(), endsAt: new Date(endTime).toISOString() });
    const entitlementAmount = verifiedEntitlement?.amountMinor ?? requestedEntitlementAmount;
    const { data, error } = await admin.rpc("admin_save_featured_campaign", {
      acting_admin_id: user.id,
      target_campaign_id: campaignId,
      target_salon_id: salonId,
      requested_status: status,
      campaign_starts_at: new Date(startTime).toISOString(),
      campaign_ends_at: new Date(endTime).toISOString(),
      campaign_timezone: timezone,
      campaign_radius_miles: radiusMiles,
      campaign_priority: priority,
      campaign_rotation_weight: rotationWeight,
      campaign_internal_note: internalNote,
      entitlement_source: entitlementSource,
      entitlement_reference: entitlementReference,
      entitlement_amount_minor: entitlementAmount,
      change_reason: reason,
    });
    if (error) throw error;
    const basisUpdate = await admin.from("featured_salon_campaigns")
      .update({ placement_basis: "paid", complimentary_reason: null, complimentary_approved_by: null, complimentary_approved_at: null })
      .eq("id", data);
    if (basisUpdate.error) throw basisUpdate.error;
    return Response.json({ campaign_id: data });
  } catch (error) {
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "marketing", action: "save_featured_campaign", actorRole: "admin", safeMessage: "We couldn't save this Featured Salon campaign." });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/featured-campaigns", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/featured-campaigns", "POST"), POSTHandler);
