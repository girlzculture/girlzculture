import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { validateSalonRecordEntitlements } from "@/lib/salonRecordEntitlements";
import { moderatePublicContent } from "@/lib/contentModerationServer";

import { SALON_RECORD_CONFIG as CONFIG, sanitizeSalonRecord as sanitize, finiteNumber } from "@/lib/salonRecordValidation";

function isUserInputError(error: unknown) {
  return error instanceof Error && !/permission denied|violates|constraint|record\s+"|column|relation|postgres|supabase|pgrst/i.test(error.message);
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
    const id = cleanText(body.id, 60) || null;
    const rawValues = body.values && typeof body.values === "object" && !Array.isArray(body.values) ? body.values as Record<string, unknown> : {};
    const values = sanitize(table, rawValues, !id);
    if (table === "stylists" && "assigned_service_ids" in values) {
      // Authorization is repeated on the server; hiding the controls is insufficient.
      const servicesContext = await requireSalonPermission(request, "styles");
      if (servicesContext.salon.id !== salonId) throw new Error("Forbidden");
      if (Array.isArray(values.assigned_service_ids) && values.assigned_service_ids.length) {
        const services = await admin.from("styles").select("id").eq("salon_id", salonId).in("id", values.assigned_service_ids);
        if (services.error) throw services.error;
        if (services.data?.length !== values.assigned_service_ids.length) throw new Error("Choose valid services from this business.");
      }
    }
    if (table === "salon_products" || table === "salon_promotions") {
      await validateSalonRecordEntitlements({
        admin,
        salonId: context.salon.id,
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
