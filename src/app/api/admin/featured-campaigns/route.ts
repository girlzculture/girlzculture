import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["Draft", "Scheduled", "Active", "Paused", "Expired"]);
const ENTITLEMENT_SOURCES = new Set(["stripe_payment", "verified_invoice", "platform_credit"]);

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number, label: string, integer = false) {
  const parsed = value === null || value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || integer && !Number.isInteger(parsed)) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function validTimezone(value: unknown) {
  const timezone = cleanText(value, 80) || "America/New_York";
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); }
  catch { throw new Error("Choose a valid IANA timezone."); }
  return timezone;
}

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    await admin.rpc("expire_featured_campaigns");
    const search = new URL(request.url).searchParams;
    if (search.get("mode") === "salons") {
      const q = cleanText(search.get("q"), 100);
      let query = admin.from("salons").select("id,name,address_city,address_state,subscription_status,is_discoverable,latitude,longitude")
        .eq("status", "Active").eq("is_discoverable", true).in("subscription_status", ["active","trialing"]).not("latitude", "is", null).not("longitude", "is", null).order("name").limit(25);
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
    console.error("Featured campaign load failed", error);
    return errorResponse(error, "Unable to load Featured Salon campaigns.");
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "marketing");
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 30);
    if (action === "settings") {
      const emptyTitle = cleanText(body.empty_title, 100);
      const emptyBody = cleanText(body.empty_body, 240);
      const emptyHref = cleanText(body.empty_href, 300);
      if (!emptyTitle || !emptyBody || !/^\/(?!\/)/.test(emptyHref)) throw new Error("Enter valid promotional card copy and an internal link.");
      const { data, error } = await admin.from("homepage_sections").update({ empty_title: emptyTitle, empty_body: emptyBody, empty_href: emptyHref, updated_by: user.id, updated_at: new Date().toISOString() }).eq("section_key", "featured_salons").select().single();
      if (error) throw error;
      return Response.json({ settings: data });
    }
    if (action !== "save") throw new Error("Choose a valid campaign action.");
    const campaignId = cleanText(body.id, 60) || null;
    const salonId = cleanText(body.salon_id, 60);
    const status = cleanText(body.status, 20) || "Draft";
    const startsAt = cleanText(body.starts_at, 50);
    const endsAt = cleanText(body.ends_at, 50);
    const reason = cleanText(body.reason, 1000) || null;
    if (campaignId && !UUID.test(campaignId)) throw new Error("Campaign ID is invalid.");
    if (!UUID.test(salonId)) throw new Error("Choose an eligible salon.");
    const startTime = Date.parse(startsAt);
    const endTime = Date.parse(endsAt);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) throw new Error("Campaign end time must be after its start time.");
    if (!STATUSES.has(status)) throw new Error("Choose a valid campaign status.");
    if (campaignId && (!reason || reason.length < 5)) throw new Error("Enter an internal change reason of at least 5 characters.");
    const entitlementSource = cleanText(body.entitlement_source, 40) || null;
    if (entitlementSource && !ENTITLEMENT_SOURCES.has(entitlementSource)) throw new Error("Choose a valid paid entitlement source.");
    const entitlementReference = cleanText(body.entitlement_reference, 160) || null;
    if (entitlementSource && !entitlementReference) throw new Error("Enter the verified payment, invoice, or credit reference.");
    const entitlementAmount = body.entitlement_amount_minor === null || body.entitlement_amount_minor === "" || body.entitlement_amount_minor === undefined
      ? null
      : boundedNumber(body.entitlement_amount_minor, 0, 0, 100_000_000, "Entitlement amount", true);
    const { data, error } = await admin.rpc("admin_save_featured_campaign", {
      acting_admin_id: user.id,
      target_campaign_id: campaignId,
      target_salon_id: salonId,
      requested_status: status,
      campaign_starts_at: new Date(startTime).toISOString(),
      campaign_ends_at: new Date(endTime).toISOString(),
      campaign_timezone: validTimezone(body.timezone),
      campaign_radius_miles: boundedNumber(body.radius_miles, 25, 1, 250, "Radius"),
      campaign_priority: boundedNumber(body.priority, 50, 0, 100, "Priority", true),
      campaign_rotation_weight: boundedNumber(body.rotation_weight, 1, 0.1, 100, "Rotation weight"),
      campaign_internal_note: cleanText(body.internal_note, 1000) || null,
      entitlement_source: entitlementSource,
      entitlement_reference: entitlementReference,
      entitlement_amount_minor: entitlementAmount,
      change_reason: reason,
    });
    if (error) throw error;
    return Response.json({ campaign_id: data });
  } catch (error) {
    console.error("Featured campaign save failed", error);
    return errorResponse(error, "Unable to save this Featured Salon campaign.");
  }
}
