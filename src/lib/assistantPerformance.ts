import { isBusinessAdded } from "@/lib/ownerBusinessMetrics";
type Row = Record<string, unknown>;
const status = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[_ -]/g, "");

/** Booking records establish workload and estimated value, never settlement.
 * Missing completed amounts are unknown, while a verified empty set is zero. */
export function assistantPeriodMetrics(bookings: Row[]) {
  const completed = bookings.filter(row => status(row.status) === "completed");
  const marketplace = completed.filter(row => !isBusinessAdded(row));
  const amounts = marketplace.map(row => row.estimated_total == null || row.estimated_total === "" ? NaN : Number(row.estimated_total));
  return {
    total_appointments: bookings.length,
    completed_appointments: completed.length,
    marketplace_bookings: bookings.filter(row => !isBusinessAdded(row)).length,
    business_added_appointments: bookings.filter(isBusinessAdded).length,
    recorded_no_shows: bookings.filter(row => status(row.status) === "noshow").length,
    completed_booking_value: amounts.every(amount => Number.isFinite(amount) && amount >= 0) ? Math.round(amounts.reduce((sum, amount) => sum + amount, 0) * 100) / 100 : null,
    cash_revenue: null,
  };
}

export function compareAssistantPeriods(current: ReturnType<typeof assistantPeriodMetrics>, previous: ReturnType<typeof assistantPeriodMetrics>) {
  const keys = ["total_appointments", "completed_appointments", "marketplace_bookings", "business_added_appointments", "recorded_no_shows", "completed_booking_value"] as const;
  return Object.fromEntries(keys.map(key => {
    const now = current[key], before = previous[key];
    const absolute = now == null || before == null ? null : Math.round((now - before) * 100) / 100;
    return [key, { absolute, percent: absolute == null || before === 0 || before == null ? null : Math.round(absolute / before * 10000) / 100 }];
  }));
}

export function assistantPerformanceGroups(bookings: Row[], field: "style_id" | "stylist_id") {
  const groups = new Map<string | null, Row[]>();
  for (const booking of bookings) {
    const id = typeof booking[field] === "string" ? booking[field] as string : null;
    const rows = groups.get(id) || []; rows.push(booking); groups.set(id, rows);
  }
  return Array.from(groups, ([record_id, rows]) => ({ record_id, ...assistantPeriodMetrics(rows) }))
    .sort((a, b) => b.total_appointments - a.total_appointments || String(a.record_id).localeCompare(String(b.record_id)));
}
