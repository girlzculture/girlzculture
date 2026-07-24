const LOCAL_APPOINTMENT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function normalizeRescheduleLocalOptions(
  values: unknown,
  clean: (value: unknown, maxLength: number) => string,
) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((value) => clean(value, 20))
        .filter((value) => LOCAL_APPOINTMENT_PATTERN.test(value)),
    ),
  ];
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
