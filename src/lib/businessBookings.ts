export const BOOKING_GROUPS = ["Upcoming", "In Progress", "Needs Resolution", "All"] as const;
export type BookingGroup = (typeof BOOKING_GROUPS)[number];

export function normalizedBookingStatus(booking: Record<string, unknown>) {
  return String(booking.status || "").trim().toLowerCase().replaceAll("_", " ");
}

export function bookingNeedsResolution(booking: Record<string, unknown>, now: number) {
  const operationalState = [
    normalizedBookingStatus(booking),
    String(booking.reschedule_status || ""),
    String(booking.refund_status || ""),
    String(booking.payment_status || ""),
  ].join(" ").toLowerCase().replaceAll("_", " ");
  if (/requested|pending|needs? (review|attention)|resolution|failed|disput|chargeback|on hold/.test(operationalState)) {
    return true;
  }
  const appointmentTime = new Date(String(booking.appointment_datetime || "")).getTime();
  const terminal = /completed|cancelled|canceled|declined|refunded|no show/.test(normalizedBookingStatus(booking));
  return !terminal && Number.isFinite(appointmentTime) && appointmentTime < now && !/ready|checked in|in progress|started/.test(normalizedBookingStatus(booking));
}

export function bookingMatchesGroup(booking: Record<string, unknown>, group: BookingGroup, now: number) {
  if (group === "All") return true;
  const status = normalizedBookingStatus(booking);
  if (group === "In Progress") return /ready|checked in|in progress|started/.test(status);
  if (group === "Needs Resolution") return bookingNeedsResolution(booking, now);
  const appointmentTime = new Date(String(booking.appointment_datetime || "")).getTime();
  const active = !/completed|cancelled|canceled|declined|refunded|no show/.test(status);
  return active && !bookingNeedsResolution(booking, now) && !/ready|checked in|in progress|started/.test(status) && (!Number.isFinite(appointmentTime) || appointmentTime >= now);
}

export function bookingLocalDay(value: unknown, timeZone: string) {
 const date = new Date(String(value || "")); if (!Number.isFinite(date.getTime())) return null;
 const parts = new Intl.DateTimeFormat("en-CA", {timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
 return ["year","month","day"].map(key=>parts.find(part=>part.type===key)?.value).join("-");
}
export function filterBookingPeriod(rows:Record<string,unknown>[], filters:{from:string;to:string;staff:string;service:string}, timeZone:string) {
 return rows.filter(row=>{
  if(filters.staff && (filters.staff==="unassigned"?Boolean(row.stylist_id):row.stylist_id!==filters.staff)) return false;
  if(filters.service && (filters.service==="manual"?Boolean(row.style_id):row.style_id!==filters.service)) return false;
  const day=bookingLocalDay(row.appointment_datetime,timeZone);
  return (!filters.from || Boolean(day && day>=filters.from)) && (!filters.to || Boolean(day && day<=filters.to));
 });
}
export function summarizeBookings(rows:Record<string,unknown>[]) {
 const completed=rows.filter(row=>normalizedBookingStatus(row)==="completed");
 const priced=completed.filter(row=>row.estimated_total!==null && row.estimated_total!==undefined && Number.isFinite(Number(row.estimated_total)));
 return {total:rows.length,confirmed:rows.filter(row=>normalizedBookingStatus(row)==="confirmed").length,completed:completed.length,completedAgreedCents:priced.reduce((sum,row)=>sum+Math.round(Number(row.estimated_total)*100),0),missingPrices:completed.length-priced.length};
}
