import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  addMinutesToLocal,
  salonTimeZone,
  slotLabel,
  zonedLocalToUtc,
} from "@/lib/dateTime";
import { isSalonClosedOn } from "@/lib/salonOpenStatus";
import { professionalOffersService } from "@/lib/professionalServices";

type Row = Record<string, unknown>;
type HoursRange = { open: string; close: string; closed: boolean };
type AvailabilityInput = {
  salonId: string;
  styleId?: string | null;
  stylistId?: string | null;
  customerId?: string | null;
  guestEmail?: string | null;
  excludeBookingId?: string | null;
  includeAllStylists?: boolean;
  /** Trusted existing appointment terms; public callers do not accept these fields. */
  durationMinutes?: number;
  bufferMinutes?: number;
};
export type AvailabilityData = {
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
  result: { data: unknown; count?: number | null; error?: { message?: string } | null },
  label: string,
) {
  if (result.error) throw new Error(`${label.toUpperCase()}_QUERY_FAILED`);
  if (result.count != null && result.count > ((result.data || []) as Row[]).length) throw new Error(`${label.toUpperCase()}_RESULT_TRUNCATED`);
  return (result.data || []) as Row[];
}

async function loadAvailabilityData(
  input: AvailabilityInput,
  fromDate: string,
  days: number,
  strict = false,
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
    input.styleId ? admin
      .from("styles")
      .select("id,salon_id,duration_min_hours,buffer_minutes")
      .eq("id", input.styleId)
      .eq("salon_id", input.salonId)
      .single() : Promise.resolve({ data: {}, error: null }),
    admin
      .from("stylists")
      .select("id,salon_id,name,availability,is_active,is_draft,assigned_service_ids", { count: "exact" })
      .eq("salon_id", input.salonId)
      .is("archived_at", null),
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
      .select("id,salon_id,stylist_id,appointment_datetime,blocked_until,status", { count: "exact" })
      .eq("salon_id", input.salonId)
      .lt("appointment_datetime", rangeEnd.toISOString())
      .gt("blocked_until", rangeStart.toISOString()),
    admin
      .from("booking_checkout_intents")
      .select(
        "id,salon_id,stylist_id,appointment_datetime,blocked_until,status,expires_at", { count: "exact" },
      )
      .eq("salon_id", input.salonId)
      .eq("status", "Pending")
      .gt("expires_at", now)
      .lt("appointment_datetime", rangeEnd.toISOString())
      .gt("blocked_until", rangeStart.toISOString()),
    admin
      .from("salon_blockouts")
      .select("id,salon_id,stylist_id,starts_at,ends_at", { count: "exact" })
      .eq("salon_id", input.salonId)
      .is("released_at", null)
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
  if (strict) {
    // Opportunity totals must never label a truncated response as full capacity.
    for (const result of [stylistResult, bookingsResult, intentsResult, blockoutsResult]) {
      if (result.error || !Array.isArray(result.data) || typeof result.count !== "number" || result.count !== result.data.length || result.count > 1000) throw Error("SCHEDULE_EVIDENCE_INCOMPLETE");
      if (result.data.some(row => row.salon_id !== input.salonId)) throw Error("SCHEDULE_ACCESS_DENIED");
    }
    if (salon.id !== input.salonId || (stylistResult.data || []).length > 50) throw Error("SCHEDULE_EVIDENCE_INCOMPLETE");
  }
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

/** Server-only, bounded canonical evidence for the protected operating view.
 * No customer lookup, discovery query or service-fit promise is introduced. */
export function loadCalendarOpportunityEvidence(salonId: string, date: string) {
  return loadAvailabilityData({ salonId }, date, 7, true);
}

/** Private service-fit reader. Callers supply only server-verified duration;
 * unlike the public endpoint this requires complete own-business evidence. */
export async function serviceAvailabilityWindow(input: { salonId: string; styleId: string; stylistId: string | null; date: string; days: number; durationMinutes: number; bufferMinutes?: number }) {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 7 || !Number.isInteger(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 1440) throw Error("SERVICE_CAPACITY_INVALID_INPUT");
  const data = await loadAvailabilityData(input, input.date, input.days, true);
  if (data.style.id !== input.styleId || data.style.salon_id !== input.salonId) throw Error("SCHEDULE_ACCESS_DENIED");
  // Unknown occupancy must never become apparently available time.
  for (const [rows, start, end] of [[data.bookings, "appointment_datetime", "blocked_until"], [data.intents, "appointment_datetime", "blocked_until"], [data.blockouts, "starts_at", "ends_at"]] as const) {
    for (const row of rows) if (!Number.isFinite(Date.parse(String(row[start]))) || !Number.isFinite(Date.parse(String(row[end]))) || Date.parse(String(row[end])) <= Date.parse(String(row[start]))) throw Error("SCHEDULE_EVIDENCE_INCOMPLETE");
  }
  const buffer = input.bufferMinutes ?? data.style.buffer_minutes ?? (data.salon.booking_settings as Row | null)?.buffer_minutes ?? 15;
  const step = (data.salon.booking_settings as Row | null)?.slot_minutes ?? 30;
  if (typeof buffer !== "number" || !Number.isInteger(buffer) || buffer < 0 || buffer > 180 || typeof step !== "number" || !Number.isInteger(step) || step < 15 || step > 1440) throw Error("SCHEDULE_EVIDENCE_INCOMPLETE");
  return { style: data.style, timeZone: data.timeZone, bufferMinutes: buffer,
    dates: Array.from({ length: input.days }, (_, offset) => {
      const date = addMinutesToLocal(input.date, "00:00", offset * 1440).date;
      return { date, ...availabilityForDate(data, { ...input, bufferMinutes: buffer, includeAllStylists: true }, date) };
    }),
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
  const eligible = data.roster.filter(row => professionalOffersService(row, String(style.id || input.styleId || "")));
  const requested = input.stylistId
    ? eligible.filter((row) => row.id === input.stylistId)
    : eligible;
  const resources = requested.length
    ? requested
    : input.stylistId || data.roster.length
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
    Math.round(input.durationMinutes ?? Number(style.duration_min_hours || 0) * 60),
  );
  const bufferMinutes = Math.max(
    0,
    Number(
      input.bufferMinutes ?? style.buffer_minutes ??
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

/** Owner calendar query: no service or marketplace visibility is required.
 * The same hours, resources, bookings, checkout holds and overrides feed both
 * this operational view and the public service-fit query above. */
export async function calendarAvailability(input: { salonId: string; date: string; stylistId?: string | null; excludeBookingId?: string | null }) {
  const data = await loadAvailabilityData(input, input.date, 1);
  const day = dayName(input.date);
  const hours = hoursRange((data.salon.hours as Row | null)?.[day]);
  const gaps: { start: string; end: string; stylist_id: string | null; professional_name: string | null }[] = [];
  if (!hours || hours.closed || isSalonClosedOn(data.salon, input.date)) return { date: input.date, time_zone: data.timeZone, gaps };
  const resources = data.roster.length ? data.roster.filter(row => row.is_active !== false) : [{ id: null, name: null, availability: {} }];
  for (const resource of resources) {
    const id = resource.id ? String(resource.id) : null;
    if (input.stylistId && input.stylistId !== id) continue;
    const own = id ? hoursRange((resource.availability as Row | null)?.[day]) : hours;
    if (!own || own.closed) continue;
    const open = Math.max(minutes(hours.open)!, minutes(own.open)!);
    const close = Math.min(minutes(hours.close)!, minutes(own.close)!);
    if (close <= open) continue;
    const left = Math.max(zonedLocalToUtc(input.date + "T" + hhmm(open), data.timeZone).getTime(), Math.ceil(Date.now() / 60000) * 60000);
    const right = zonedLocalToUtc(input.date + "T" + hhmm(close), data.timeZone).getTime();
    let free = left < right ? [[left, right]] : [];
    const busy = [...data.bookings.map(row => ({ ...row, starts_at: row.appointment_datetime, ends_at: row.blocked_until })), ...data.intents.map(row => ({ ...row, starts_at: row.appointment_datetime, ends_at: row.blocked_until })), ...data.blockouts] as Row[];
    for (const row of busy) {
      if (row.stylist_id && id && row.stylist_id !== id) continue;
      const start = Date.parse(String(row.starts_at)), end = Date.parse(String(row.ends_at));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("INVALID_CALENDAR_OCCUPANCY");
      free = free.flatMap(([a,b]) => end <= a || start >= b ? [[a,b]] : [...(a < start ? [[a,start]] : []), ...(end < b ? [[end,b]] : [])]);
    }
    for (const [start,end] of free) gaps.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), stylist_id: id, professional_name: resource.name ? String(resource.name) : null });
  }
  return { date: input.date, time_zone: data.timeZone, gaps };
}
