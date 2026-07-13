export const DEFAULT_TIME_ZONE = "America/New_York";

export function isValidTimeZone(value: unknown): value is string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: String(value) }).format();
    return Boolean(value);
  } catch {
    return false;
  }
}

export function salonTimeZone(value: unknown) {
  return isValidTimeZone(value) ? String(value) : DEFAULT_TIME_ZONE;
}

function partsAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function zonedLocalToUtc(localDateTime: string, requestedTimeZone: unknown) {
  const timeZone = salonTimeZone(requestedTimeZone);
  const match = localDateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Choose a valid appointment date and time.");
  const [, year, month, day, hour, minute] = match;
  const utcWallClock = Date.UTC(+year, +month - 1, +day, +hour, +minute, 0, 0);
  let candidate = new Date(utcWallClock);
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = partsAt(candidate, timeZone);
    const represented = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    candidate = new Date(candidate.getTime() + (utcWallClock - represented));
  }
  const check = partsAt(candidate, timeZone);
  if (`${check.year}-${check.month}-${check.day}T${check.hour}:${check.minute}` !== localDateTime) {
    throw new Error("That local time does not exist in the salon’s timezone. Choose another time.");
  }
  return candidate;
}

export function formatInTimeZone(value: unknown, requestedTimeZone: unknown, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: salonTimeZone(requestedTimeZone),
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(date);
}

export function dateKeyInTimeZone(value: unknown, requestedTimeZone: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  const parts = partsAt(date, salonTimeZone(requestedTimeZone));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function timeLabelInTimeZone(value: unknown, requestedTimeZone: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "Time not recorded";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: salonTimeZone(requestedTimeZone),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function slotLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const marker = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${marker}`;
}

export function addMinutesToLocal(date: string, time: string, minutes: number) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes));
  return {
    date: next.toISOString().slice(0, 10),
    time: next.toISOString().slice(11, 16),
  };
}
