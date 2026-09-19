import { dateKeyInTimeZone, isValidTimeZone, zonedLocalToUtc } from "@/lib/dateTime";

type Row = Record<string, unknown>;
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const shift = (day: string, n: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10); };
const midnight = (day: string, zone: string) => zonedLocalToUtc(`${day}T00:00`, zone).getTime();
const round = (n: number) => Math.round(n * 100) / 100;

/** Aggregate only the already authorized, fully paginated booking read. Never
 * infer opening hours, demand or spare capacity from a historical zero. */
export function businessAppointmentPatterns(rows: Row[], input: { start: unknown; end: unknown; timeZone: string; now?: number }) {
  const start = Date.parse(String(input.start)), end = Math.min(Date.parse(String(input.end)), input.now ?? Date.now());
  if (!isValidTimeZone(input.timeZone) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 367 * 86400000 || rows.length > 100_000) throw Error("PATTERN_INVALID_WINDOW");
  let from = dateKeyInTimeZone(new Date(start), input.timeZone);
  if (start > midnight(from, input.timeZone)) from = shift(from, 1);
  const exclusive = dateKeyInTimeZone(new Date(end), input.timeZone), to = shift(exclusive, -1);
  const occurrences = new Map<string, number>();
  let days = 0;
  for (let day = from; day < exclusive; day = shift(day, 1)) { const weekday = weekdays[new Date(`${day}T12:00:00Z`).getUTCDay()]; occurrences.set(weekday, (occurrences.get(weekday) || 0) + 1); days++; }
  const ids = new Set<string>(), buckets = new Map<string, { weekday: string; start_hour: number; end_hour: number; completed_count: number; observed_calendar_days: number }>();
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone, hour: "numeric", hourCycle: "h23" });
  let completed = 0, excludedPartial = 0;
  for (const row of rows) {
    const at = Date.parse(String(row.appointment_datetime));
    if (typeof row.id !== "string" || !row.id || ids.has(row.id) || !Number.isFinite(at) || typeof row.status !== "string") throw Error("PATTERN_INVALID_RECORD");
    ids.add(row.id);
    if (row.status.toLowerCase() !== "completed") continue;
    const date = dateKeyInTimeZone(new Date(at), input.timeZone);
    if (date < from || date >= exclusive) { excludedPartial++; continue; }
    const weekday = weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
    const startHour = Math.floor(Number(hour.format(new Date(at))) / 6) * 6;
    const key = `${weekday}:${startHour}`;
    const bucket = buckets.get(key) || { weekday, start_hour: startHour, end_hour: startHour + 6, completed_count: 0, observed_calendar_days: occurrences.get(weekday) || 0 };
    bucket.completed_count++; completed++; buckets.set(key, bucket);
  }
  const observed = [...buckets.values()].map(row => ({ ...row, appointments_per_calendar_day: round(row.completed_count / row.observed_calendar_days) })).sort((a, b) => a.appointments_per_calendar_day - b.appointments_per_calendar_day || weekdays.indexOf(a.weekday) - weekdays.indexOf(b.weekday) || a.start_hour - b.start_hour);
  const comparable = days >= 14 ? observed.filter(row => row.observed_calendar_days >= 2) : [];
  const middle = Math.floor(comparable.length / 2);
  const median = comparable.length ? (comparable.length % 2 ? comparable[middle].appointments_per_calendar_day : (comparable[middle - 1].appointments_per_calendar_day + comparable[middle].appointments_per_calendar_day) / 2) : null;
  const lower = median === null ? [] : comparable.filter(row => row.appointments_per_calendar_day < median).map(row => ({ ...row, comparison_median: round(median) }));
  return { from: days ? from : null, to: days ? to : null, time_zone: input.timeZone, complete_local_days: days, completed_count: completed,
    excluded_partial_or_future_completed_count: excludedPartial, sufficient_comparison_window: days >= 14,
    observed_period_count: observed.length, observed_periods_shown: Math.min(observed.length, 12), observed_periods_are_excerpt: observed.length > 12, observed_periods: observed.slice(0, 12),
    lower_period_count: lower.length, lower_periods_shown: Math.min(lower.length, 6), lower_periods_are_excerpt: lower.length > 6, lower_observed_periods: lower.slice(0, 6),
    definition: "Own authorized booking records only, marketplace and business-added appointments. Completed status only; appointment start time in the business timezone. Partial local days and future dates are excluded. Weekday periods are 00–06, 06–12, 12–18 and 18–24. Counts are per calendar occurrence, not opening day. Compare only periods with at least one recorded completed appointment and two calendar occurrences, over at least fourteen complete local days. Lower counts are relative to the median of those observed periods; never call a period with no observations slow. Historical opening hours, closures, unrecorded visits, service duration, demand and staffing capacity are unknown. This is not historical capacity or a forecast; review the current calendar before suggesting an action. No customer or professional identity is included." };
}
