import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/gcAssistantCore";
import { isPromotionActive, type SalonPromotion } from "@/lib/salonPromotions";
type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;
type Catalog = { rows: Row[]; complete: boolean };
const permissions = ["promotions", "styles", "products"] as const;
const restrictionKeys = ["minimum_subtotal", "new_customers_only", "usage_limit", "per_customer_limit", "terms"];
const clean = (value: unknown, max = 200) => typeof value === "string" ? value.slice(0, max) : null;
// Match salonPromotions.targetMatches without broadening the source catalog.
const normalized = (value: unknown) => String(value || "").trim().toLowerCase();
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const unavailable = () => new AssistantError("ASSISTANT_SERVICE_UNAVAILABLE", 503);

/** Current offer facts only. No customer eligibility or monetary quote is
 * inferred from a record's active flag, catalog base price or unseen history. */
export async function readAssistantPromotions(context: Context) {
 const { admin, salon, user } = context;
 async function grants() {
  const result = await Promise.all(permissions.map(async permission => {
   const read = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: user.id, p_permission: permission });
   if (read.error) throw unavailable();
   return read.data === true;
  }));
  if (!result[0]) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  return result;
 }
 const before = await grants();
 const asOf = new Date();
 const selected = await admin.from("salon_promotions").select("id,salon_id,title,description,public_headline,promotion_type,discount_value,status,target_scope,target_ids,restrictions,starts_at,ends_at,is_active,archived_at", { count: "exact" }).eq("salon_id", salon.id).is("archived_at", null).order("created_at", { ascending: false }).order("id").limit(100);
 function records(read: { data: unknown; count: number | null; error: unknown }, cap: number): Catalog {
  if (read.error || !Array.isArray(read.data) || !Number.isSafeInteger(read.count) || read.count! < read.data.length || read.data.length > cap) throw unavailable();
  const rows = read.data as Row[];
  if (rows.some(row => row.salon_id !== salon.id || typeof row.id !== "string" || !row.id) || new Set(rows.map(row => row.id)).size !== rows.length) throw unavailable();
  return { rows, complete: rows.length === read.count };
 }
 const inventory = records(selected, 100);
 const needsStyles = inventory.rows.some(row => ["services", "service_groups", "master_styles", "addons"].includes(String(row.target_scope)));
 const needsProducts = inventory.rows.some(row => row.target_scope === "products");
 let styles: Catalog | null = null, products: Catalog | null = null;
 if (needsStyles && before[1]) styles = records(await admin.from("styles").select("id,salon_id,name,category,service_group_id,master_style_id,addons", { count: "exact" }).eq("salon_id", salon.id).is("archived_at", null).order("name").order("id").limit(1000), 1000);
 if (needsProducts && before[2]) products = records(await admin.from("salon_products").select("id,salon_id,name", { count: "exact" }).eq("salon_id", salon.id).is("archived_at", null).order("name").order("id").limit(1000), 1000);
 const after = await grants();
 if (before.some((allowed, index) => allowed && !after[index])) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
 const promotions = inventory.rows.map(row => {
  const scope = String(row.target_scope || "salon");
  const savedTargets = row.target_ids ?? [];
  if (!Array.isArray(savedTargets) || savedTargets.length > 100 || savedTargets.some(id => typeof id !== "string" || id.length > 120)) throw unavailable();
  const ids = [...new Set((savedTargets as string[]).map(normalized).filter(Boolean))];
  const catalog = scope === "products" ? products : styles;
  const knownScope = ["salon", "services", "service_groups", "master_styles", "addons", "products"].includes(scope);
  const allowed = scope === "salon" || (scope === "products" ? before[2] : knownScope && before[1]);
  const matches = new Map<string, string>();
  if (allowed && scope !== "salon" && catalog) for (const record of catalog.rows) {
   if (scope === "addons") {
    for (const value of Array.isArray(record.addons) ? record.addons : []) {
     const addon = object(value);
     // Match the exact saved values/labels accepted by canonical targeting.
     for (const value of [addon.value, addon.label]) {
      const key = normalized(value);
      if (typeof value === "string" && ids.includes(key) && !matches.has(key)) matches.set(key, clean(addon.label || addon.value) || value);
     }
    }
   } else {
    const key = normalized(record[scope === "service_groups" ? "service_group_id" : scope === "master_styles" ? "master_style_id" : "id"]);
    const name = clean(record[scope === "service_groups" ? "category" : "name"]);
    if (ids.includes(key) && name && !matches.has(key)) matches.set(key, name);
   }
  }
  const resolved = ids.filter(id => matches.has(id)).map(id => ({ id, name: matches.get(id)! }));
  const completeCatalog = scope === "salon" || catalog?.complete === true || resolved.length === ids.length;
  const unresolved = allowed && knownScope && completeCatalog ? ids.length - resolved.length : null;
  const restrictions = object(row.restrictions);
  for (const key of restrictionKeys) if (Object.hasOwn(restrictions, key)) {
   const value = restrictions[key];
   if (key === "terms" ? typeof value !== "string" : key === "new_customers_only" ? typeof value !== "boolean" : typeof value !== "number" || !Number.isFinite(value) || value < 0) throw unavailable();
  }
  return {
   id: row.id, title: clean(row.title), public_headline: clean(row.public_headline), description: clean(row.description, 1000), promotion_type: clean(row.promotion_type, 40), discount_value: row.discount_value,
   status: clean(row.status, 40), is_active: row.is_active === true, active_now: isPromotionActive(row as SalonPromotion, asOf), starts_at: row.starts_at, ends_at: row.ends_at,
   target_scope: scope, target_count: ids.length, targets: allowed && knownScope ? resolved.slice(0, 12) : null, shown_target_count: allowed && knownScope ? Math.min(resolved.length, 12) : null,
   targets_are_excerpt: allowed && knownScope ? resolved.length > 12 : null, unresolved_target_count: unresolved,
   target_resolution: !knownScope ? "unsupported_scope" : !allowed ? "not_authorized" : !completeCatalog ? "incomplete_catalog" : unresolved ? "unresolved" : "complete",
   restrictions: Object.fromEntries(restrictionKeys.filter(key => Object.hasOwn(restrictions, key)).map(key => [key, key === "terms" ? clean(restrictions[key], 500) : restrictions[key]])),
   terms_are_excerpt: typeof restrictions.terms === "string" && restrictions.terms.length > 500,
   additional_restrictions_present: Object.keys(restrictions).some(key => !restrictionKeys.includes(key)),
   href: "/salon/dashboard/promotions/" + encodeURIComponent(String(row.id)),
  };
 });
 return { promotions, total: selected.count, shown_count: promotions.length, is_excerpt: !inventory.complete, capped_at: 100, as_of: asOf.toISOString(), time_zone: salon.time_zone,
  monetary_quote_available: false,
  definition: "Current saved offers of this authenticated business only; archived records excluded. Active now means the record flag/status/date window, not customer or checkout eligibility. Target names use permitted own catalogs; unresolved, denied and incomplete targets are not absent records. Group/style names derive from own services. Business-wide scope covers eligible services, not products or subscriptions. Saved restrictions do not prove customer/use-limit eligibility. Terms may be excerpts: never infer that an omitted condition does not exist. No selection, customer history, deposit, savings or balance was calculated. Use canonical checkout context or immutable booking terms for monetary questions." };
}
