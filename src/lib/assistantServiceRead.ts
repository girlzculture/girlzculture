import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/gcAssistantCore";
import { matchBusinessCatalog } from "@/lib/businessCatalogSearch";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;
const unavailable = () => new AssistantError("ASSISTANT_SERVICE_UNAVAILABLE", 503);
const rowObject = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const text = (value: unknown, cap = 200) => typeof value === "string" ? value.slice(0, cap) : null;
const amount = (value: unknown) => (typeof value === "number" || typeof value === "string" && value.trim() !== "") && Number.isFinite(Number(value)) ? Number(value) : null;
const identity = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 120;
const fields = "id,salon_id,name,description,category,category_id,service_group_id,master_style_id,base_price,price_display_min,price_display_max,duration_min_hours,duration_max_hours,buffer_minutes,size_options,length_options,addons,included_items,option_groups,is_draft";
const materialFields = "id,style_id,name,price,is_bring_your_own,longevity,quality_note,longevity_weeks,quality_grade,option_type";

function choices(raw: unknown) {
  // Checkout accepts arrays of objects and defaults absent adjustments to zero.
  // Legacy object/string forms may render in older editors, but do not establish
  // complete checkout evidence. Never manufacture a price for those forms.
  const validArray = raw === null || raw === undefined || Array.isArray(raw);
  const source = Array.isArray(raw) ? raw : [];
  let complete = validArray && source.length <= 30;
  let unsupported = !validArray;
  const rows = source.slice(0, 30).flatMap(value => {
    const row = rowObject(value);
    const price = row ? amount(row.price_add ?? 0) : null;
    const duration = row ? amount(row.duration_add_minutes ?? 0) : null;
    if (!row || !identity(row.value || row.label) || !identity(row.label || row.value) || price === null || duration === null) { complete = false; unsupported = true; return []; }
    return [{ value: String(row.value || row.label), label: String(row.label || row.value), price_add: price, duration_add_minutes: duration }];
  });
  if (new Set(rows.map(row => row.value)).size !== rows.length) { complete = false; unsupported = true; }
  return { rows, total: validArray ? source.length : null, complete, evidence: unsupported ? "unsupported" : source.length > 30 ? "excerpt" : "complete" };
}

