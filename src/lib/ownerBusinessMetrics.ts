type Row = Record<string, unknown>;
export const isBusinessAdded = (booking: Row) => booking.booking_origin === "business_added";
export const BOOKING_SOURCE_LABELS: Record<string, string> = {
  marketplace: "Girlz Culture marketplace", phone: "Phone", walk_in: "Walk-in", instagram: "Instagram", whatsapp: "WhatsApp", other: "Other",
};
export function profileCompletion(salon: Row, services: number, professionals: number) {
  return Math.round([salon.name, salon.description, salon.phone, salon.address_street, salon.cover_photo_url, services, professionals].filter(Boolean).length / 7 * 100);
}
/** The existing dashboard definition is completed estimated booking value,
 * never a claim of cash revenue. Business-entered money is not GC GMV. */
export function ownerBusinessMetrics(bookings: Row[], now = Date.now()) {
  const marketplace = bookings.filter(row => !isBusinessAdded(row));
  const manual = bookings.filter(isBusinessAdded);
  const completed = marketplace.filter(row => String(row.status).toLowerCase() === "completed");
  const cancellations = marketplace.filter(row => String(row.cancelled_by || row.cancellation_initiated_by || "").toLowerCase() === "salon").length;
  const customers = new Set(marketplace.map(row => row.customer_id || row.guest_email).filter(Boolean)).size;
  const bySource: Record<string, number> = { marketplace: marketplace.length };
  for (const row of manual) { const key = String(row.source); bySource[key] = (bySource[key] || 0) + 1; }
  return {
    total_appointments: bookings.length, marketplace_bookings: marketplace.length, business_added_appointments: manual.length,
    source_breakdown: bySource, customers, completed_booking_value: completed.reduce((sum,row) => sum + Number(row.estimated_total || 0), 0),
    cancellation_rate: marketplace.length ? cancellations / marketplace.length : 0,
    upcoming: bookings.filter(row => Date.parse(String(row.appointment_datetime)) > now && !/cancelled|canceled/i.test(String(row.status))).sort((a,b) => String(a.appointment_datetime).localeCompare(String(b.appointment_datetime))),
  };
}
