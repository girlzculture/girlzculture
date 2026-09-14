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
    .map(day => [day, object({ closed: { type: "boolean" }, open: clockTime, close: clockTime })]),
));
const policy = object({ cancellation_hours: { type: "integer", minimum: 0, maximum: 168 }, rescheduling_hours: { type: "integer", minimum: 0, maximum: 168 }, grace_minutes: { type: "integer", minimum: 0, maximum: 60 }, no_show: enumeration("contact_business", "reschedule_request"), late_arrival: enumeration("contact_business", "reschedule_request"), deposit_treatment: enumeration("platform_rules"), balance_due: enumeration("after_service"), satisfaction: enumeration("contact_business"), guests: enumeration("welcome", "ask_first", "appointment_only"), children: enumeration("welcome", "ask_first", "appointment_only"), walk_ins: enumeration("welcome", "ask_first", "appointment_only"), preparation: string(1200), notes: string(1200) });
export const ASSISTANT_TOOLS = {
  get_business_summary: { risk: 1, permission: "overview", schema: object(range) },
  get_bookings: { risk: 1, permission: "bookings", schema: object(range) },
  get_availability: { risk: 1, permission: "availability", schema: object({ style_id: uuid, stylist_id: nullableId, date: { ...string(10), pattern: "^\\d{4}-\\d{2}-\\d{2}$" } }) },
  get_business_profile: { risk: 1, permission: "my_page", schema: object({}) },
  get_services_and_prices: { risk: 1, permission: "styles", schema: object({ query: string(120) }) },
  get_business_policies: { risk: 1, permission: "my_page", schema: object({}) },
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
  assertSchema(input, ASSISTANT_TOOLS[tool].schema);
  const args = input as Record<string, unknown>;
  if ("start" in args) {
    const start = Date.parse(String(args.start)); const end = Date.parse(String(args.end));
    if (!validCalendarDate(String(args.start)) || !validCalendarDate(String(args.end)) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 31 * 86400_000 || !/Z$|[+-]\d{2}:\d{2}$/.test(String(args.start)) || !/Z$|[+-]\d{2}:\d{2}$/.test(String(args.end))) throw new AssistantError("ASSISTANT_INVALID_DATE_RANGE");
  }
  if (tool === "get_availability" && !validCalendarDate(String(args.date))) throw new AssistantError("ASSISTANT_INVALID_DATE_RANGE");
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
