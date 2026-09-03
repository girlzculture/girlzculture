import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { requireSalonPermission } from "@/lib/supabaseAdmin";
import {
  canonicalPlanForStored,
  isSubscriptionActive,
  restrictivePlanForLimits,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from "@/lib/plans";
import { moderatePublicContent } from "@/lib/contentModerationServer";

type SaveConfig = { permission: string; fields: ReadonlySet<string>; label: string };

const CONFIG: Record<string, SaveConfig> = {
  styles: {
    permission: "styles",
    label: "service",
    fields: new Set(["master_style_id", "name", "category", "category_id", "service_group_id", "description", "duration_min_hours", "duration_max_hours", "buffer_minutes", "base_price", "price_display_min", "price_display_max", "size_options", "length_options", "addons", "included_items", "option_groups", "photos", "is_draft", "archived_at"]),
  },
  stylists: {
    permission: "stylists",
    label: "stylist",
    fields: new Set(["name", "bio", "specialties", "years_experience", "avatar_url", "photos", "is_active", "is_draft", "availability", "archived_at"]),
  },
  salon_products: {
    permission: "products",
    label: "product",
    fields: new Set([
      "name", "description", "price", "sale_price", "photo_url", "images",
      "is_visible", "in_person_only", "archived_at", "sku",
      "inventory_quantity", "low_stock_threshold", "track_inventory",
      "product_status", "pickup_enabled", "pickup_prep_minutes",
      "shipping_enabled", "weight_ounces", "dimensions", "shipping_profile",
      "shipping_price", "tax_category", "max_quantity_per_order",
    ]),
  },
  salon_promotions: {
    permission: "promotions",
    label: "promotion",
    fields: new Set(["title", "description", "public_headline", "promotion_type", "discount_value", "discount_label", "starts_at", "ends_at", "timezone", "status", "is_active", "paused_at", "target_scope", "target_ids", "restrictions", "archived_at"]),
  },
  bookings: {
    permission: "bookings",
    label: "booking",
    fields: new Set(["service_started_at", "status"]),
  },
};

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number, optional = false) {
  if ((value === "" || value === null || value === undefined) && optional) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  return number;
}

