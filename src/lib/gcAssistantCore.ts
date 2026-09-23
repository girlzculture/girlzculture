import {ASSISTANT_TEAM_CHANGES} from '@/lib/assistantTeam';
import {ASSISTANT_CONTROLS,type AssistantControl} from "@/lib/assistantControls";
import {ASSISTANT_CATALOG,isCatalogTool} from "@/lib/assistantCatalog";
import {ASSISTANT_OPERATIONS,operationTool,type AssistantOperation} from "@/lib/assistantOperations";
import { validateBusinessPolicy } from "@/lib/businessPolicyCore";
import { LENGTH_OPTIONS } from "@/lib/salonPresets";

export type ToolSchema = { type: string | string[]; properties?: Record<string, ToolSchema>; required?: string[]; additionalProperties?: false; enum?: readonly unknown[]; maxLength?: number; minLength?: number; minimum?: number; maximum?: number; pattern?: string; items?: ToolSchema; maxItems?: number };
const string = (maxLength = 200): ToolSchema => ({ type: "string", maxLength });
const uuid: ToolSchema = { ...string(36), pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$" };
const nullableId: ToolSchema = { ...uuid, type: ["string", "null"] };
const number = (minimum: number, maximum: number): ToolSchema => ({ type: "number", minimum, maximum });
const enumeration = (...values: string[]): ToolSchema => ({ type: "string", enum: values });
const object = (properties: Record<string, ToolSchema>): ToolSchema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const range = { start: { ...string(30), pattern: "^\\d{4}-\\d{2}-\\d{2}T" }, end: { ...string(30), pattern: "^\\d{4}-\\d{2}-\\d{2}T" } };
const clockTime: ToolSchema = { ...string(5), pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" };
const hours = object(Object.fromEntries(
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    .map(day => [day, object({ closed: { type: "boolean" }, open: { ...clockTime, pattern: "^([01][0-9]|2[0-3]):(00|15|30|45)$" }, close: { ...clockTime, pattern: "^([01][0-9]|2[0-3]):(00|15|30|45)$" } })]),
));
const policy = object({ business_policy_text: { type: ["string", "null"], maxLength: 12000 }, refund_satisfaction: enumeration("contact_business", "case_by_case", "redo_or_refund"), refund_terms: string(1200), cancellation_hours: { type: "integer", minimum: 0, maximum: 168 }, rescheduling_hours: { type: "integer", minimum: 0, maximum: 168 }, grace_minutes: { type: "integer", minimum: 0, maximum: 60 }, no_show: enumeration("contact_business", "reschedule_request"), late_arrival: enumeration("contact_business", "reschedule_request"), deposit_treatment: enumeration("platform_rules"), balance_due: enumeration("after_service"), satisfaction: enumeration("contact_business"), guests: enumeration("welcome", "ask_first", "appointment_only"), children: enumeration("welcome", "ask_first", "appointment_only"), walk_ins: enumeration("welcome", "ask_first", "appointment_only"), preparation: string(1200), notes: string(1200) });
const date = { ...string(10), pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const manualAppointment = {
  guest_name: { ...string(120), minLength: 1 }, guest_phone: string(40), guest_email: string(254),
  style_id: nullableId, service_name: string(120), service_preference: enumeration("named", "any", "custom"), duration_minutes: { type: ["integer", "null"], minimum: 15, maximum: 1440 } as ToolSchema,
  stylist_id: nullableId, stylist_preference: enumeration("named", "any", "unspecified"), date, time: clockTime, source: enumeration("phone", "walk_in", "instagram", "whatsapp", "other"), notes: string(1200),
};
export const ASSISTANT_TOOLS = {
  get_team_controls:{risk:1,permission:"settings",schema:object({})},
  prepare_team_controls:{risk:4,permission:"settings",schema:object({operation:enumeration("permissions","arrangement"),record_id:uuid,changes_json:{...string(6000),minLength:2}})},
  get_business_controls:{risk:1,permission:"settings",schema:object({section:enumeration(...Object.keys(ASSISTANT_CONTROLS))})},
  prepare_business_controls:{risk:4,permission:"settings",schema:object({section:enumeration(...Object.keys(ASSISTANT_CONTROLS)),changes_json:{...string(6000),minLength:2}})},
  prepare_service_change: {risk:4,permission:ASSISTANT_CATALOG.prepare_service_change.permission,schema:object({record_id:nullableId,changes_json:{...string(6000),minLength:2}})},
  prepare_professional_change: {risk:4,permission:ASSISTANT_CATALOG.prepare_professional_change.permission,schema:object({record_id:nullableId,changes_json:{...string(6000),minLength:2}})},
  prepare_product_change: {risk:4,permission:ASSISTANT_CATALOG.prepare_product_change.permission,schema:object({record_id:nullableId,changes_json:{...string(6000),minLength:2}})},
  prepare_promotion_change: {risk:4,permission:ASSISTANT_CATALOG.prepare_promotion_change.permission,schema:object({record_id:nullableId,changes_json:{...string(6000),minLength:2}})},
  get_business_stock: {risk:1,permission:"products",schema:object({query:string(120)})},
  prepare_booking_progress: {risk:4,permission:"bookings",schema:object({operation:enumeration("booking_service","booking_attendance"),record_id:uuid,changes_json:{...string(6000),minLength:2}})},
  prepare_stock_change: {risk:4,permission:"products",schema:object({operation:enumeration(...Object.keys(ASSISTANT_OPERATIONS).filter(name=>operationTool(name)==="prepare_stock_change")),record_id:nullableId,changes_json:{...string(6000),minLength:2}})},
  prepare_photo_change: {risk:4,permission:"photos",schema:object({operation:enumeration(...Object.keys(ASSISTANT_OPERATIONS).filter(name=>operationTool(name)==="prepare_photo_change")),record_id:nullableId,changes_json:{...string(6000),minLength:2}})},
  prepare_client_card_change: {risk:4,permission:"client_history",schema:object({operation:enumeration(...Object.keys(ASSISTANT_OPERATIONS).filter(name=>operationTool(name)==="prepare_client_card_change")),record_id:nullableId,changes_json:{...string(6000),minLength:2}})},
  prepare_review_reply: {risk:4,permission:"reviews",schema:object({operation:enumeration(...Object.keys(ASSISTANT_OPERATIONS).filter(name=>operationTool(name)==="prepare_review_reply")),record_id:nullableId,changes_json:{...string(6000),minLength:2}})},
  get_business_summary: { risk: 1, permission: "overview", schema: object(range) },
  get_bookings: { risk: 1, permission: "bookings", schema: object(range) },
  get_availability: { risk: 1, permission: "availability", schema: object({ style_id: nullableId, stylist_id: nullableId, date: { ...string(10), pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, days: { type: "integer", minimum: 1, maximum: 7 }, selected_options: { type: "array", maxItems: 12, items: object({ group_id: { ...string(40), minLength: 1 }, values: { type: "array", items: { ...string(80), minLength: 1 }, maxItems: 12 } }) } }) },
  get_business_profile: { risk: 1, permission: "my_page", schema: object({}) },
  get_business_settings: { risk: 1, permission: "settings", schema: object({}) },
  get_business_media: { risk: 1, permission: "photos", schema: object({}) },
  calculate_service_selection: { risk: 1, permission: "styles", schema: object({ service_id: uuid, selected_size: { type: ["string", "null"], maxLength: 80 }, selected_length: { type: ["string", "null"], maxLength: 80 }, selected_addons: { type: "array", items: { ...string(80), minLength: 1 }, maxItems: 20 }, selected_options: { type: "array", maxItems: 30, items: object({ group_id: { ...string(40), minLength: 1 }, values: { type: "array", items: { ...string(80), minLength: 1 }, maxItems: 30 } }) }, selected_material_id: nullableId, promotion_id: nullableId }) },
  get_booking_price_details: { risk: 1, permission: "bookings", schema: object({ booking_id: uuid }) },
  get_services_and_prices: { risk: 1, permission: "styles", schema: object({ query: string(120) }) },
  get_business_policies: { risk: 1, permission: "my_page", schema: object({}) },
  search_platform_knowledge: { risk: 1, permission: "overview", schema: object({ query: { ...string(240), minLength: 2 } }) },
  get_customers: { risk: 1, permission: "bookings", schema: object(range) },
  get_client_record: { risk: 1, permission: "client_history", schema: object({ booking_id: uuid }) },
  get_professionals: { risk: 1, permission: "stylists", schema: object({ query: string(120) }) },
  get_products: { risk: 1, permission: "products", schema: object({ query: string(120) }) },
  get_booking_messages: { risk: 1, permission: "bookings", schema: object({ booking_id: uuid }) },
  get_reviews: { risk: 1, permission: "reviews", schema: object(range) },
  get_promotions: { risk: 1, permission: "promotions", schema: object({}) },
  get_plan_status: { risk: 1, permission: "overview", schema: object({}) },
  get_profile_completion: { risk: 1, permission: "overview", schema: object({}) },
  get_finance_records: {risk:1,permission:"finance_manage",schema:object(range)},
  prepare_finance_record: {risk:4,permission:"finance_manage",schema:object({action:enumeration("expense","receipt","refund"),record_id:nullableId,record_kind:{type:["string","null"],enum:["sale","booking","order","receipt",null]},amount_cents:{type:"integer",minimum:1,maximum:100000000},date,time:clockTime,method:{type:["string","null"],enum:["cash","card","transfer","other",null]},category:{type:["string","null"],minLength:1,maxLength:80},treatment:{type:["string","null"],enum:["operating","inventory_asset",null]},note:{...string(1200),minLength:1},money_already_moved:{type:"boolean",enum:[true]}})},
  get_manual_sale_options: { risk: 1, permission: "finance_log", schema: object({}) },
  prepare_manual_service_sale: { risk: 4, permission: "finance_log", schema: object({ service_id: uuid, stylist_id: uuid, amount_cents: { type: "integer", minimum: 1, maximum: 100000000 }, method: enumeration("cash", "card", "transfer", "other"), source: enumeration("walk_in", "phone", "social", "other"), date, time: clockTime, client_name: { type: ["string", "null"], maxLength: 120 }, payment_received: { type: "boolean", enum: [true] } }) },
  get_outstanding_balances: { risk: 1, permission: "earnings", schema: object(range) },
  get_earnings_summary: { risk: 1, permission: "earnings", schema: object(range) },
  get_upcoming_appointments: { risk: 1, permission: "bookings", schema: object(range) },
  get_calendar_gaps: { risk: 1, permission: "availability", schema: object({ date, stylist_id: nullableId }) },
  prepare_manual_appointment: { risk: 3, permission: "bookings", schema: object(manualAppointment) },
  prepare_manual_reschedule: { risk: 3, permission: "bookings", schema: object({ booking_id: uuid, date, time: clockTime, stylist_id: nullableId }) },
  prepare_booking_reschedule_proposal: { risk: 4, permission: "bookings", schema: object({ booking_id: uuid, date, time: clockTime, reason: { ...string(300), minLength: 1 }, message: string(600) }) },
  prepare_manual_cancellation: { risk: 3, permission: "bookings", schema: object({ booking_id: uuid, reason: { ...string(300), minLength: 1 } }) },
  prepare_business_hours: { risk: 3, permission: "availability", schema: object({ hours }) },
  prepare_service_edit: { risk: 3, permission: "styles", schema: object({ style_id: uuid, name: { ...string(120), minLength: 1 }, price: number(0, 100000), duration_hours: number(0.25, 24), buffer_minutes: { type: "integer", minimum: 0, maximum: 180 } }) },
  prepare_professional_archive: { risk: 4, permission: "stylists", schema: object({ stylist_id: uuid }) },
  prepare_professional_draft: { risk: 3, permission: "stylists", schema: object({ id: nullableId, name: { ...string(120), minLength: 1 }, bio: string(500), specialties: { type: "array", items: string(80), maxItems: 20 }, years_experience: { type: ["number", "null"], minimum: 0, maximum: 70 } }) },
  prepare_product_draft: { risk: 3, permission: "products", schema: object({ id: nullableId, name: { ...string(120), minLength: 1 }, description: string(1000), price: number(0, 100000) }) },
  prepare_promotion_draft: { risk: 3, permission: "promotions", schema: object({ id: nullableId, title: { ...string(160), minLength: 1 }, description: string(1000), promotion_type: enumeration("percentage", "fixed", "descriptive"), discount_value: number(0, 100000), ...range, time_zone: string(80) }) },
  prepare_booking_note: { risk: 3, permission: "bookings", schema: object({ booking_id: uuid, note: { ...string(1200), minLength: 1 } }) },
  prepare_business_profile_update: { risk: 4, permission: "my_page", schema: object({ field: enumeration("description", "hours", "tiktok_url", "instagram_url"), text: { type: ["string", "null"], maxLength: 1200 }, hours: { ...hours, type: ["object", "null"] } }) },
  prepare_availability_block: { risk: 3, permission: "availability", schema: object({ ...range, time_zone: string(80), stylist_id: nullableId, reason: string(180) }) },
  prepare_service: { risk: 3, permission: "styles", schema: object({ master_style_id: uuid, name: { ...string(120), minLength: 1 }, price: number(0, 100000), duration_hours: number(0.25, 24), requested_deposit: { type: ["number", "null"], minimum: 0, maximum: 100000 }, length_addons: { type: "array", maxItems: 10, items: object({ name: string(80), price: number(0, 10000) }) } }) },
  prepare_customer_message: { risk: 4, permission: "bookings", schema: object({ booking_id: uuid, body: { ...string(2000), minLength: 1 } }) },
  prepare_business_policy_update: { risk: 4, permission: "my_page", schema: object({ policy }) },
} as const;
export type AssistantTool = keyof typeof ASSISTANT_TOOLS;
export class AssistantError extends Error { constructor(public code: string, public status = 400) { super(code); } }
export function serviceLengthOptions(input: { name: string; price: number }[]) {
  const seen = new Set<string>();
  return input.map(option => {
    const label = LENGTH_OPTIONS.find(candidate => candidate.toLowerCase() === option.name.trim().replace(/ length$/i, "").toLowerCase());
    if (!label) throw new AssistantError("ASSISTANT_CATALOG_CLARIFICATION_REQUIRED", 409);
    if (seen.has(label)) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    seen.add(label);
    return { value: label, label, price_add: option.price };
  });
}
function validCalendarDate(value: string) {
  const date = value.slice(0, 10);
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}
export function assertSchema(value: unknown, schema: ToolSchema, depth = 0): void {
  if (depth > 8) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (value === null && types.includes("null")) return;
  const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  if (!types.includes(actual) && !(types.includes("integer") && Number.isInteger(value))) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  if (schema.enum && !schema.enum.includes(value)) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  if (typeof value === "string" && (value.length > (schema.maxLength ?? 4000) || value.length < (schema.minLength ?? 0) || (schema.pattern && !new RegExp(schema.pattern).test(value)) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  if (typeof value === "number" && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  if (actual === "array") { if ((value as unknown[]).length > (schema.maxItems ?? 30)) throw new AssistantError("ASSISTANT_INVALID_INPUT"); for (const item of value as unknown[]) assertSchema(item, schema.items!, depth + 1); }
  if (actual === "object") {
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some(key => !Object.hasOwn(schema.properties || {}, key)) || schema.required?.some(key => !Object.hasOwn(row, key))) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    for (const [key, item] of Object.entries(row)) assertSchema(item, schema.properties![key], depth + 1);
  }
}
export function validateTool(name: unknown, input: unknown) {
  if (typeof name !== "string" || !Object.hasOwn(ASSISTANT_TOOLS, name)) throw new AssistantError("ASSISTANT_UNKNOWN_TOOL");
  const tool = name as AssistantTool;
  const schema: ToolSchema = ASSISTANT_TOOLS[tool].schema;
  const candidate = tool === "prepare_manual_appointment" && input && typeof input === "object" && !Array.isArray(input)
    ? { service_preference: "named", stylist_preference: "unspecified", ...input as Record<string, unknown> }
    : tool === "prepare_business_policy_update" && input && typeof input === "object" && "policy" in input && input.policy && typeof input.policy === "object"
    ? { ...input, policy: {
      ...(!Object.hasOwn(input.policy, "refund_satisfaction") && !Object.hasOwn(input.policy, "refund_terms") ? { refund_satisfaction: "contact_business", refund_terms: "" } : {}),
      business_policy_text: null,
      ...input.policy,
    } } : tool === "get_availability" && input && typeof input === "object" && !Array.isArray(input) ? { days: 1, selected_options: [], ...input } : input;
  assertSchema(candidate, schema);
  const args = candidate as Record<string, unknown>;
  if(isCatalogTool(tool)){
    let changes:unknown;try{changes=JSON.parse(String((candidate as Record<string,unknown>).changes_json));}catch{throw new AssistantError("ASSISTANT_INVALID_INPUT");}
    assertSchema(changes,ASSISTANT_CATALOG[tool].schema);
    if(!changes||Object.keys(changes).length===0)throw new AssistantError("ASSISTANT_INVALID_INPUT");
  }
  if (["prepare_booking_progress","prepare_stock_change","prepare_photo_change","prepare_client_card_change","prepare_review_reply"].includes(tool)) {
    let changes:unknown;try{changes=JSON.parse(String(args.changes_json));}catch{throw new AssistantError("ASSISTANT_INVALID_INPUT");}
    assertSchema(changes,ASSISTANT_OPERATIONS[args.operation as AssistantOperation].schema);
    if(args.operation==="booking_service"&&(changes as {attested:boolean}).attested!==true)throw new AssistantError("ASSISTANT_INVALID_INPUT");
    if(args.operation==="booking_attendance"&&((changes as {action:string;kind:unknown}).action==="confirm"?!(changes as {kind:unknown}).kind:(changes as {kind:unknown}).kind!==null))throw new AssistantError("ASSISTANT_INVALID_INPUT");
    const noId=String(args.operation).startsWith("photo_")||args.operation==="supply_create";
    if(noId ? args.record_id!==null : !args.record_id)throw new AssistantError("ASSISTANT_INVALID_INPUT");
    if(args.operation==="client_card"&&!Object.keys((changes as {patch:object}).patch).length)throw new AssistantError("ASSISTANT_INVALID_INPUT");
  }
  if(tool === "prepare_team_controls") {
    let changes:unknown;try{changes=JSON.parse(String(args.changes_json));}catch{throw new AssistantError("ASSISTANT_INVALID_INPUT");}
    assertSchema(changes,ASSISTANT_TEAM_CHANGES[args.operation as keyof typeof ASSISTANT_TEAM_CHANGES]);
    if(!changes||!Object.keys(changes).length||args.operation==="permissions"&&Object.keys(changes).length===1&&Object.hasOwn(changes,"permissions")&&!Object.keys((changes as {permissions:object}).permissions).length)throw new AssistantError("ASSISTANT_INVALID_INPUT");
  }
  if(tool === "prepare_business_controls") {
    let changes:unknown;try{changes=JSON.parse(String(args.changes_json));}catch{throw new AssistantError("ASSISTANT_INVALID_INPUT");}
    const properties=ASSISTANT_CONTROLS[args.section as AssistantControl];
    assertSchema(changes,{type:"object",properties,required:[],additionalProperties:false});
    if(!changes||!Object.keys(changes).length)throw new AssistantError("ASSISTANT_INVALID_INPUT");
  }
  if (tool === "prepare_finance_record") {
    const expense=args.action==="expense", refund=args.action==="refund";
    if(expense ? args.record_id!==null||args.record_kind!==null||args.method!==null||!args.category||!args.treatment
      : args.category!==null||args.treatment!==null||!args.record_id||(refund?args.record_kind!=="receipt"||args.method!==null:!["sale","booking","order"].includes(String(args.record_kind))||!args.method)) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  }
  if (tool === "get_availability") {
    const groups = (candidate as { selected_options: { group_id: string; values: string[] }[] }).selected_options;
    if (new Set(groups.map(group => group.group_id)).size !== groups.length || groups.some(group => new Set(group.values).size !== group.values.length) || !args.style_id && (Number(args.days ?? 1) !== 1 || groups.length)) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  }
  if ("start" in args) {
    const start = Date.parse(String(args.start)); const end = Date.parse(String(args.end));
    if (!validCalendarDate(String(args.start)) || !validCalendarDate(String(args.end)) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 31 * 86400_000 || !/Z$|[+-]\d{2}:\d{2}$/.test(String(args.start)) || !/Z$|[+-]\d{2}:\d{2}$/.test(String(args.end))) throw new AssistantError("ASSISTANT_INVALID_DATE_RANGE");
  }
  if ("date" in args && !validCalendarDate(String(args.date))) throw new AssistantError("ASSISTANT_INVALID_DATE_RANGE");
  if (tool === "prepare_business_hours") for (const day of Object.values(args.hours as Record<string, { closed: boolean; open: string; close: string }>)) if (!day.closed && day.close <= day.open) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  if (tool === "prepare_service") serviceLengthOptions(args.length_addons as { name: string; price: number }[]);
  if (tool === "prepare_business_policy_update") validateBusinessPolicy(args.policy);
  if (tool === "prepare_business_profile_update") {
    if (args.field === "hours") {
      if (!args.hours || args.text !== null) throw new AssistantError("ASSISTANT_INVALID_INPUT");
      for (const day of Object.values(args.hours as Record<string, { closed: boolean; open: string; close: string }>)) if (!day.closed && day.close <= day.open) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    } else if (typeof args.text !== "string" || args.hours !== null) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    if (args.field === "description" && String(args.text).trim().split(/\s+/u).length > 200) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    if (["tiktok_url", "instagram_url"].includes(String(args.field))) {
      let url: URL; try { url = new URL(String(args.text)); } catch { throw new AssistantError("ASSISTANT_INVALID_INPUT"); }
      const allowed = args.field === "tiktok_url" ? "tiktok.com" : "instagram.com";
      if (url.protocol !== "https:" || url.username || url.password || ![allowed, `www.${allowed}`].includes(url.hostname)) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    }
  }
  return { tool, args, risk: ASSISTANT_TOOLS[tool].risk, permission: tool === "prepare_business_profile_update" && args.field === "hours" ? "availability" : ASSISTANT_TOOLS[tool].permission };
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
