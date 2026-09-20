import { isValidTimeZone, zonedLocalToUtc } from "@/lib/dateTime";

type SavedWindow = { starts_at?: unknown; ends_at?: unknown; timezone?: unknown };

/** datetime-local has no offset. Render the offer's declared wall clock,
 * regardless of the device time zone; never put a UTC wall clock in that field. */
export function promotionLocalDateTime(value: unknown, timeZone: string) {
  if (!value) return "";
  const date = new Date(String(value));
  if (!isValidTimeZone(timeZone) || !Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (key: string) => parts.find(item => item.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function promotionDateWindow(start: string, end: string, requestedZone: string, previous: SavedWindow = {}) {
  const timezone = requestedZone.trim();
  if (!isValidTimeZone(timezone)) throw Error("Choose a valid offer time zone.");
  const convert = (local: string, saved: unknown) => {
    // Preserve an untouched existing instant, including its seconds and the
    // later occurrence of a repeated DST hour. Editing a title is not rescheduling.
    if (saved && timezone === String(previous.timezone || "").trim() && local === promotionLocalDateTime(saved, timezone) && Number.isFinite(Date.parse(String(saved)))) return new Date(String(saved)).toISOString();
    if (!local) {
      if (saved && !Number.isFinite(Date.parse(String(saved)))) throw Error("Choose a valid offer date and time.");
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw Error("Choose a valid offer date and time.");
    // Reject overflowed calendar dates before the canonical DST conversion.
    const wall = new Date(local + ":00Z");
    if (!Number.isFinite(wall.getTime()) || wall.toISOString().slice(0, 16) !== local) throw Error("Choose a valid offer date and time.");
    let instant: Date;
    try { instant = zonedLocalToUtc(local, timezone); }
    catch { throw Error("That time does not exist in the offer's time zone. Choose another time."); }
    // The shared converter chooses the first occurrence. A newly chosen offer
    // boundary must not silently choose one of two possible instants.
    for (let minutes = 1; minutes <= 180; minutes++) {
      if (promotionLocalDateTime(new Date(instant.getTime() + minutes * 60_000).toISOString(), timezone) === local) throw Error("That time occurs twice in the offer's time zone. Choose a time outside the repeated hour.");
    }
    return instant.toISOString();
  };
  const starts_at = convert(start, previous.starts_at), ends_at = convert(end, previous.ends_at);
  if (starts_at && ends_at && Date.parse(ends_at) <= Date.parse(starts_at)) throw Error("The offer must end after it starts.");
  return { starts_at, ends_at, timezone };
}
