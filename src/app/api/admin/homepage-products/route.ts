import type { SupabaseClient } from "@supabase/supabase-js";
import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  monitoredRouteFailure,
  rejectRequest,
} from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
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
const ENTITLEMENT_SOURCES = new Set([
  "stripe_payment",
  "verified_invoice",
  "platform_credit",
]);

function parseDate(value: unknown, label: string, optional = false) {
  const text = cleanText(value, 50);
  if (!text && optional) return null;
  const time = Date.parse(text);
  if (!Number.isFinite(time)) rejectRequest(`Choose a valid ${label}.`);
  return new Date(time).toISOString();
}

async function GETHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    monitoringAdmin = admin;
    const search = new URL(request.url).searchParams;
    if (search.get("mode") === "products") {
      const query = cleanText(search.get("q"), 100);
      let products = admin
        .from("salon_products")
        .select(
          "id,salon_id,name,description,price,sale_price,photo_url,images,inventory_quantity,track_inventory,pickup_enabled,product_status,is_visible,archived_at,salon:salons(id,name,slug,status,is_discoverable,subscription_status,subscription_tier,address_city,address_state)",
        )
        .eq("product_status", "Active")
        .eq("is_visible", true)
        .eq("pickup_enabled", true)
        .is("archived_at", null)
        .order("name")
        .limit(40);
      if (query) products = products.ilike("name", `%${query}%`);
      const { data, error } = await products;
      if (error) throw error;
      return Response.json(
        {
          products: (data || []).filter((row) => {
            const salon = Array.isArray(row.salon)
              ? row.salon[0]
              : row.salon;
            return (
              salon?.status === "Active" &&
              salon?.is_discoverable === true &&
              ["active", "trialing"].includes(
                String(salon?.subscription_status || "").toLowerCase(),
              ) &&
              (row.track_inventory !== true ||
                Number(row.inventory_quantity || 0) > 0)
            );
          }),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const { data, error } = await admin
      .from("homepage_product_placements")
      .select(
        "*,product:salon_products(id,salon_id,name,description,price,sale_price,photo_url,images,inventory_quantity,track_inventory,pickup_enabled,product_status,is_visible,archived_at,salon:salons(id,name,slug,status,is_discoverable,subscription_status,subscription_tier,address_city,address_state)),entitlement:marketing_entitlements(*),audit:homepage_product_placement_audit(id,action,reason,created_at,acting_admin_id)",
      )
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    return Response.json(
      { placements: data || [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "homepage-products",
      action: "load-homepage-products",
      actorRole: "admin",
      safeMessage: "We couldn't load Featured Products.",
    });
  }
}

async function POSTHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  let placementId: string | null = null;
  try {
    const { admin, user } = await requireAdminPermission(
      request,
      "marketing",
    );
    monitoringAdmin = admin;
    const body = (await request.json()) as Record<string, unknown>;
    placementId = cleanText(body.id, 60) || null;
    const productId = cleanText(body.product_id, 60);
    const status = cleanText(body.status, 30) || "Draft";
    const sortOrder = Number(body.sort_order || 1);
    const startsAt = parseDate(body.starts_at, "start date");
    const endsAt = parseDate(body.ends_at, "end date", true);
    const reason = cleanText(body.reason, 1000) || null;
    if (placementId && !UUID.test(placementId))
      rejectRequest("Placement ID is invalid.");
    if (!UUID.test(productId)) rejectRequest("Choose a product.");
    if (!STATUSES.has(status)) rejectRequest("Choose a valid placement status.");
    if (
      !Number.isInteger(sortOrder) ||
      sortOrder < 1 ||
      sortOrder > 100
    ) {
      rejectRequest("Sort order must be from 1 to 100.");
    }
    if (!startsAt) rejectRequest("Choose a valid start date.");
    if (endsAt && new Date(endsAt) <= new Date(startsAt))
      rejectRequest("The end date must be after the start date.");
    if (placementId && (!reason || reason.length < 5))
      rejectRequest("Enter an internal change reason of at least 5 characters.");

    const { data: product, error: productError } = await admin
      .from("salon_products")
      .select(
        "id,salon_id,name,pickup_enabled,product_status,is_visible,archived_at,salon:salons(id,status,is_discoverable,subscription_status,subscription_tier)",
      )
      .eq("id", productId)
      .single();
    if (productError) throw productError;
    const salon = Array.isArray(product.salon)
      ? product.salon[0]
      : product.salon;
    if (
      !salon ||
      product.pickup_enabled !== true ||
      product.product_status !== "Active" ||
      product.is_visible !== true ||
      product.archived_at ||
      salon.status !== "Active" ||
      salon.is_discoverable !== true ||
      !["active", "trialing"].includes(
        String(salon.subscription_status || "").toLowerCase(),
      )
    ) {
      rejectRequest(
        "Choose an active pickup product from an active, subscribed salon.",
        409,
      );
    }

    const source = cleanText(body.entitlement_source, 40) || null;
    const reference = cleanText(body.entitlement_reference, 160) || null;
    if (source && !ENTITLEMENT_SOURCES.has(source))
      rejectRequest("Choose a supported funding source.");
    if ((source && !reference) || (!source && reference))
      rejectRequest("Enter both the funding source and its verified reference.");
    let entitlementId: string | null =
      cleanText(body.entitlement_id, 60) || null;
    if (entitlementId && !UUID.test(entitlementId))
      rejectRequest("Entitlement ID is invalid.");
    if (source && reference) {
      const verifiedSource = source;
      const verifiedReference = reference;
      const evidence = await verifyMarketingEntitlement({
        admin,
        source: verifiedSource,
        reference: verifiedReference,
        salonId: String(product.salon_id),
        placement: "Featured Product",
        startsAt,
        endsAt: endsAt || startsAt,
      });
      if (verifiedSource !== "platform_credit") {
        const existingEntitlement = await admin
          .from("marketing_entitlements")
          .select("id,salon_id,placement_type")
          .eq("source", verifiedSource)
          .eq("external_reference", verifiedReference)
          .maybeSingle();
        if (existingEntitlement.error) throw existingEntitlement.error;
        if (
          existingEntitlement.data &&
          (existingEntitlement.data.salon_id !== product.salon_id ||
            existingEntitlement.data.placement_type !== "Featured Product")
        ) {
          rejectRequest(
            "That funding reference belongs to another placement.",
            409,
          );
        }
        if (existingEntitlement.data) {
          const entitlement = await admin
            .from("marketing_entitlements")
            .update({
              status: "Paid",
              amount_minor: evidence?.amountMinor ?? null,
              currency: evidence?.currency || "usd",
              valid_from: startsAt,
              valid_until: endsAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingEntitlement.data.id)
            .select("id")
            .single();
          if (entitlement.error) throw entitlement.error;
          entitlementId = entitlement.data.id;
        } else {
          const entitlement = await admin
            .from("marketing_entitlements")
            .insert(
            {
              placement_type: "Featured Product",
              salon_id: product.salon_id,
              source: verifiedSource,
              external_reference: verifiedReference,
              status: "Paid",
              amount_minor: evidence?.amountMinor ?? null,
              currency: evidence?.currency || "usd",
              valid_from: startsAt,
              valid_until: endsAt,
              created_by: user.id,
              updated_at: new Date().toISOString(),
            },
          )
            .select("id")
            .single();
          if (entitlement.error) throw entitlement.error;
          entitlementId = entitlement.data.id;
        }
      } else {
        const existing = await admin
          .from("marketing_entitlements")
          .select("id")
          .eq("source", verifiedSource)
          .eq("external_reference", verifiedReference)
          .eq("salon_id", product.salon_id)
          .eq("placement_type", "Featured Product")
          .single();
        if (existing.error) throw existing.error;
        entitlementId = existing.data.id;
      }
    }
    if (
      ["Scheduled", "Active"].includes(status) &&
      String(salon.subscription_tier || "").toLowerCase() !== "premium" &&
      !entitlementId
    ) {
      rejectRequest(
        "Active Featured Products require a Premium salon or a verified payment or platform credit.",
        409,
      );
    }

    const saved = await admin.rpc(
      "admin_save_homepage_product_placement",
      {
        p_actor_id: user.id,
        p_placement_id: placementId,
        p_product_id: productId,
        p_status: status,
        p_sort_order: sortOrder,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
        p_internal_note: cleanText(body.internal_note, 1000) || null,
        p_entitlement_id: entitlementId,
        p_reason: reason,
      },
    );
    if (saved.error) throw saved.error;
    return Response.json({ placement_id: saved.data });
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "homepage-products",
      action: "save-homepage-product",
      actorRole: "admin",
      recordType: "homepage_product_placement",
      recordId: placementId,
      safeMessage: "We couldn't save this Featured Product.",
    });
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/homepage-products", "GET"),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/homepage-products", "POST", {
    classification: "provider-backed",
    feature: "homepage-products",
    actorRole: "admin",
    provider: "stripe",
    safeMessage: "The Featured Product could not be saved.",
  }),
  POSTHandler,
);
