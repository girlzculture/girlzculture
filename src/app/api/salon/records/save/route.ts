import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { requireSalonPermission } from "@/lib/supabaseAdmin";

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
    fields: new Set(["name", "description", "price", "photo_url", "is_visible", "in_person_only", "archived_at"]),
  },
  salon_promotions: {
    permission: "promotions",
    label: "promotion",
    fields: new Set(["title", "description", "discount_label", "starts_at", "ends_at", "is_active", "archived_at"]),
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
  } else if (table === "salon_promotions") {
    patch.title = cleanText(patch.title, 160);
    patch.description = cleanText(patch.description, 1_000);
    patch.discount_label = cleanText(patch.discount_label, 80);
    if (!patch.title) throw new Error("Enter a promotion title.");
  } else if (table === "bookings") {
    if (patch.status !== "In Progress") throw new Error("Choose a supported booking action.");
    patch.service_started_at = new Date(String(patch.service_started_at || "")).toISOString();
  }
  return patch;
}

function isUserInputError(error: unknown) {
  return error instanceof Error && !/permission denied|violates|constraint|record\s+"|column|relation|postgres|supabase|pgrst/i.test(error.message);
}

export async function POST(request: Request) {
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

    const result = id
      ? await admin.from(table).update(values).eq("id", id).eq("salon_id", salonId).select("*").maybeSingle()
      : await admin.from(table).insert({ ...values, salon_id: salonId }).select("*").single();
    if (result.error) throw result.error;
    if (!result.data) throw new Error(`The ${config.label} was not found in this salon.`);

    if (table === "styles" && Array.isArray(rawValues.style_materials)) {
      const materials = rawValues.style_materials.slice(0, 30).map((item) => {
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          name: cleanText(row.name, 120),
          price: finiteNumber(row.price ?? 0, "Material price", 0, 100_000),
          longevity_weeks: finiteNumber(row.longevity_weeks ?? 4, "Material longevity", 1, 52),
          quality_grade: cleanText(row.quality_grade, 50) || "Good",
          option_type: "material",
          metadata: {},
        };
      }).filter((row) => row.name);
      const materialResult = await admin.rpc("replace_style_materials", { p_style_id: result.data.id, p_materials: materials });
      if (materialResult.error) throw materialResult.error;
    }

    return Response.json({ record: result.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (isUserInputError(error)) return Response.json({ error: (error as Error).message }, { status: /Unauthorized/.test((error as Error).message) ? 401 : /Forbidden/.test((error as Error).message) ? 403 : 400 });
    const safeMessage = "We couldn't save this change.";
    const reference = await capturePlatformError({ request, admin, error, feature: "salon-dashboard", action: "save-record", actorRole: "salon", salonId, safeMessage });
    return safeFailure(safeMessage, reference);
  }
}
