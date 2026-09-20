type Row = Record<string, unknown>;

/** The current confirmed appointment controls the window, not a proposed date.
 * A cancellation closes it immediately; closing never deletes its history. */
export function bookingConversationWindow(booking: Row, now = Date.now()) {
  const start = new Date(String(booking.appointment_datetime || "")).getTime();
  const hours = Number(booking.duration_hours);
  const valid = Number.isFinite(start) && Number.isFinite(hours) && hours > 0;
  const closes = valid ? start + hours * 3_600_000 + 86_400_000 : NaN;
  const cancelled = /cancel|declined|expired|rejected/i.test(String(booking.status || ""));
  const participant = booking.booking_origin !== "business_added" || Boolean(booking.customer_id);
  return {
    open: participant && !cancelled && valid && now < closes,
    closesAt: valid ? new Date(closes).toISOString() : null,
    reason: !participant ? "participant_required" : cancelled ? "cancelled" : !valid ? "date_unavailable" : now >= closes ? "expired" : "open",
  };
}

export function conversationUnread(messages: Row[], role: string) {
  const readColumn = role === "customer" ? "read_by_customer_at" : "read_by_salon_at";
  return messages.filter(message => message.sender_role !== role && !message[readColumn]).length;
}
