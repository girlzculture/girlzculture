export type ReminderStage =
  | "claim_booking_reminder"
  | "deliver_booking_reminder"
  | "record_reminder_failure"
  | "complete_booking_reminder_claim";

export type ReminderBatchResult<TDelivery> = {
  bookingId: string;
  reminderHours: number;
  status: "processed" | "failed";
  stage?: ReminderStage;
  delivery?: TDelivery;
  request_id?: string;
};

export type ReminderDeliveryFailure = {
  error: unknown;
  request_id?: string;
};

const REMINDER_DUE_LATE_MINUTES = 30;
const REMINDER_DUE_EARLY_MINUTES = 20;

export function bookingReminderDueWindow({
  now,
  reminderHours,
}: {
  now: number;
  reminderHours: number;
}) {
  const target = now + reminderHours * 60 * 60 * 1_000;
  return {
    from: new Date(target - REMINDER_DUE_LATE_MINUTES * 60 * 1_000).toISOString(),
    to: new Date(target + REMINDER_DUE_EARLY_MINUTES * 60 * 1_000).toISOString(),
  };
}

export function notificationDeliveryKey({
  bookingId,
  eventType,
  recipientType,
  channel,
}: {
  bookingId: string;
  eventType: string;
  recipientType: string;
  channel: string;
}) {
  return `${bookingId}:${eventType}:${recipientType}:${channel}`.slice(0, 240);
}

export async function runIsolatedReminderBatch<TDelivery>({
  bookings,
  reminderHours,
  claim,
  deliver,
  complete,
  recordDeliveryFailure,
  reportFailure,
  getDeliveryFailure,
}: {
  bookings: Array<{ id: string }>;
  reminderHours: number;
  claim: (bookingId: string) => Promise<boolean>;
  deliver: (bookingId: string) => Promise<TDelivery>;
  complete: (bookingId: string) => Promise<void>;
  recordDeliveryFailure: (bookingId: string, reference: string) => Promise<void>;
  reportFailure: (stage: ReminderStage, error: unknown, bookingId: string) => Promise<string>;
  getDeliveryFailure?: (delivery: TDelivery) => ReminderDeliveryFailure | null;
}) {
  const results: Array<ReminderBatchResult<TDelivery>> = [];
  for (const booking of bookings) {
    let claimed = false;
    try {
      claimed = await claim(booking.id);
    } catch (error) {
      const reference = await reportFailure("claim_booking_reminder", error, booking.id);
      results.push({ bookingId: booking.id, reminderHours, status: "failed", stage: "claim_booking_reminder", request_id: reference });
      continue;
    }
    if (!claimed) continue;

    let delivery: TDelivery;
    try {
      delivery = await deliver(booking.id);
    } catch (error) {
      const reference = await reportFailure("deliver_booking_reminder", error, booking.id);
      try {
        await recordDeliveryFailure(booking.id, reference);
      } catch (recordError) {
        await reportFailure("record_reminder_failure", recordError, booking.id);
      }
      results.push({ bookingId: booking.id, reminderHours, status: "failed", stage: "deliver_booking_reminder", request_id: reference });
      continue;
    }

    const reportedDeliveryFailure = getDeliveryFailure?.(delivery) || null;
    if (reportedDeliveryFailure) {
      const reference = reportedDeliveryFailure.request_id || await reportFailure(
        "deliver_booking_reminder",
        reportedDeliveryFailure.error,
        booking.id,
      );
      try {
        await recordDeliveryFailure(booking.id, reference);
      } catch (recordError) {
        await reportFailure("record_reminder_failure", recordError, booking.id);
      }
      results.push({
        bookingId: booking.id,
        reminderHours,
        status: "failed",
        stage: "deliver_booking_reminder",
        delivery,
        request_id: reference,
      });
      continue;
    }

    try {
      await complete(booking.id);
    } catch (error) {
      const reference = await reportFailure("complete_booking_reminder_claim", error, booking.id);
      results.push({ bookingId: booking.id, reminderHours, status: "failed", stage: "complete_booking_reminder_claim", delivery, request_id: reference });
      continue;
    }
    results.push({ bookingId: booking.id, reminderHours, status: "processed", delivery });
  }
  return results;
}
