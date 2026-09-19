import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError, stableJson, validateTool } from "@/lib/gcAssistantCore";
import { assistantRequestedProfessional } from "@/lib/assistantProfessionalScope";
import { priceReadScope, unchangedPriceScope } from "@/lib/assistantPriceReadScope";
import { calculateBookingServiceSelection, ServiceSelectionError } from "@/lib/bookingServiceSelection";
import { serviceAvailabilityWindow } from "@/lib/bookingAvailabilityServer";
import { scheduleReviewHref } from "@/lib/businessScheduleOpportunities";
import { addMinutesToLocal, isValidTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { getEngineNumber } from "@/lib/engineConfigServer";
import type { CapacityOptionGroup, ServiceCapacity } from "@/lib/businessServiceCapacity";
import { readServiceContribution } from "@/lib/businessServiceContributionServer";
type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;
const unavailable = () => new AssistantError("SERVICE_CAPACITY_UNAVAILABLE", 503);
const fields = "id,salon_id,name,base_price,price_display_min,duration_min_hours,duration_max_hours,buffer_minutes,option_groups,archived_at,is_draft";
const object = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
function options(value: unknown): CapacityOptionGroup[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 12) throw unavailable();
  const ids = new Set<string>();
  return value.map(raw => {
    const group = object(raw);
    if (!group || typeof group.id !== "string" || !group.id || group.id.length > 40 || ids.has(group.id) || typeof group.label !== "string" || group.label.length > 120 || !Array.isArray(group.options) || !group.options.length || group.options.length > 12 || !["single", "multiple", null, undefined].includes(group.selection as string | null | undefined)) throw unavailable();
    ids.add(group.id); const values = new Set<string>();
    return { id: group.id, label: group.label, required: Boolean(group.required), multiple: group.selection === "multiple", options: group.options.map(raw => {
      const option = object(raw), duration = option?.duration_add_minutes ?? 0;
      if (!option || typeof option.value !== "string" || !option.value || option.value.length > 80 || values.has(option.value) || typeof option.label !== "string" && option.label != null || String(option.label || option.value).length > 120 || typeof duration !== "number" || !Number.isInteger(duration) || Math.abs(duration) > 1440) throw unavailable();
      values.add(option.value);
      return { value: option.value, label: String(option.label || option.value), duration_minutes: duration };
    }) };
  });
}
async function readStyle(context: Context, id: string) {
  const read = await context.admin.from("styles").select(fields).eq("salon_id", context.salon.id).eq("id", id).is("archived_at", null).maybeSingle();
  const style = object(read.data);
  if (read.error) throw unavailable();
  if (!style || style.id !== id || style.salon_id !== context.salon.id) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
  if (style.is_draft === true || style.archived_at != null) throw unavailable();
  return style;
}
export async function readBusinessServiceCapacity(context: Context, input: Row): Promise<ServiceCapacity> {
  const { args } = validateTool("get_availability", input);
  if (!args.style_id) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  const scope = await priceReadScope(context, ["styles", "availability"]);
  if (!isValidTimeZone(scope.time_zone)) throw unavailable();
  const stylistId = assistantRequestedProfessional(context, args.stylist_id);
  const style = await readStyle(context, String(args.style_id));
  const groups = options(style.option_groups);
  const min = style.duration_min_hours, max = style.duration_max_hours ?? min;
  if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max) || min < .25 || max < min || max > 24) throw unavailable();
  const date = String(args.date), days = Number(args.days ?? 1);
  const result: ServiceCapacity = { available: false, reason: null, service_id: String(style.id), service_name: String(style.name || ""), date,
    through: addMinutesToLocal(date, "00:00", (days - 1) * 1440).date, time_zone: scope.time_zone, as_of: new Date().toISOString(),
    duration_minutes: null, duration_basis: max > min ? "maximum_saved_duration" : "fixed_saved_duration", buffer_minutes: null, option_groups: groups,
    total: null, shown_count: 0, is_excerpt: false, days: [], slots: [],
    definition: "Current own-business bookable start-time alternatives, not additional appointment capacity. Alternatives overlap and must not be summed as appointments. Uses the longest saved service duration plus explicitly selected canonical option adjustments and buffer. No customer conflict/eligibility, reservation, demand, revenue or net-profit claim; the booking workflow rechecks availability.",
  };
  let duration = 0;
  try {
    const selected = Object.fromEntries((args.selected_options as { group_id: string; values: string[] }[] || []).map(group => [group.group_id, group.values]));
    duration = Math.round(max * 60) + calculateBookingServiceSelection(style, { selected_size: null, selected_length: null, selected_addons: [], selected_material_id: null, selected_options: selected }).duration_adjustment_minutes;
    if (!Number.isInteger(duration) || duration < 15 || duration > 1440) throw unavailable();
  } catch (error) {
    if (!(error instanceof ServiceSelectionError)) throw error;
    result.reason = error.code === "selection_required" ? "selection_required" : "selection_unavailable";
  }
  if (!result.reason) {
    const [lead, advance] = await Promise.all([getEngineNumber("booking.minimum_lead_minutes", 30, 15, 1440), getEngineNumber("booking.maximum_advance_days", 180, 7, 730)]);
    const read = await serviceAvailabilityWindow({ salonId: context.salon.id, styleId: String(style.id), stylistId, date, days, durationMinutes: duration });
    if (read.timeZone !== scope.time_zone || read.style.duration_min_hours !== style.duration_min_hours || read.style.buffer_minutes !== style.buffer_minutes) throw unavailable();
    result.available = true; result.duration_minutes = duration; result.buffer_minutes = read.bufferMinutes;
    const now = Date.now();
    const dates = read.dates.map(day => ({ ...day, slots: day.slots.filter(slot => { const instant = zonedLocalToUtc(`${day.date}T${slot.value}`, read.timeZone).getTime(); return instant >= now + lead * 60_000 && instant <= now + advance * 86_400_000; }) }));
    const slots = dates.flatMap(day => day.slots.map(slot => ({ date: day.date, time: slot.value, stylist_id: slot.stylistId, professional_name: slot.stylistId ? slot.stylistName : null, href: scheduleReviewHref(day.date, slot.stylistId) })));
    result.total = slots.length; result.slots = slots.slice(0, 42); result.shown_count = result.slots.length; result.is_excerpt = slots.length > result.shown_count;
    result.days = dates.map(day => ({ date: day.date, total: day.slots.length }));
  }
  const after = await readStyle(context, String(style.id));
  if (stableJson(after) !== stableJson(style)) throw unavailable();
  unchangedPriceScope(scope, await priceReadScope(context, ["styles", "availability"]));
  return result;
}

/** The finance view joins a current fit check to independently verified,
 * owner-reviewed historical contribution. Neither proves future demand. */
export async function readContributionServiceCapacity(context: Context, input: Row, from: string, to: string) {
  const before = await readServiceContribution(context, from, to);
  const candidate = before.recommendations.find(row => row.service_id === input.style_id);
  if (!candidate) throw new AssistantError("SERVICE_CAPACITY_REVIEW_CHANGED", 409);
  const result = await readBusinessServiceCapacity(context, input);
  const after = await readServiceContribution(context, from, to);
  if (before.fingerprint !== after.fingerprint || !after.recommendations.some(row => stableJson(row) === stableJson(candidate))) throw new AssistantError("SERVICE_CAPACITY_REVIEW_CHANGED", 409);
  return result;
}