function groups(raw: unknown) {
  const validArray = raw === null || raw === undefined || Array.isArray(raw);
  const source = Array.isArray(raw) ? raw : [];
  let complete = validArray && source.length <= 30;
  let unsupported = !validArray;
  const required: string[] = [];
  const rows = source.slice(0, 30).flatMap(value => {
    const row = rowObject(value);
    if (!row || !identity(row.id) || !identity(row.label) || ![undefined, null, "single", "multiple"].includes(row.selection as string | null | undefined) || ![undefined, null, true, false].includes(row.required as boolean | null | undefined)) { complete = false; unsupported = true; return []; }
    const options = choices(row.options);
    if (!options.complete || !options.rows.length) complete = false;
    if (options.evidence === "unsupported" || !options.rows.length) unsupported = true;
    if (row.required === true) required.push(row.id);
    return [{ id: row.id, label: String(row.label), selection: row.selection === "multiple" ? "multiple" : "single", required: row.required === true, options: options.rows, option_count: options.total, options_are_excerpt: !options.complete }];
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) { complete = false; unsupported = true; }
  return { rows, required, total: validArray ? source.length : null, complete, evidence: unsupported ? "unsupported" : !complete ? "excerpt" : "complete" };
}

/** Saved own-business catalog facts, never a subtotal/deposit/payment quote.
 * Materials are authorized through their own style parent, not product stock. */
export async function readAssistantServices(context: Context, args: Row) {
  const { admin, salon, user } = context;
  async function grant() {
    const result = await admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: user.id, p_permission: "styles" });
    if (result.error) throw unavailable();
    if (result.data !== true) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  }
  await grant();
  if (typeof args.query !== "string" || args.query.length > 120) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const escaped = query.replace(/[\\%_]/g, character => `\\${character}`);
  const scoped = () => admin.from("styles").select(fields, { count: "exact" }).eq("salon_id", salon.id).is("archived_at", null);
  const [inventory, literal] = await Promise.all([
    scoped().order("name").order("id").limit(1000),
    query ? scoped().ilike("name", `%${escaped}%`).order("name").order("id").limit(100) : Promise.resolve({ data: [], count: 0, error: null }),
  ]);
  function ownRows(read: { data: unknown; error: unknown; count: number | null }, cap: number) {
    if (read.error || !Array.isArray(read.data) || !Number.isSafeInteger(read.count) || read.count! < read.data.length || read.data.length > cap) throw unavailable();
    const rows = read.data as Row[];
    if (rows.some(row => !rowObject(row) || row.salon_id !== salon.id || !identity(row.id)) || new Set(rows.map(row => row.id)).size !== rows.length) throw unavailable();
    return rows;
  }
  const catalog = ownRows(inventory, 1000), direct = ownRows(literal, 100);
  const records = new Map<string, Row>();
  for (const row of [...catalog, ...direct]) records.set(String(row.id), row);
  const matches = matchBusinessCatalog([...records.values()], query);
  const selected = matches.slice(0, 100).map(match => match.record);
  const ids = selected.map(row => String(row.id));
  const materials = ids.length ? await admin.from("style_materials").select(materialFields, { count: "exact" }).in("style_id", ids).order("id").limit(3001) : { data: [], count: 0, error: null };
  if (materials.error || !Array.isArray(materials.data) || !Number.isSafeInteger(materials.count) || materials.count! < materials.data.length || materials.data.length > 3001) throw unavailable();
  const materialRows = materials.data as Row[];
  if (materialRows.some(row => !rowObject(row) || !identity(row.id) || !ids.includes(String(row.style_id))) || new Set(materialRows.map(row => row.id)).size !== materialRows.length) throw unavailable();
  if (ids.length) {
    // A moved/archived parent must not carry earlier material facts to the model.
    const current = ownRows(await admin.from("styles").select("id,salon_id", { count: "exact" }).eq("salon_id", salon.id).is("archived_at", null).in("id", ids).limit(100), 100);
    if (current.length !== ids.length || current.some(row => !ids.includes(String(row.id)))) throw unavailable();
  }
  await grant();
  const services = selected.map(row => {
    const sizes = choices(row.size_options), lengths = choices(row.length_options), addons = choices(row.addons), options = groups(row.option_groups);
    const sourceMaterials = materialRows.filter(material => material.style_id === row.id);
    let materialsComplete = materials.count === materialRows.length && sourceMaterials.length <= 30;
    let materialsUnsupported = false;
    const materialChoices = sourceMaterials.slice(0, 30).flatMap(material => {
      const price = amount(material.price);
      if (!identity(material.name) || price === null || price < 0 || typeof material.is_bring_your_own !== "boolean") { materialsComplete = false; materialsUnsupported = true; return []; }
      return [{ id: material.id, name: material.name, price, is_bring_your_own: material.is_bring_your_own,
        longevity: text(material.longevity), quality_note: text(material.quality_note), longevity_weeks: amount(material.longevity_weeks), quality_grade: text(material.quality_grade), option_type: text(material.option_type, 40) }];
    });
    const included = Array.isArray(row.included_items) ? row.included_items : [];
    const includedComplete = (row.included_items == null || Array.isArray(row.included_items)) && included.length <= 30 && included.every(value => typeof value === "string" && value.length <= 200);
    const base = amount(row.base_price), min = amount(row.price_display_min), max = amount(row.price_display_max);
    const complete = sizes.complete && lengths.complete && addons.complete && options.complete && materialsComplete && includedComplete && (base !== null && base >= 0 || min !== null && min >= 0) && (max === null || max >= 0 && (min === null || max >= min));
    return {
      id: row.id, name: text(row.name), description: text(row.description, 1000), category: text(row.category), category_id: row.category_id ?? null, service_group_id: row.service_group_id ?? null, master_style_id: row.master_style_id ?? null,
      base_price: base, price_display_min: min, price_display_max: max, duration_min_hours: amount(row.duration_min_hours), duration_max_hours: amount(row.duration_max_hours), buffer_minutes: amount(row.buffer_minutes), is_draft: row.is_draft === true,
      size_options: sizes.rows, length_options: lengths.rows, addons: addons.rows, option_groups: options.rows, included_items: included.slice(0, 30).filter(value => typeof value === "string").map(value => String(value).slice(0, 200)), materials: materialChoices,
      choice_counts: { sizes: sizes.total, lengths: lengths.total, addons: addons.total, option_groups: options.total, materials: materials.count === materialRows.length ? sourceMaterials.length : null, included_items: Array.isArray(row.included_items) || row.included_items == null ? included.length : null },
      choice_evidence: { sizes: sizes.evidence, lengths: lengths.evidence, addons: addons.evidence, option_groups: options.evidence, materials: materialsUnsupported ? "unsupported" : materialsComplete ? "complete" : "excerpt", included_items: includedComplete ? "complete" : included.length > 30 ? "excerpt" : "unsupported" },
      details_complete: complete, choices_are_excerpt: !sizes.complete || !lengths.complete || !addons.complete || !options.complete || !materialsComplete || !includedComplete,
      text_may_be_excerpted: [row.name, row.description, row.category, ...sourceMaterials.flatMap(material => [material.longevity, material.quality_note, material.quality_grade])].some(value => typeof value === "string" && value.length > (value === row.description ? 1000 : 200)),
      price_completeness: !complete ? "incomplete" : options.required.length ? "selection_required" : "catalog_only",
      required_option_group_ids: options.required, monetary_quote_available: false,
    };
  });
  const complete = inventory.count === catalog.length;
  const exact = matches.some(match => match.exact);
  return { services, total: inventory.count, inventory_total: inventory.count, matching_total: query ? matches.length : inventory.count,
    query, search_complete: complete, exact_match: exact, match_status: inventory.count === 0 ? "empty_inventory" : !query ? "inventory" : exact ? "exact" : matches.length ? "related" : complete ? "no_match" : "incomplete_search", capped_at: 100, currency: "USD",
    monetary_quote_available: false,
    definition: "Current saved services of this authenticated business only. Original names and recorded prices are catalog facts, not final subtotals, deposits, tax or balances. Required generic choices must be selected at checkout; size, length, add-ons and optional assigned materials may adjust price/duration. Missing, malformed or excerpted choices do not prove that no choices exist. Display bounds are owner-recorded, not a calculated attainable range. Category is the saved legacy group label; category_id and service_group_id are distinct saved identities, not inferred category names. Included items do not prove any unlisted material is included. No product stock/cost, customer eligibility or promotion calculation was read. Use canonical checkout selections or immutable booking terms for final money questions." };
}