function sanitize(table: string, values: Record<string, unknown>, isInsert: boolean) {
  const config = CONFIG[table];
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "style_materials" && table === "styles") continue;
    if (!config.fields.has(key)) throw new Error(`The ${key} field cannot be changed for this ${config.label}.`);
    patch[key] = value;
  }

  if (table === "styles") {
    if ("name" in patch || isInsert) { patch.name = cleanText(patch.name, 120); if (!patch.name) throw new Error("Enter a customer-facing service name."); }
    if ("description" in patch) patch.description = cleanText(patch.description, 1_000);
    if ("duration_min_hours" in patch) patch.duration_min_hours = finiteNumber(patch.duration_min_hours, "Minimum duration", 0.25, 24);
    if ("duration_max_hours" in patch) patch.duration_max_hours = finiteNumber(patch.duration_max_hours, "Maximum duration", 0.25, 24);
    if ("duration_min_hours" in patch && "duration_max_hours" in patch && Number(patch.duration_max_hours) < Number(patch.duration_min_hours)) throw new Error("Maximum duration cannot be shorter than minimum duration.");
    if ("base_price" in patch) patch.base_price = finiteNumber(patch.base_price, "Base price", 0, 100_000);
    if ("price_display_min" in patch || isInsert) patch.price_display_min = finiteNumber(patch.price_display_min ?? patch.base_price, "Minimum price", 0, 100_000);
    if ("price_display_max" in patch || isInsert) patch.price_display_max = finiteNumber(patch.price_display_max ?? patch.base_price, "Maximum price", 0, 100_000);
    if ("price_display_min" in patch && "price_display_max" in patch && Number(patch.price_display_max) < Number(patch.price_display_min)) throw new Error("Maximum price cannot be lower than minimum price.");
    if ("buffer_minutes" in patch || isInsert) patch.buffer_minutes = finiteNumber(patch.buffer_minutes ?? 0, "Cleanup buffer", 0, 180);
  } else if (table === "stylists") {
    if ("name" in patch || isInsert) { patch.name = cleanText(patch.name, 120); if (!patch.name) throw new Error("Enter the stylist's name."); }
    if ("bio" in patch) patch.bio = cleanText(patch.bio, 500);
    if ("years_experience" in patch) patch.years_experience = finiteNumber(patch.years_experience, "Years of experience", 0, 70, true);
  } else if (table === "salon_products") {
    patch.name = cleanText(patch.name, 120);
    if (!patch.name) throw new Error("Enter the product name.");
    patch.description = cleanText(patch.description, 1_000);
    patch.price = finiteNumber(patch.price, "Product price", 0, 100_000);
    if ("sale_price" in patch) patch.sale_price = finiteNumber(patch.sale_price, "Sale price", 0, Number(patch.price || 100_000), true);
    if ("sku" in patch) patch.sku = cleanText(patch.sku, 80) || null;
    if ("inventory_quantity" in patch) patch.inventory_quantity = Math.floor(Number(finiteNumber(patch.inventory_quantity, "Inventory quantity", 0, 1_000_000)));
    if ("low_stock_threshold" in patch) patch.low_stock_threshold = Math.floor(Number(finiteNumber(patch.low_stock_threshold, "Low-stock threshold", 0, 1_000_000)));
    if ("pickup_prep_minutes" in patch) patch.pickup_prep_minutes = Math.floor(Number(finiteNumber(patch.pickup_prep_minutes, "Pickup preparation time", 0, 43_200)));
    if ("shipping_price" in patch) patch.shipping_price = finiteNumber(patch.shipping_price, "Shipping price", 0, 100_000);
    if ("weight_ounces" in patch) patch.weight_ounces = finiteNumber(patch.weight_ounces, "Weight", 0.01, 100_000, true);
    if ("max_quantity_per_order" in patch) patch.max_quantity_per_order = Math.floor(Number(finiteNumber(patch.max_quantity_per_order, "Maximum quantity", 1, 1_000)));
    if ("product_status" in patch && !new Set(["Draft", "Active", "Archived"]).has(String(patch.product_status))) throw new Error("Choose Draft, Active, or Archived status.");
    if ("tax_category" in patch) patch.tax_category = cleanText(patch.tax_category, 80) || "general_tangible_goods";
    if ("shipping_profile" in patch) patch.shipping_profile = cleanText(patch.shipping_profile, 120) || null;
    if ("dimensions" in patch) {
      const dimensions = patch.dimensions && typeof patch.dimensions === "object" && !Array.isArray(patch.dimensions) ? patch.dimensions as Record<string, unknown> : {};
      patch.dimensions = {
        length: finiteNumber(dimensions.length, "Package length", 0.01, 1_000, true),
        width: finiteNumber(dimensions.width, "Package width", 0.01, 1_000, true),
        height: finiteNumber(dimensions.height, "Package height", 0.01, 1_000, true),
        unit: "in",
      };
    }
    if ("images" in patch) patch.images = Array.isArray(patch.images) ? patch.images.map((value) => cleanText(value, 2_000)).filter(Boolean).slice(0, 12) : [];
    if (patch.product_status === "Active" && patch.is_visible !== false && patch.pickup_enabled !== true && patch.shipping_enabled !== true) throw new Error("Enable pickup or shipping before publishing this product for online purchase.");
  } else if (table === "salon_promotions") {
    if ("title" in patch || isInsert) { patch.title = cleanText(patch.title, 160); if (!patch.title) throw new Error("Enter a promotion title."); }
    if ("public_headline" in patch || isInsert) { patch.public_headline = cleanText(patch.public_headline, 160); if (!patch.public_headline) patch.public_headline = patch.title; }
    if ("description" in patch) patch.description = cleanText(patch.description, 1_000);
    if ("discount_label" in patch) patch.discount_label = cleanText(patch.discount_label, 80);
    if ("promotion_type" in patch || isInsert) {
      const type = cleanText(patch.promotion_type || "descriptive", 30);
      if (!new Set(["percentage", "fixed", "free_addon", "free_service", "descriptive"]).has(type)) throw new Error("Choose a supported offer type.");
      patch.promotion_type = type;
    }
    if ("discount_value" in patch || isInsert) patch.discount_value = finiteNumber(patch.discount_value ?? 0, "Discount value", 0, patch.promotion_type === "percentage" ? 100 : 100_000);
    if ("status" in patch || isInsert) {
      const status = cleanText(patch.status || "Draft", 20);
      if (!new Set(["Draft", "Active", "Paused", "Archived"]).has(status)) throw new Error("Choose a supported promotion status.");
      patch.status = status;
      patch.is_active = status === "Active";
    }
    if ("target_scope" in patch || isInsert) {
      const scope = cleanText(patch.target_scope || "salon", 30);
      if (!new Set(["salon", "services", "service_groups", "master_styles", "products", "addons"]).has(scope)) throw new Error("Choose where this promotion applies.");
      patch.target_scope = scope;
    }
    if ("target_ids" in patch) patch.target_ids = Array.isArray(patch.target_ids) ? patch.target_ids.map((value) => cleanText(value, 120)).filter(Boolean).slice(0, 100) : [];
    if ("restrictions" in patch) {
      const restrictions = patch.restrictions && typeof patch.restrictions === "object" && !Array.isArray(patch.restrictions) ? patch.restrictions as Record<string, unknown> : {};
      patch.restrictions = {
        minimum_subtotal: finiteNumber(restrictions.minimum_subtotal ?? 0, "Minimum booking subtotal", 0, 100_000),
        new_customers_only: restrictions.new_customers_only === true,
        usage_limit: finiteNumber(restrictions.usage_limit ?? 0, "Total use limit", 0, 1_000_000),
        per_customer_limit: finiteNumber(restrictions.per_customer_limit ?? 0, "Per-customer use limit", 0, 100),
        terms: cleanText(restrictions.terms, 500),
      };
    }
    if (
      patch.target_scope &&
      patch.target_scope !== "salon" &&
      Array.isArray(patch.target_ids) &&
      patch.target_ids.length === 0
    ) throw new Error("Choose at least one eligible item for this promotion.");
    for (const key of ["starts_at", "ends_at", "paused_at"] as const) if (key in patch && patch[key]) patch[key] = new Date(String(patch[key])).toISOString();
    if (patch.starts_at && patch.ends_at && new Date(String(patch.ends_at)) <= new Date(String(patch.starts_at))) throw new Error("The promotion end must be after its start.");
    if ("timezone" in patch) patch.timezone = cleanText(patch.timezone, 80) || "America/New_York";
  } else if (table === "bookings") {
    if (patch.status !== "In Progress") throw new Error("Choose a supported booking action.");
    patch.service_started_at = new Date(String(patch.service_started_at || "")).toISOString();
  }
  return patch;
}

