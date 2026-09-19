import { dateKeyInTimeZone, isValidTimeZone } from "@/lib/dateTime";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const active = new Set(["Pending", "Confirmed", "Arriving Soon", "Ready", "In Progress", "Checked In"]);
const statuses = new Set([...active, "Completed", "Cancelled", "No Show", "No-show", "Refunded"]);
type Row = { id: string; salon_id: string; stylist_id: string | null; group_key: string; client_name: string | null; appointment_datetime: string; service_completed_at: string | null; status: string; unlinked_guest: boolean };
export type RebookingEvidence = { salon_id: string; as_of: string; time_zone: string; scope: "business" | "assigned_professional"; stylist_id: string | null; from: string; through: string; complete: boolean; record_count: number; records: Row[] };
export function rebookingShiftDay(day: string, shift: number) {
 const value = new Date(day + "T12:00:00Z"); value.setUTCDate(value.getUTCDate() + shift); return value.toISOString().slice(0, 10);
}
const calendarDays = (from: string, to: string) => Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86_400_000);
const completedAt = (row: Row) => row.service_completed_at || row.appointment_datetime;

/** Uses only canonical same-business identity groups. A name or contact match
 * never combines guest appointments. This criterion is a visible suggestion,
 * not a membership category, prediction or permission to contact someone. */
export function businessRebookingAdvice(salonId: string, evidence: RebookingEvidence) {
 if (!evidence || evidence.salon_id !== salonId || !uuid.test(salonId) || !["business", "assigned_professional"].includes(evidence.scope)
  || (evidence.scope === "assigned_professional" ? !uuid.test(evidence.stylist_id || "") : evidence.stylist_id !== null)) throw Error("REBOOKING_ACCESS_DENIED");
 const asOf = Date.parse(evidence.as_of);
 if (!isValidTimeZone(evidence.time_zone) || !Number.isFinite(asOf) || evidence.through !== dateKeyInTimeZone(evidence.as_of, evidence.time_zone)
  || evidence.from !== rebookingShiftDay(evidence.through, -365) || typeof evidence.complete !== "boolean" || !Number.isSafeInteger(evidence.record_count) || evidence.record_count < 0 || !Array.isArray(evidence.records)) throw Error("REBOOKING_INCOMPLETE");
 const base = { as_of: evidence.as_of, from: evidence.from, through: evidence.through, time_zone: evidence.time_zone, scope: evidence.scope,
  window_days: 365, minimum_visits: 3, absence_days: 42, contact_performed: false as const, capped_at: 20 };
 if (!evidence.complete) return { ...base, available: false as const, absent_count: null, regular_count: null, recent_or_booked_count: null, unlinked_guest_visits: null, completed_visit_count: null, candidates: [], is_excerpt: false };
 if (evidence.records.length !== evidence.record_count || evidence.records.length > 5000) throw Error("REBOOKING_INCOMPLETE");
 const seen = new Set<string>(), groups = new Map<string, Row[]>();
 for (const row of evidence.records) {
  if (!row || row.salon_id !== salonId || (evidence.scope === "assigned_professional" && row.stylist_id !== evidence.stylist_id)) throw Error("REBOOKING_ACCESS_DENIED");
  if (!uuid.test(row.id) || row.stylist_id !== null && !uuid.test(row.stylist_id) || !/^[0-9a-f]{32}$/.test(row.group_key) || seen.has(row.id)
   || !Number.isFinite(Date.parse(row.appointment_datetime)) || row.service_completed_at !== null && !Number.isFinite(Date.parse(row.service_completed_at))
   || row.status === "Completed" && Date.parse(completedAt(row)) > asOf || !statuses.has(row.status) || typeof row.unlinked_guest !== "boolean" || row.client_name !== null && (typeof row.client_name !== "string" || row.client_name.length > 200)) throw Error("REBOOKING_INCOMPLETE");
  seen.add(row.id); const group = groups.get(row.group_key) || []; group.push(row); groups.set(row.group_key, group);
 }
 let regulars = 0, unlinked = 0, completedCount = 0;
 const candidates = [...groups.values()].flatMap(rows => {
  const completed = rows.filter(row => row.status === "Completed" && Date.parse(completedAt(row)) <= asOf
   && dateKeyInTimeZone(completedAt(row), evidence.time_zone) >= evidence.from);
  completedCount += completed.length; unlinked += completed.filter(row => row.unlinked_guest).length;
  if (completed.length < 3) return [];
  regulars++;
  completed.sort((a, b) => Date.parse(completedAt(b)) - Date.parse(completedAt(a)) || a.id.localeCompare(b.id));
  const last = completed[0], lastDay = dateKeyInTimeZone(completedAt(last), evidence.time_zone), days = calendarDays(lastDay, evidence.through);
  if (days < 42 || rows.some(row => active.has(row.status) && (Date.parse(row.appointment_datetime) >= asOf || ["Ready", "In Progress", "Checked In"].includes(row.status)))) return [];
  return [{ client_name: last.client_name?.trim() || null, completed_visits: completed.length, last_visit: lastDay, days_since_visit: days, booking_id: last.id, href: "/salon/dashboard/bookings/" + last.id }];
 }).sort((a, b) => b.days_since_visit - a.days_since_visit || (a.client_name || "").localeCompare(b.client_name || "") || a.booking_id.localeCompare(b.booking_id));
 return { ...base, available: true as const, absent_count: candidates.length, regular_count: regulars, recent_or_booked_count: regulars - candidates.length,
  unlinked_guest_visits: unlinked, completed_visit_count: completedCount, candidates: candidates.slice(0, 20), is_excerpt: candidates.length > 20 };
}
export type BusinessRebookingAdvice = ReturnType<typeof businessRebookingAdvice>;
/** Overview is aggregate-only. No client IDs, names, contacts or private card
 * contents enter either model phase through this recommendation. */
export function businessRebookingAdviceSummary(data: BusinessRebookingAdvice) {
 return { available: data.available, as_of: data.as_of, from: data.from, through: data.through, time_zone: data.time_zone, scope: data.scope,
  absent_count: data.absent_count, regular_count: data.regular_count, minimum_visits: data.minimum_visits, absence_days: data.absence_days,
  unlinked_guest_visits: data.unlinked_guest_visits, href: "/salon/dashboard/bookings#returning-clients",
    definition: "At least 3 completed appointments since the stated lookback start, latest completed visit at least 42 local calendar days ago, and no active future or in-service appointment in this authorized scope. Recorded completion date is used; otherwise the completed appointment's scheduled date. Same-business authenticated identities or explicit owner-linked visits only; names do not establish identity. Assigned staff counts cover only their own professional appointments. Missing or capped evidence is unavailable, never zero. No contact or financial prediction was performed." };
}
