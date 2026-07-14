import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { addMinutesToLocal, salonTimeZone, slotLabel, zonedLocalToUtc } from "@/lib/dateTime";

type Row = Record<string, unknown>;
type HoursRange = { open: string; close: string; closed: boolean };

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayName(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return dayNames[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function minutes(value: string) {
  const normalized = value.trim().toUpperCase();
  const twelveHour = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12;
    if (twelveHour[3] === "PM") hour += 12;
    return hour * 60 + Number(twelveHour[2]);
  }
  const twentyFour = normalized.match(/^(\d{1,2}):(\d{2})$/);
  return twentyFour ? Number(twentyFour[1]) * 60 + Number(twentyFour[2]) : null;
}

function hhmm(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function hoursRange(raw: unknown): HoursRange | null {
  if (raw && typeof raw === "object") {
    const row = raw as Row;
    if (row.closed === true || row.enabled === false) return { open: "00:00", close: "00:00", closed: true };
    const open = String(row.open || "");
    const close = String(row.close || "");
    return minutes(open) != null && minutes(close) != null ? { open, close, closed: false } : null;
  }
  const text = String(raw || "").trim();
  if (!text || /^closed$/i.test(text)) return { open: "00:00", close: "00:00", closed: true };
  const [open, close] = text.split(/\s*(?:-|–|—|to)\s*/i);
  return open && close && minutes(open) != null && minutes(close) != null ? { open, close, closed: false } : null;
}

function overlaps(start: number, end: number, otherStart: unknown, otherEnd: unknown) {
  const left = new Date(String(otherStart || "")).getTime();
  const right = new Date(String(otherEnd || otherStart || "")).getTime();
  return Number.isFinite(left) && Number.isFinite(right) && start < right && end > left;
}

export async function bookingAvailability(input: { salonId: string; styleId: string; stylistId?: string | null; customerId?: string | null; guestEmail?: string | null; date: string; excludeBookingId?: string | null }) {
  const admin = getSupabaseAdmin();
  const [{ data: salon }, { data: style }, { data: stylists }] = await Promise.all([
    admin.from("salons").select("id,time_zone,hours,booking_settings").eq("id", input.salonId).single(),
    admin.from("styles").select("id,salon_id,duration_min_hours,buffer_minutes").eq("id", input.styleId).eq("salon_id", input.salonId).single(),
    admin.from("stylists").select("id,availability,is_active").eq("salon_id", input.salonId).eq("is_active", true),
  ]);
  if (!salon || !style) throw new Error("Salon or style not found.");
  const timeZone = salonTimeZone(salon.time_zone);
  const dateStart = zonedLocalToUtc(`${input.date}T00:00`, timeZone);
  const following = addMinutesToLocal(input.date, "00:00", 24 * 60);
  const dateEnd = zonedLocalToUtc(`${following.date}T00:00`, timeZone);
  const [{ data: bookings }, { data: intents }, { data: blockouts }] = await Promise.all([
    admin.from("bookings").select("id,stylist_id,appointment_datetime,blocked_until,status").eq("salon_id", input.salonId).lt("appointment_datetime", dateEnd.toISOString()).gt("blocked_until", dateStart.toISOString()),
    admin.from("booking_checkout_intents").select("id,stylist_id,appointment_datetime,blocked_until,status,expires_at").eq("salon_id", input.salonId).eq("status", "Pending").gt("expires_at", new Date().toISOString()).lt("appointment_datetime", dateEnd.toISOString()).gt("blocked_until", dateStart.toISOString()),
    admin.from("salon_blockouts").select("id,stylist_id,starts_at,ends_at").eq("salon_id", input.salonId).lt("starts_at", dateEnd.toISOString()).gt("ends_at", dateStart.toISOString()),
  ]);
  const normalizedEmail = String(input.guestEmail || "").trim().toLowerCase();
  const customerBookingQueries = [
    input.customerId ? admin.from("bookings").select("id,appointment_datetime,blocked_until,status").eq("customer_id", input.customerId).lt("appointment_datetime", dateEnd.toISOString()).gt("blocked_until", dateStart.toISOString()) : Promise.resolve({ data: [] }),
    normalizedEmail ? admin.from("bookings").select("id,appointment_datetime,blocked_until,status").eq("normalized_guest_email", normalizedEmail).lt("appointment_datetime", dateEnd.toISOString()).gt("blocked_until", dateStart.toISOString()) : Promise.resolve({ data: [] }),
    input.customerId ? admin.from("booking_checkout_intents").select("id,appointment_datetime,blocked_until,status,expires_at").eq("customer_id", input.customerId).eq("status", "Pending").gt("expires_at", new Date().toISOString()).lt("appointment_datetime", dateEnd.toISOString()).gt("blocked_until", dateStart.toISOString()) : Promise.resolve({ data: [] }),
    normalizedEmail ? admin.from("booking_checkout_intents").select("id,appointment_datetime,blocked_until,status,expires_at").eq("guest_email", normalizedEmail).eq("status", "Pending").gt("expires_at", new Date().toISOString()).lt("appointment_datetime", dateEnd.toISOString()).gt("blocked_until", dateStart.toISOString()) : Promise.resolve({ data: [] }),
  ];
  const customerResults = await Promise.all(customerBookingQueries);
  const customerBusy = customerResults.flatMap((result) => result.data || []).filter((row) => row.id !== input.excludeBookingId && !["cancelled", "canceled"].includes(String(row.status).toLowerCase()));
  const activeBookings = (bookings || []).filter((row) => row.id !== input.excludeBookingId && !["cancelled", "canceled"].includes(String(row.status).toLowerCase()));
  const activeIntents = intents || [];
  const roster = (stylists || []) as Row[];
  const requested = input.stylistId ? roster.filter((row) => row.id === input.stylistId) : roster;
  const resources = requested.length ? requested : input.stylistId ? [] : [{ id: null, availability: {} }];
  const day = dayName(input.date);
  const salonHours = hoursRange((salon.hours as Row | null)?.[day]);
  if (!salonHours || salonHours.closed) return { slots: [], timeZone, reason: "The salon is closed or has not published hours for this day." };
  const durationMinutes = Math.max(1, Math.round(Number(style.duration_min_hours || 0) * 60));
  const bufferMinutes = Math.max(0, Number(style.buffer_minutes ?? (salon.booking_settings as Row | null)?.buffer_minutes ?? 15));
  const slotStep = Math.max(15, Number((salon.booking_settings as Row | null)?.slot_minutes || 30));
  const openMinute = minutes(salonHours.open) ?? 0;
  const closeMinute = minutes(salonHours.close) ?? 0;
  const slots: Array<{ value: string; label: string; stylistId: string | null }> = [];

  for (let cursor = openMinute; cursor + durationMinutes + bufferMinutes <= closeMinute; cursor += slotStep) {
    const value = hhmm(cursor);
    const start = zonedLocalToUtc(`${input.date}T${value}`, timeZone).getTime();
    const end = start + (durationMinutes + bufferMinutes) * 60_000;
    if (start <= Date.now() + 30 * 60_000) continue;
    if (customerBusy.some((row) => overlaps(start, end, row.appointment_datetime, row.blocked_until))) continue;
    const availableResource = resources.find((resource) => {
      const resourceId = resource.id ? String(resource.id) : null;
      const stylistHours = resourceId ? hoursRange((resource.availability as Row | null)?.[day]) : null;
      if (resourceId && !stylistHours) return false;
      if (stylistHours?.closed) return false;
      if (stylistHours) {
        const stylistOpen = minutes(stylistHours.open) ?? 0;
        const stylistClose = minutes(stylistHours.close) ?? 0;
        if (cursor < stylistOpen || cursor + durationMinutes + bufferMinutes > stylistClose) return false;
      }
      const busyBooking = activeBookings.some((row) => (!row.stylist_id || (resourceId ? row.stylist_id === resourceId : !resourceId)) && overlaps(start, end, row.appointment_datetime, row.blocked_until));
      const busyIntent = activeIntents.some((row) => (!row.stylist_id || (resourceId ? row.stylist_id === resourceId : !resourceId)) && overlaps(start, end, row.appointment_datetime, row.blocked_until));
      const blocked = (blockouts || []).some((row) => (!row.stylist_id || row.stylist_id === resourceId) && overlaps(start, end, row.starts_at, row.ends_at));
      return !busyBooking && !busyIntent && !blocked;
    });
    if (availableResource) slots.push({ value, label: slotLabel(value), stylistId: availableResource.id ? String(availableResource.id) : null });
  }
  return { slots, timeZone, durationMinutes, bufferMinutes, reason: slots.length ? "" : "No open times remain for this day." };
}

export async function nextAvailableSlot(input: { salonId: string; styleId: string; stylistId?: string | null; customerId?: string | null; guestEmail?: string | null; afterDate: string; afterTime?: string; excludeBookingId?: string | null }) {
  let cursor = input.afterDate;
  for (let day = 0; day < 45; day += 1) {
    const availability = await bookingAvailability({ ...input, date: cursor });
    const slots = availability.slots.filter((slot) => day > 0 || !input.afterTime || slot.value > input.afterTime);
    if (slots.length) return { ...slots[0], date: cursor, timeZone: availability.timeZone };
    cursor = addMinutesToLocal(cursor, "00:00", 24 * 60).date;
  }
  return null;
}