function isUserInputError(error: unknown) {
  return error instanceof Error && !/permission denied|violates|constraint|record\s+"|column|relation|postgres|supabase|pgrst/i.test(error.message);
}

function planLimit(plan: SubscriptionPlan, table: string) {
  if (table === "salon_products") {
    return SUBSCRIPTION_PLANS[plan].entitlements.productListings.limit;
  }
  return SUBSCRIPTION_PLANS[plan].entitlements.customerPromotions.limit;
}

async function enforcePlanAllowance(input: {
  admin: Awaited<ReturnType<typeof requireSalonPermission>>["admin"];
  salonId: string;
  storedPlan: unknown;
  table: "salon_products" | "salon_promotions";
  id: string | null;
  values: Record<string, unknown>;
}) {
  const plan = canonicalPlanForStored(input.storedPlan) || "Starter";
  const limit = planLimit(plan, input.table);
  if (limit === null) return;

  const isNewProduct = input.table === "salon_products" && !input.id
    && input.values.archived_at == null
    && input.values.product_status !== "Archived";
  const activatesPromotion = input.table === "salon_promotions"
    && input.values.archived_at == null
    && input.values.status === "Active"
    && input.values.is_active === true;
  if (!isNewProduct && !activatesPromotion) return;

  let countQuery = input.admin
    .from(input.table)
    .select("id", { count: "exact", head: true })
    .eq("salon_id", input.salonId)
    .is("archived_at", null);
  if (input.table === "salon_products") {
    countQuery = countQuery.neq("product_status", "Archived");
  } else {
    countQuery = countQuery.eq("status", "Active").eq("is_active", true);
  }
  if (input.id) countQuery = countQuery.neq("id", input.id);
  const counted = await countQuery;
  if (counted.error) throw counted.error;
  if ((counted.count || 0) >= limit) {
    const item = input.table === "salon_products" ? "product listings" : "active promotions";
    throw new Error(`Your ${plan} plan allows ${limit} ${item}. Archive one or choose another plan before adding more.`);
  }
}

