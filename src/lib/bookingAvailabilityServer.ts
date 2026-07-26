import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  addMinutesToLocal,
  salonTimeZone,
  slotLabel,
  zonedLocalToUtc,
} from "@/lib/dateTime";
import { isSalonClosedOn } from "@/lib/salonOpenStatus";

type Row = Record<string, unknown>;
type HoursRange = { open: string; close: string; closed: boolean };
type AvailabilityInput = {
  salonId: string;
  styleId: string;
  stylistId?: string | null;
  customerId?: string | null;
  guestEmail?: string | null;
  excludeBookingId?: string | null;
  includeAllStylists?: boolean;
};
type AvailabilityData = {
  salon: Row;
  style: Row;
  roster: Row[];
  bookings: Row[];
  intents: Row[];
  blockouts: Row[];
  customerBusy: Row[];
  timeZone: string;
};

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
  return twentyFour
    ? Number(twentyFour[1]) * 60 + Number(twentyFour[2])
    : null;
}

function hhmm(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function hoursRange(raw: unknown): HoursRange | null {
  if (raw && typeof raw === "object") {
    const row = raw as Row;
    if (row.closed === true || row.enabled === false)
      return { open: "00:00", close: "00:00", closed: true };
    const open = String(row.open || "");
    const close = String(row.close || "");
    return minutes(open) != null && minutes(close) != null
      ? { open, close, closed: false }
      : null;
  }
  const text = String(raw || "").trim();
  if (!text || /^closed$/i.test(text))
    return { open: "00:00", close: "00:00", closed: true };
  const [open, close] = text.split(/\s*(?:-|–|—|to)\s*/i);
  return open && close && minutes(open) != null && minutes(close) != null
    ? { open, close, closed: false }
    : null;
}

function overlaps(
  start: number,
  end: number,
  otherStart: unknown,
  otherEnd: unknown,
) {
  const left = new Date(String(otherStart || "")).getTime();
  const right = new Date(String(otherEnd || otherStart || "")).getTime();
  return (
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    start < right &&
    end > left
  );
}

function assertResult(
  result: { data: unknown; error?: { message?: string } | null },
  label: string,
) {
  if (result.error) throw new Error(`${label.toUpperCase()}_QUERY_FAILED`);
  return (result.data || []) as Row[];
}

async function loadAvailabilityData(
  input: AvailabilityInput,
  fromDate: string,
  days: number,
): Promise<AvailabilityData> {
  const admin = getSupabaseAdmin();
  const [salonResult, styleResult, stylistResult] = await Promise.all([
    admin
      .from("salons")
      .select(
        "id,status,is_discoverable,subscription_status,accepting_bookings,time_zone,hours,booking_settings,is_closed_override,closed_override_date",
      )
      .eq("id", input.salonId)
      .single(),
    admin
      .from("styles")
      .select("id,salon_id,duration_min_hours,buffer_minutes")
      .eq("id", input.styleId)
      .eq("salon_id", input.salonId)
      .single(),
    admin
      .from("stylists")
      .select("id,name,availability,is_active")
      .eq("salon_id", input.salonId)
      .eq("is_active", true),
  ]);
  if (salonResult.error || styleResult.error)
    throw new Error("SALON_OR_STYLE_QUERY_FAILED");
  if (!salonResult.data || !styleResult.data)
    throw new Error("Salon or style not found.");
  const salon = salonResult.data as Row;
  const style = styleResult.data as Row;
  const timeZone = salonTimeZone(salon.time_zone);
  const rangeStart = zonedLocalToUtc(`${fromDate}T00:00`, timeZone);
  const through = addMinutesToLocal(fromDate, "00:00", days * 24 * 60).date;
  const rangeEnd = zonedLocalToUtc(`${through}T00:00`, timeZone);
  const now = new Date().toISOString();
  const normalizedEmail = String(input.guestEmail || "").trim().toLowerCase();
  const [
    bookingsResult,
    intentsResult,
    blockoutsResult,
    customerBookings,
    emailBookings,
    customerIntents,
    emailIntents,
  ] = await Promise.all([
    admin
      .from("bookings")
      .select("id,stylist_id,appointment_datetime,blocked_until,status")
      .eq("salon_id", input.salonId)
      .lt("appointment_datetime", rangeEnd.toISOString())
      .gt("blocked_until", rangeStart.toISOString()),
    admin
      .from("booking_checkout_intents")
      .select(
        "id,stylist_id,appointment_datetime,blocked_until,status,expires_at",
      )
      .eq("salon_id", input.salonId)
      .eq("status", "Pending")
      .gt("expires_at", now)
      .lt("appointment_datetime", rangeEnd.toISOString())
      .gt("blocked_until", rangeStart.toISOString()),
    admin
      .from("salon_blockouts")
      .select("id,stylist_id,starts_at,ends_at")
      .eq("salon_id", input.salonId)
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString()),
    input.customerId
      ? admin
          .from("bookings")
          .select("id,appointment_datetime,blocked_until,status")
          .eq("customer_id", input.customerId)
          .lt("appointment_datetime", rangeEnd.toISOString())
          .gt("blocked_until", rangeStart.toISOString())
      : Promise.resolve({ data: [], error: null }),
    normalizedEmail
      ? admin
          .from("bookings")
          .select("id,appointment_datetime,blocked_until,status")
          .eq("normalized_guest_email", normalizedEmail)
          .lt("appointment_datetime", rangeEnd.toISOString())
          .gt("blocked_until", rangeStart.toISOString())
      : Promise.resolve({ data: [], error: null }),
    input.customerId
      ? admin
          .from("booking_checkout_intents")
          .select("id,appointment_datetime,blocked_until,status,expires_at")
          .eq("customer_id", input.customerId)
          .eq("status", "Pending")
          .gt("expires_at", now)
          .lt("appointment_datetime", rangeEnd.toISOString())
          .gt("blocked_until", rangeStart.toISOString())
      : Promise.resolve({ data: [], error: null }),
    normalizedEmail
      ? admin
          .from("booking_checkout_intents")
          .select("id,appointment_datetime,blocked_until,status,expires_at")
          .eq("normalized_guest_email", normalizedEmail)
          .eq("status", "Pending")
          .gt("expires_at", now)
          .lt("appointment_datetime", rangeEnd.toISOString())
          .gt("blocked_until", rangeStart.toISOString())
      : Promise.resolve({ data: [], error: null }),
  ]);
  const active = (row: Row) =>
    row.id !== input.excludeBookingId &&
    !["cancelled", "canceled"].includes(String(row.status).toLowerCase());
  return {
    salon,
    style,
    roster: assertResult(stylistResult, "stylists"),
    bookings: assertResult(bookingsResult, "bookings").filter(active),
    intents: assertResult(intentsResult, "checkout intents"),
    blockouts: assertResult(blockoutsResult, "blockouts"),
    customerBusy: [
      ...assertResult(customerBookings, "customer bookings"),
      ...assertResult(emailBookings, "email bookings"),
      ...assertResult(customerIntents, "customer intents"),
      ...assertResult(emailIntents, "email intents"),
    ].filter(active),
    timeZone,
  };
}

