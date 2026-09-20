const LOCAL_APPOINTMENT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function rescheduleLocalTimestamp(value: unknown, timeZone: string) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function normalizeRescheduleLocalOptions(
  values: unknown,
  clean: (value: unknown, maxLength: number) => string,
) {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const options: Array<{ local: string; stylistId: string | null }> = [];
  for (const value of values) {
    const row: Record<string, unknown> =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : { local: value };
    const local = clean(row.local, 20);
    const stylistId = clean(row.stylistId ?? row.stylist_id, 60) || null;
    if (!LOCAL_APPOINTMENT_PATTERN.test(local)) continue;
    const key = `${local}:${stylistId || "salon"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ local, stylistId });
  }
  return options;
}

export function previewRescheduleResponse<T extends { appointment_datetime: string }>(
  booking: T,
  response: "accept" | "decline",
  selectedAppointment?: string,
) {
  if (response === "accept" && !selectedAppointment) {
    throw new Error("Choose an appointment time to accept.");
  }
  return response === "accept"
    ? {
        ...booking,
        appointment_datetime: selectedAppointment as string,
      }
    : { ...booking };
}