async function POSTHandler(request: Request) {
  let admin;
  let salonId: string | null = null;
  try {
    const body = await request.json() as Record<string, unknown>;
    const table = cleanText(body.table, 40);
    const config = CONFIG[table];
    if (!config) throw new Error("Choose a supported salon record type.");
    const context = await requireSalonPermission(request, config.permission);
    admin = context.admin;
    salonId = context.salon.id;
    let effectiveSubscriptionTier: unknown = context.salon.subscription_tier;
    if (table === "salon_products" || table === "salon_promotions") {
      const subscription = await admin.from("subscriptions").select("tier,status,current_period_end,scheduled_tier").eq("salon_id", salonId).maybeSingle();
      if (subscription.error) throw subscription.error;
      if (!subscription.data || !isSubscriptionActive(subscription.data.status, subscription.data.current_period_end)) {
        throw new Error(`${table === "salon_products" ? "Products" : "Promotions"} require an active salon subscription.`);
      }
      effectiveSubscriptionTier = restrictivePlanForLimits(
        subscription.data.tier,
        subscription.data.scheduled_tier,
      );
    }
    const id = cleanText(body.id, 60) || null;
    const rawValues = body.values && typeof body.values === "object" && !Array.isArray(body.values) ? body.values as Record<string, unknown> : {};
    const values = sanitize(table, rawValues, !id);
    if (table === "salon_products" || table === "salon_promotions") {
      await enforcePlanAllowance({
        admin,
        salonId: context.salon.id,
        storedPlan: effectiveSubscriptionTier,
        table: table as "salon_products" | "salon_promotions",
        id,
        values,
      });
    }
    if (["styles", "stylists", "salon_products", "salon_promotions"].includes(table)) {
      const moderation = await moderatePublicContent(admin, {
        name: typeof values.name === "string" ? values.name : undefined,
        title: typeof values.title === "string" ? values.title : typeof values.public_headline === "string" ? values.public_headline : undefined,
        body: [values.description, values.bio]
          .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
          .join("\n"),
      });
      if (!moderation.allowed)
        throw new Error(`Please revise the ${config.label} content to remove abusive, hateful, threatening, or unsafe language.`);
    }

    if (table === "styles" && Array.isArray(rawValues.style_materials)) {
      const materials = rawValues.style_materials.slice(0, 30).map((item) => {
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          name: cleanText(row.name, 120),
          price: finiteNumber(row.price ?? 0, "Material price", 0, 100_000),
          longevity_weeks: finiteNumber(row.longevity_weeks ?? 4, "Material longevity", 1, 12),
          quality_grade: cleanText(row.quality_grade, 50) || "Good",
          option_type: "material",
          metadata: {},
        };
      }).filter((row) => row.name);
      const atomicResult = await admin.rpc("save_salon_style_with_materials", {
        p_salon_id: salonId,
        p_style_id: id,
        p_values: values,
        p_materials: materials,
      });
      if (atomicResult.error) throw atomicResult.error;
      const payload = atomicResult.data as { record?: Record<string, unknown>; materials?: Record<string, unknown>[] } | null;
      if (!payload?.record) throw new Error("The service could not be verified after saving.");
      return Response.json({ record: payload.record, materials: payload.materials || [], verified: true }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const result = id
      ? await admin.from(table).update(values).eq("id", id).eq("salon_id", salonId).select("*").maybeSingle()
      : await admin.from(table).insert({ ...values, salon_id: salonId }).select("*").single();
    if (result.error) throw result.error;
    if (!result.data) throw new Error(`The ${config.label} was not found in this salon.`);
    const readBack = await admin.from(table).select("*").eq("id", result.data.id).eq("salon_id", salonId).single();
    if (readBack.error || !readBack.data) throw readBack.error || new Error(`The ${config.label} could not be verified after saving.`);
    return Response.json({ record: readBack.data, verified: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/PLAN_PRODUCT_LIMIT_REACHED/.test(message)) {
      return Response.json({ error: "Your plan's product-listing limit has been reached. Archive a product or choose another plan." }, { status: 409 });
    }
    if (/PLAN_PROMOTION_LIMIT_REACHED/.test(message)) {
      return Response.json({ error: "Your plan's active-promotion limit has been reached. Pause an offer or choose another plan." }, { status: 409 });
    }
    if (/Your (Starter|Growth|Premium) plan allows/.test(message)) {
      return Response.json({ error: message }, { status: 409 });
    }
    if (isUserInputError(error)) return Response.json({ error: (error as Error).message }, { status: /Unauthorized/.test((error as Error).message) ? 401 : /Forbidden/.test((error as Error).message) ? 403 : 400 });
    const safeMessage = "We couldn't save this change.";
    const reference = await capturePlatformError({ request, admin, error, feature: "salon-dashboard", action: "save-record", actorRole: "salon", salonId, safeMessage });
    return safeFailure(safeMessage, reference);
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/records/save", "POST"), POSTHandler);
