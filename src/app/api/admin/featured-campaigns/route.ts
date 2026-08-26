import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { cleanText } from "@/lib/requestSecurity";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { verifyMarketingEntitlement } from "@/lib/marketingEntitlements";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set([
  "Draft",
  "Scheduled",
  "Active",
  "Paused",
  "Expired",
  "Archived",
]);
const PLACEMENT_BASES = new Set([
  "paid",
  "platform_credit",
  "complimentary_admin",
]);
const PAID_SOURCES = new Set(["stripe_payment", "verified_invoice"]);

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
  integer = false,
) {
  const parsed =
    value === null || value === undefined || value === ""
      ? fallback
      : Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < minimum ||
    parsed > maximum ||
    (integer && !Number.isInteger(parsed))
  ) {
    rejectRequest(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function validTimezone(value: unknown) {
  const timezone = cleanText(value, 80) || "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    rejectRequest("Choose a valid timezone.");
  }
  return timezone;
}

function parsedDate(value: unknown, label: string, required = true) {
  const text = cleanText(value, 50);
  if (!text && !required) return null;
  const timestamp = Date.parse(text);
  if (!text || !Number.isFinite(timestamp)) {
    rejectRequest(`Choose a valid ${label}.`);
  }
  return new Date(timestamp).toISOString();
}

async function loadCampaigns(admin: SupabaseClient) {
  const result = await admin
    .from("featured_salon_campaigns")
    .select(
      "*,salon:salons(id,name,slug,address_city,address_state,subscription_status,is_discoverable,latitude,longitude),entitlement:marketing_entitlements(id,source,external_reference,status,amount_minor,currency,valid_from,valid_until),audit:featured_campaign_audit(id,action,reason,created_at,acting_admin_id,campaign_id_snapshot,salon_id_snapshot,salon_name_snapshot,placement_basis_snapshot,deleted_at)",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (result.error) throw result.error;
  return result.data || [];
}

async function GETHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    monitoringAdmin = admin;
    const params = new URL(request.url).searchParams;
    const mode = cleanText(params.get("mode"), 30);

    if (mode === "salons") {
      const q = cleanText(params.get("q"), 100);
      const page = Math.max(1, Number(params.get("page") || 1));
      const pageSize = Math.max(
        20,
        Math.min(200, Number(params.get("page_size") || 100)),
      );
      const from = (page - 1) * pageSize;
      let query = admin
        .from("salons")
        .select(
          "id,name,address_city,address_state,subscription_status,is_discoverable,latitude,longitude,geocode_status,address_needs_review,status",
          { count: "exact" },
        )
        .eq("status", "Active")
        .eq("is_discoverable", true)
        .eq("geocode_status", "success")
        .eq("address_needs_review", false)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("name", { ascending: true })
        .range(from, from + pageSize - 1);
      if (q) {
        query = query.ilike("name", `%${q.replace(/[%_,()]/g, "")}%`);
      }
      const result = await query;
      if (result.error) throw result.error;
      return Response.json(
        {
          salons: result.data || [],
          total: result.count || 0,
          page,
          page_size: pageSize,
          has_more: from + (result.data?.length || 0) < (result.count || 0),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    await admin.rpc("expire_featured_campaigns");
    const [campaigns, settingsResult] = await Promise.all([
      loadCampaigns(admin),
      admin
        .from("homepage_sections")
        .select(
          "section_key,title,description,empty_title,empty_body,empty_href",
        )
        .eq("section_key", "featured_salons")
        .single(),
    ]);
    if (settingsResult.error) throw settingsResult.error;
    return Response.json(
      { campaigns, settings: settingsResult.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "marketing",
      action: "load_featured_campaigns",
      actorRole: "admin",
      safeMessage: "Featured Salon campaigns could not be loaded.",
    });
  }
}

async function POSTHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin, user } = await requireAdminPermission(request, "marketing");
    monitoringAdmin = admin;
    const body = (await request.json()) as Record<string, unknown>;
    const action = cleanText(body.action, 30);

    if (action === "settings") {
      const emptyTitle = cleanText(body.empty_title, 100);
      const emptyBody = cleanText(body.empty_body, 240);
      const emptyHref = cleanText(body.empty_href, 300);
      if (!emptyTitle || !emptyBody || !/^\/(?!\/)/.test(emptyHref)) {
        rejectRequest("Enter valid promotional card copy and an internal link.");
      }
      const result = await admin
        .from("homepage_sections")
        .update({
          empty_title: emptyTitle,
          empty_body: emptyBody,
          empty_href: emptyHref,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("section_key", "featured_salons")
        .select()
        .single();
      if (result.error) throw result.error;
      revalidatePath("/");
      return Response.json({ settings: result.data });
    }

    if (action === "manage") {
      const campaignId = cleanText(body.id, 60);
      const lifecycleAction = cleanText(body.lifecycle_action, 20).toLowerCase();
      const optionalNote = cleanText(body.note, 1000) || null;
      if (!UUID.test(campaignId)) rejectRequest("Choose a valid campaign.");
      if (!["archive", "restore", "delete"].includes(lifecycleAction)) {
        rejectRequest("Choose archive, restore, or delete.");
      }
      const result = await admin.rpc("admin_manage_featured_campaign", {
        p_actor_user_id: user.id,
        p_campaign_id: campaignId,
        p_action: lifecycleAction,
        p_optional_note: optionalNote,
      });
      if (result.error) throw result.error;
      revalidatePath("/");
      return Response.json({ ok: true, campaign: result.data });
    }

    if (action !== "save") rejectRequest("Choose a valid campaign action.");

    const campaignId = cleanText(body.id, 60) || null;
    const salonId = cleanText(body.salon_id, 60);
    const status = cleanText(body.status, 20) || "Draft";
    const startsAt = parsedDate(body.starts_at, "campaign start time");
    const noEnd = body.no_end === true;
    const endsAt = noEnd
      ? null
      : parsedDate(body.ends_at, "campaign end time", false);
    const timezone = validTimezone(body.timezone);
    const radiusMiles = boundedNumber(body.radius_miles, 25, 1, 250, "Radius");
    const priority = boundedNumber(body.priority, 50, 0, 100, "Priority", true);
    const rotationWeight = boundedNumber(
      body.rotation_weight,
      1,
      0.1,
      100,
      "Rotation weight",
    );
    const internalNote = cleanText(body.internal_note, 1000) || null;
    const optionalNote = cleanText(body.note, 1000) || null;
    const placementBasis =
      cleanText(body.placement_basis, 30) || "complimentary_admin";
    const entitlementSource = cleanText(body.entitlement_source, 40) || null;
    const entitlementReference =
      cleanText(body.entitlement_reference, 160) || null;
    const entitlementAmountMinor =
      body.entitlement_amount_minor === null ||
      body.entitlement_amount_minor === undefined ||
      body.entitlement_amount_minor === ""
        ? null
        : boundedNumber(
            body.entitlement_amount_minor,
            0,
            0,
            100_000_000,
            "Placement amount",
            true,
          );

    if (campaignId && !UUID.test(campaignId)) {
      rejectRequest("Campaign ID is invalid.");
    }
    if (!UUID.test(salonId)) rejectRequest("Choose an eligible salon.");
    if (!STATUSES.has(status) || status === "Archived") {
      rejectRequest("Choose Draft, Scheduled, Active, Paused, or Expired.");
    }
    if (!PLACEMENT_BASES.has(placementBasis)) {
      rejectRequest("Choose a valid placement basis.");
    }
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt as string)) {
      rejectRequest("Campaign end time must be after its start time.");
    }

    if (placementBasis === "paid") {
      if (!["Draft", "Paused", "Expired"].includes(status)) {
        if (!entitlementSource || !PAID_SOURCES.has(entitlementSource)) {
          rejectRequest("Choose verified Stripe payment or invoice evidence.");
        }
        if (!entitlementReference) {
          rejectRequest("Enter the verified Stripe payment or invoice reference.");
        }
      }
      if (entitlementSource && entitlementReference) {
        await verifyMarketingEntitlement({
          admin,
          source: entitlementSource,
          reference: entitlementReference,
          salonId,
          placement: "Featured Salon",
          startsAt: startsAt as string,
          endsAt,
        });
      }
    }

    const result = await admin.rpc("admin_save_featured_campaign_v2", {
      p_actor_user_id: user.id,
      p_campaign_id: campaignId,
      p_salon_id: salonId,
      p_requested_status: status,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_timezone: timezone,
      p_radius_miles: radiusMiles,
      p_priority: priority,
      p_rotation_weight: rotationWeight,
      p_internal_note: internalNote,
      p_placement_basis: placementBasis,
      p_entitlement_source:
        placementBasis === "paid" ? entitlementSource : null,
      p_entitlement_reference:
        placementBasis === "paid" ? entitlementReference : null,
      p_entitlement_amount_minor: entitlementAmountMinor,
      p_optional_note: optionalNote,
    });
    if (result.error) throw result.error;
    revalidatePath("/");
    return Response.json({
      ok: true,
      campaign_id: result.data,
      placement_basis: placementBasis,
      indefinite: endsAt === null,
    });
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "marketing",
      action: "save_featured_campaign",
      actorRole: "admin",
      safeMessage: "The Featured Salon campaign could not be saved.",
    });
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/featured-campaigns", "GET"),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/featured-campaigns", "POST"),
  POSTHandler,
);