function availabilityForDate(
  data: AvailabilityData,
  input: AvailabilityInput,
  date: string,
) {
  const { salon, style, timeZone } = data;
  if (
    salon.status !== "Active" ||
    salon.is_discoverable !== true ||
    salon.accepting_bookings === false ||
    !["active", "trialing"].includes(
      String(salon.subscription_status || "").toLowerCase(),
    )
  )
    return {
      slots: [],
      timeZone,
      reason: "This salon is not accepting marketplace bookings right now.",
    };
  if (isSalonClosedOn(salon, date))
    return {
      slots: [],
      timeZone,
      reason: "This salon is closed today. Choose another date.",
    };
  const requested = input.stylistId
    ? data.roster.filter((row) => row.id === input.stylistId)
    : data.roster;
  const resources = requested.length
    ? requested
    : input.stylistId
      ? []
      : [{ id: null, availability: {} }];
  const day = dayName(date);
  const salonHours = hoursRange((salon.hours as Row | null)?.[day]);
  if (!salonHours || salonHours.closed)
    return {
      slots: [],
      timeZone,
      reason: "The salon is closed or has not published hours for this day.",
    };
  const durationMinutes = Math.max(
    1,
    Math.round(Number(style.duration_min_hours || 0) * 60),
  );
  const bufferMinutes = Math.max(
    0,
    Number(
      style.buffer_minutes ??
        (salon.booking_settings as Row | null)?.buffer_minutes ??
        15,
    ),
  );
  const slotStep = Math.max(
    15,
    Number((salon.booking_settings as Row | null)?.slot_minutes || 30),
  );
  const openMinute = minutes(salonHours.open) ?? 0;
  const closeMinute = minutes(salonHours.close) ?? 0;
  const slots: Array<{
    value: string;
    label: string;
    stylistId: string | null;
    stylistName: string;
  }> = [];
  for (
    let cursor = openMinute;
    cursor + durationMinutes + bufferMinutes <= closeMinute;
    cursor += slotStep
  ) {
    const value = hhmm(cursor);
    const start = zonedLocalToUtc(`${date}T${value}`, timeZone).getTime();
    const end = start + (durationMinutes + bufferMinutes) * 60_000;
    if (start <= Date.now() + 30 * 60_000) continue;
    if (
      data.customerBusy.some((row) =>
        overlaps(start, end, row.appointment_datetime, row.blocked_until),
      )
    )
      continue;
    const available = resources.filter((resource) => {
      const resourceId = resource.id ? String(resource.id) : null;
      const stylistHours = resourceId
        ? hoursRange((resource.availability as Row | null)?.[day])
        : null;
      if (resourceId && !stylistHours) return false;
      if (stylistHours?.closed) return false;
      if (stylistHours) {
        const stylistOpen = minutes(stylistHours.open) ?? 0;
        const stylistClose = minutes(stylistHours.close) ?? 0;
        if (
          cursor < stylistOpen ||
          cursor + durationMinutes + bufferMinutes > stylistClose
        )
          return false;
      }
      const matches = (row: Row) =>
        !row.stylist_id ||
        (resourceId ? row.stylist_id === resourceId : !resourceId);
      return (
        !data.bookings.some(
          (row) =>
            matches(row) &&
            overlaps(start, end, row.appointment_datetime, row.blocked_until),
        ) &&
        !data.intents.some(
          (row) =>
            matches(row) &&
            overlaps(start, end, row.appointment_datetime, row.blocked_until),
        ) &&
        !data.blockouts.some(
          (row) =>
            (!row.stylist_id || row.stylist_id === resourceId) &&
            overlaps(start, end, row.starts_at, row.ends_at),
        )
      );
    });
    for (const resource of input.includeAllStylists ? available : available.slice(0, 1))
      slots.push({
        value,
        label: slotLabel(value),
        stylistId: resource.id ? String(resource.id) : null,
        stylistName: String(resource.name || "Any available stylist"),
      });
  }
  return {
    slots,
    timeZone,
    durationMinutes,
    bufferMinutes,
    reason: slots.length ? "" : "No open times remain for this day.",
  };
}

export async function bookingAvailability(
  input: AvailabilityInput & { date: string },
) {
  const data = await loadAvailabilityData(input, input.date, 1);
  return availabilityForDate(data, input, input.date);
}

export async function nextAvailableSlot(
  input: AvailabilityInput & {
    afterDate: string;
    afterTime?: string;
  },
) {
  // One metadata load and one bounded set of occupancy queries replaces the
  // former 45 × bookingAvailability waterfall (hundreds of requests).
  const data = await loadAvailabilityData(input, input.afterDate, 45);
  let cursor = input.afterDate;
  for (let day = 0; day < 45; day += 1) {
    const availability = availabilityForDate(data, input, cursor);
    const slots = availability.slots.filter(
      (slot) =>
        day > 0 || !input.afterTime || String(slot.value) > input.afterTime,
    );
    if (slots.length)
      return { ...slots[0], date: cursor, timeZone: availability.timeZone };
    cursor = addMinutesToLocal(cursor, "00:00", 24 * 60).date;
  }
  return null;
}
