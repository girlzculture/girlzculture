export type BookingReferenceRecord = {
  public_reference?: unknown;
  confirmation_code?: unknown;
  id?: unknown;
};

export function bookingReference(
  booking: BookingReferenceRecord | null | undefined,
  fallback = "Pending",
) {
  const reference = String(
    booking?.public_reference || booking?.confirmation_code || "",
  ).trim();
  if (reference) return reference;
  const id = String(booking?.id || "").trim();
  return id ? id.slice(0, 8) : fallback;
}

export function bookingSearchTerms(value: unknown) {
  const term = String(value || "").trim();
  if (!term) return { publicReference: "", uuid: "" };
  return /^GC-[A-Z]+-\d{2}$/i.test(term)
    ? { publicReference: term.toUpperCase(), uuid: "" }
    : /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(term)
      ? { publicReference: "", uuid: term.toLowerCase() }
      : { publicReference: term.toUpperCase(), uuid: term };
}

export function bookingPublicReferenceFromNumber(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Booking reference sequence values must be positive integers.");
  }
  let cursor = Math.floor((value - 1) / 99) + 1;
  let letters = "";
  while (cursor > 0) {
    cursor -= 1;
    letters = String.fromCharCode(65 + (cursor % 26)) + letters;
    cursor = Math.floor(cursor / 26);
  }
  const suffix = ((value - 1) % 99) + 1;
  return `GC-${letters}-${String(suffix).padStart(2, "0")}`;
}
