import { dateKeyInTimeZone, isValidTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { isSalonClosedOn } from "@/lib/salonOpenStatus";

type Row = Record<string, unknown>;
// Pure structural input keeps the owner component's type dependency out of the
// protected database/server module graph. The canonical reader supplies it.
type ScheduleAvailabilityEvidence = { salon: Row; roster: Row[]; bookings: Row[]; intents: Row[]; blockouts: Row[]; timeZone: string };
type Interval = [number, number];
type DayCapacity = { date: string; professional_id: string | null; professional_name: string | null; scheduled_minutes: number; blocked_minutes: number; capacity_minutes: number; booked_minutes: number; held_minutes: number; free_minutes: number; booked_percent: number | null; gaps: { start: string; end: string }[]; href: string };
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
export function scheduleDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
const addDays = (value: string, amount: number) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
const minute = (value: unknown) => {
  const text = String(value || "").trim().toUpperCase();
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/.exec(text);
  if (!match) throw Error("SCHEDULE_HOURS_UNAVAILABLE");
  let hour = Number(match[1]); const min = Number(match[2]);
  if (min > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) throw Error("SCHEDULE_HOURS_UNAVAILABLE");
  if (match[3]) hour = hour % 12 + (match[3] === "PM" ? 12 : 0);
  return hour * 60 + min;
};
function hours(value: unknown): Interval | null {
  // Missing configuration is not evidence of a closed or fully booked day.
  if (value == null || value === "") throw Error("SCHEDULE_HOURS_UNAVAILABLE");
  const row = object(value);
  if (row.closed === true || row.enabled === false || typeof value === "string" && /^(closed|off)$/i.test(value.trim())) return null;
  const pair = typeof value === "string" ? value.split(/\s*(?:-|–|—|to)\s*/i) : [row.open, row.close];
  if (pair.length !== 2) throw Error("SCHEDULE_HOURS_UNAVAILABLE");
  const start = minute(pair[0]), end = minute(pair[1]);
  if (end <= start) throw Error("SCHEDULE_HOURS_UNAVAILABLE");
  return [start, end];
}
function merge(rows: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const row of rows.filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && row[0] <= last[1]) last[1] = Math.max(last[1], row[1]); else result.push([...row]);
  }
  return result;
}
function subtract(base: Interval[], busy: Interval[]): Interval[] {
  return merge(busy).reduce((free, [a, b]) => free.flatMap(([left, right]): Interval[] => b <= left || a >= right ? [[left, right]] : [...(a > left ? [[left, a] as Interval] : []), ...(b < right ? [[b, right] as Interval] : [])]), base);
}
const duration = (rows: Interval[]) => rows.reduce((sum, [a, b]) => sum + b - a, 0);
const mins = (amount: number) => Math.round(amount / 6000) / 10;
function occupied(rows: Row[], resource: string | null, span: Interval, startKey: string, endKey: string) {
  return merge(rows.flatMap(row => {
    if (row.stylist_id && resource && row.stylist_id !== resource) return [];
    const start = Date.parse(String(row[startKey])), end = Date.parse(String(row[endKey]));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw Error("SCHEDULE_EVIDENCE_INCOMPLETE");
    return [[Math.max(span[0], start), Math.min(span[1], end)] as Interval];
  }));
}
function at(date: string, minutes: number, zone: string) {
  return zonedLocalToUtc(`${date}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`, zone).getTime();
}
export function scheduleReviewHref(date: string, professional: string | null) {
  if (!scheduleDate(date) || professional !== null && !uuid.test(professional)) throw Error("SCHEDULE_INVALID_SELECTION");
  return `/salon/dashboard/availability?${new URLSearchParams({ date, ...(professional ? { stylist: professional } : {}) })}`;
}
/** A current future schedule projection, never a historical demand estimate. */
export function businessScheduleOpportunities(salonId: string, evidence: ScheduleAvailabilityEvidence, now = Date.now(), assigned: string | null = null) {
  if (!Number.isFinite(now) || !isValidTimeZone(evidence.timeZone) || evidence.salon.id !== salonId) throw Error("SCHEDULE_ACCESS_DENIED");
  for (const rows of [evidence.roster, evidence.bookings, evidence.intents, evidence.blockouts]) {
    if (rows.length > 1000 || rows.some(row => row.salon_id !== salonId)) throw Error("SCHEDULE_ACCESS_DENIED");
  }
  if (evidence.roster.length > 50) throw Error("SCHEDULE_EVIDENCE_INCOMPLETE");
  // The general operating calendar also displays draft staff. Suggestions are
  // more conservative: do not present those unpublished resources as capacity.
  const roster: Row[] = evidence.roster.length ? evidence.roster.filter(row => row.is_active !== false && row.is_draft !== true) : [{ id: null, name: null, availability: evidence.salon.hours }];
  if (assigned && !roster.some(row => row.id === assigned)) throw Error("SCHEDULE_ACCESS_DENIED");
  const startDate = dateKeyInTimeZone(new Date(now), evidence.timeZone);
  const snapshot: DayCapacity[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(startDate, offset), day = days[new Date(`${date}T12:00:00Z`).getUTCDay()];
    const salonHours = isSalonClosedOn(evidence.salon, date) ? null : hours(object(evidence.salon.hours)[day]);
    for (const person of roster.filter(row => !assigned || row.id === assigned)) {
      const id = person.id == null ? null : String(person.id);
      if (id !== null && !uuid.test(id)) throw Error("SCHEDULE_EVIDENCE_INCOMPLETE");
      const own = salonHours && (id ? hours(object(person.availability)[day]) : salonHours);
      const start = own && salonHours ? Math.max(at(date, Math.max(salonHours[0], own[0]), evidence.timeZone), Math.ceil(now / 60000) * 60000) : 0;
      const end = own && salonHours ? at(date, Math.min(salonHours[1], own[1]), evidence.timeZone) : 0;
      const span: Interval = [start, Math.max(start, end)];
      const base: Interval[] = end > start ? [span] : [];
      const blocks = occupied(evidence.blockouts, id, span, "starts_at", "ends_at");
      const capacity = subtract(base, blocks);
      const bookings = occupied(evidence.bookings.filter(row => !["cancelled", "canceled"].includes(String(row.status).toLowerCase())), id, span, "appointment_datetime", "blocked_until");
      const afterBookings = subtract(capacity, bookings);
      const holds = occupied(evidence.intents.filter(row => row.status === "Pending" && Date.parse(String(row.expires_at)) > now), id, span, "appointment_datetime", "blocked_until");
      const free = subtract(afterBookings, holds), capacityMs = duration(capacity), freeMs = duration(free), bookedMs = capacityMs - duration(afterBookings);
      snapshot.push({ date, professional_id: id, professional_name: person.name ? String(person.name).slice(0, 160) : null,
        scheduled_minutes: mins(duration(base)), blocked_minutes: mins(duration(base) - capacityMs), capacity_minutes: mins(capacityMs), booked_minutes: mins(bookedMs), held_minutes: mins(duration(afterBookings) - freeMs), free_minutes: mins(freeMs),
        booked_percent: capacityMs ? Math.round(bookedMs / capacityMs * 1000) / 10 : null,
        gaps: free.map(([a, b]) => ({ start: new Date(a).toISOString(), end: new Date(b).toISOString() })), href: scheduleReviewHref(date, id) });
    }
  }
  const total = (key: "capacity_minutes" | "booked_minutes" | "held_minutes" | "free_minutes") => Math.round(snapshot.reduce((sum, row) => sum + row[key], 0) * 10) / 10;
  const capacity = total("capacity_minutes"), booked = total("booked_minutes");
  return { from: startDate, to: addDays(startDate, 6), time_zone: evidence.timeZone, generated_at: new Date(now).toISOString(), scope: assigned ? "assigned_professional" as const : "authenticated_business" as const,
    capacity_minutes: capacity, booked_minutes: booked, held_minutes: total("held_minutes"), free_minutes: total("free_minutes"), booked_percent: capacity ? Math.round(booked / capacity * 1000) / 10 : null,
    professional_count: new Set(snapshot.map(row => row.professional_id).filter(id => id !== null)).size, records: snapshot,
    opportunities: snapshot.filter(row => row.free_minutes > 0).sort((a, b) => b.free_minutes - a.free_minutes || a.date.localeCompare(b.date) || String(a.professional_id).localeCompare(String(b.professional_id))).slice(0, 6),
    definitions: "Current remaining schedule for seven local calendar days, including today. Draft/inactive professionals are excluded. Professional-minutes are summed across people, not distinct clock minutes. Capacity is configured intersected business/professional time after closures and blockouts. Bookings take precedence over overlapping holds; intervals count once per professional. Free time excludes active checkout holds. Booked percentage uses capacity, not sales or customer demand. Missing hours are unavailable. No historical utilization, service fit, marketplace eligibility, profit, benchmark, booking or promotion promise is inferred. Calendar review refreshes the source before any action." };
}
export type BusinessScheduleOpportunities = ReturnType<typeof businessScheduleOpportunities>;

/** Purpose-specific model facts retain exact intervals within the planner's
 * existing depth/array bounds. Full rows remain available to the owner UI. */
export function businessScheduleOpportunitiesSummary(value: BusinessScheduleOpportunities) {
  const { records, opportunities, ...totals } = value;
  const selected = opportunities.slice(0, 6);
  const count = records.filter(row => row.free_minutes > 0).length;
  return { ...totals, record_count: records.length, opportunity_count: count,
    shown_count: selected.length, is_excerpt: count > selected.length,
    opportunities: selected.map(({ gaps, ...row }) => ({ ...row,
      gap_count: gaps.length, gaps_are_excerpt: gaps.length > 12,
      gap_intervals: gaps.slice(0, 12).map(gap => `${gap.start} / ${gap.end}`),
    })) };
}
