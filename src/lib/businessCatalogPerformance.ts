type Row = Record<string, unknown>;
export function completedServiceCounts(bookings: readonly Row[], salonId: string, start: number, end: number) {
  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  for (const booking of bookings) {
    const date = Date.parse(String(booking.appointment_datetime));
    if (booking.salon_id !== salonId || !booking.id || seen.has(String(booking.id)) || !booking.style_id || String(booking.status).toLowerCase() !== "completed" || (booking.payment_mode === "test" && booking.is_demo !== true) || !Number.isFinite(date) || date < start || date >= end) continue;
    seen.add(String(booking.id));
    const id = String(booking.style_id);
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

export function popularServiceIds(counts: Record<string, number>, eligibleIds: string[]) {
  return new Set(eligibleIds.filter(id => counts[id] > 0).sort((a,b) => counts[b] - counts[a] || a.localeCompare(b)).slice(0,3));
}

export function featuredFirst<T extends { is_featured?: boolean | null }>(styles: readonly T[]): T[] {
  return [...styles].sort((a,b) => Number(b.is_featured === true) - Number(a.is_featured === true));
}