/** Flatten generic option values before the model's shared depth bound. The
 * source read retains the nested catalog shape for deterministic presentation. */
export function assistantServiceFacts(value: unknown, inventoryOnly = false): unknown {
  const result = rowObject(value);
  if (!result || !Array.isArray(result.services)) return value;
  const limit = inventoryOnly ? 4 : 12;
  const services = result.services.slice(0, limit).map(rowObject).filter((row): row is Row => !!row);
  const options = services.flatMap(service => (Array.isArray(service.option_groups) ? service.option_groups : []).flatMap(value => {
    const group = rowObject(value);
    return group && Array.isArray(group.options) ? group.options.map(value => ({ service_id: service.id, group_id: group.id, group_label: group.label, required: group.required, selection: group.selection, ...rowObject(value) })) : [];
  }));
  return { ...result, is_excerpt: result.services.length > limit || Number(result.total) > result.services.length, shown_count: services.length,
    services: services.map(service => {
      if (inventoryOnly) return { id: service.id, name: service.name, base_price: service.base_price, price_display_min: service.price_display_min, price_display_max: service.price_display_max, duration_min_hours: service.duration_min_hours, duration_max_hours: service.duration_max_hours, price_completeness: service.price_completeness, monetary_quote_available: false };
      const groups = Array.isArray(service.option_groups) ? service.option_groups.map(value => {
        const group = rowObject(value) || {};
        return { id: group.id, label: group.label, required: group.required, selection: group.selection, option_count: group.option_count, options_are_excerpt: group.options_are_excerpt };
      }) : [];
      const nestedExcerpt = [service.size_options, service.length_options, service.addons, service.materials, service.included_items, service.required_option_group_ids, groups].some(value => Array.isArray(value) && value.length > 12);
      return { ...service, option_groups: groups.slice(0, 12), choices_are_excerpt: service.choices_are_excerpt === true || nestedExcerpt };
    }),
    generic_option_choices: inventoryOnly ? [] : options.slice(0, 12), generic_option_choice_count: inventoryOnly ? null : options.length,
    generic_options_are_excerpt: inventoryOnly || options.length > 12 || services.some(service => service.choices_are_excerpt === true),
  };
}
