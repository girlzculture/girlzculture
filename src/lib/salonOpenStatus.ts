import { dateKeyInTimeZone } from "@/lib/dateTime";

type SalonStatusRow = { is_closed_override?: unknown; closed_override_date?: unknown; time_zone?: unknown };
export function isSalonClosedOn(salon: SalonStatusRow, date: string) {
  return Boolean(salon.is_closed_override) && String(salon.closed_override_date || "") === date;
}
export function isSalonClosedToday(salon: SalonStatusRow, now = new Date()) {
  return isSalonClosedOn(salon, dateKeyInTimeZone(now, String(salon.time_zone || "America/New_York")));
}
