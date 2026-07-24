type Row = Record<string, unknown>;

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      (
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        } as Record<string, string>
      )[character] || character,
  );
}

function money(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(number)
    : "$0.00";
}

function labelList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function selectedOptionLabels(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value as Record<string, unknown>).flatMap(labelList);
}

function row(label: string, value: unknown, emphasized = false) {
  if (value === null || value === undefined || value === "") return "";
  return `<tr><td style="padding:7px 0;color:#5f5664;font-size:13px">${escapeHtml(label)}</td><td style="padding:7px 0;text-align:right;color:#1A1220;font-size:13px;${emphasized ? "font-weight:800" : "font-weight:600"}">${escapeHtml(value)}</td></tr>`;
}

function card(title: string, rows: string) {
  return `<table role="presentation" width="100%" style="margin-top:18px;border:1px solid #eadce4;border-radius:14px;background:#fff;border-collapse:separate;padding:16px"><tr><td colspan="2" style="padding-bottom:8px;font-family:Georgia,serif;font-size:18px;font-weight:700;color:#5B1A6B">${escapeHtml(title)}</td></tr>${rows}</table>`;
}

function button(label: string, href: string, secondary = false) {
  if (!/^https?:\/\//i.test(href)) return "";
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:8px 8px 0 0;padding:12px 18px;border-radius:9px;${secondary ? "border:1px solid #D6186B;color:#D6186B;background:#fff" : "color:#fff;background:#D6186B"};font-size:13px;font-weight:800;text-decoration:none">${escapeHtml(label)}</a>`;
}

function shell(
  title: string,
  intro: string,
  content: string,
  footer: string,
  emailLogoUrl?: string,
) {
  const logo = emailLogoUrl && /^https:\/\//i.test(emailLogoUrl)
    ? `<img src="${escapeHtml(emailLogoUrl)}" alt="Girlz Culture" width="210" style="display:block;max-width:210px;max-height:70px;width:auto;height:auto;border:0" />`
    : `<div style="font-family:Georgia,serif;font-size:27px;font-weight:800;color:#5B1A6B">Girlz Culture<span style="color:#D6186B">.</span></div>`;
  return `<!doctype html><html><body style="margin:0;background:#FBF4EE;font-family:Arial,sans-serif;color:#1A1220"><table role="presentation" width="100%" style="background:#FBF4EE"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" style="max-width:680px;border-radius:18px;background:#fffaf7;padding:28px;border:1px solid #eadce4"><tr><td>${logo}<h1 style="margin:22px 0 8px;font-family:Georgia,serif;font-size:30px;line-height:1.1;color:#5B1A6B">${escapeHtml(title)}</h1><p style="margin:0;color:#5f5664;font-size:14px;line-height:1.6">${escapeHtml(intro)}</p>${content}<p style="margin:24px 0 0;color:#776d7a;font-size:11px;line-height:1.6">${escapeHtml(footer)}</p></td></tr></table></td></tr></table></body></html>`;
}

export type BookingCommunicationInput = {
  booking: Row;
  salon: Row;
  style?: Row | null;
  stylist?: Row | null;
  material?: Row | null;
  when: string;
  duration: string;
  depositPercentage: number;
  manageUrl?: string;
  dashboardUrl?: string;
  directionsUrl?: string;
  receiptUrl?: string;
  policy: string;
  intro: string;
  footer: string;
  emailLogoUrl?: string;
};

function bookingIdentity(input: BookingCommunicationInput) {
  const { booking } = input;
  return (
    row("Confirmation code", booking.confirmation_code || "Pending") +
    row("Booking ID", booking.id) +
    row("Salon", input.salon.name) +
    row("Address", input.salon.full_address) +
    row("Salon phone", input.salon.phone) +
    row("Salon email", input.salon.email)
  );
}

function appointmentDetails(input: BookingCommunicationInput) {
  const { booking, style, stylist, material } = input;
  const options = [
    booking.selected_size ? `Size: ${booking.selected_size}` : "",
    booking.selected_length ? `Length: ${booking.selected_length}` : "",
    ...labelList(booking.selected_addons),
    ...selectedOptionLabels(booking.selected_options),
  ].filter(Boolean);
  return (
    row("Service", style?.name || "Braiding service") +
    row("Selected options & add-ons", options.join(", ") || "None") +
    row("Hair / material", material?.name || material?.brand || "Not selected") +
    row("Stylist", stylist?.name || "Salon assigned") +
    row("Appointment", input.when) +
    row("Salon timezone", input.salon.time_zone || "America/New_York") +
    row("Estimated duration", input.duration)
  );
}

function priceDetails(input: BookingCommunicationInput) {
  const { booking, style } = input;
  const promotionSnapshot =
    booking.promotion_snapshot &&
    typeof booking.promotion_snapshot === "object" &&
    !Array.isArray(booking.promotion_snapshot)
      ? booking.promotion_snapshot as Row
      : {};
  const promotionDiscount =
    Number(booking.promotion_discount_amount || 0) +
    Number(booking.discount_amount || 0);
  const total = Number(booking.estimated_total || 0);
  const deposit = Number(booking.deposit_amount || 0);
  return (
    row(
      "Original service price",
      money(
        booking.subtotal_before_promotion ||
          style?.base_price ||
          style?.price_display_min,
      ),
    ) +
    row(
      "Options / add-ons",
      money(
        Math.max(
          0,
          Number(booking.subtotal_before_promotion || total) -
            Number(style?.base_price || style?.price_display_min || 0),
        ),
      ),
    ) +
    row(
      promotionSnapshot.title ? `Promotion: ${String(promotionSnapshot.title)}` : "Promotion / discount",
      promotionDiscount ? `-${money(promotionDiscount)}` : "$0.00",
    ) +
    row("Adjusted total", money(total), true) +
    row("Reservation deposit", `${input.depositPercentage}%`) +
    row("Deposit paid", money(deposit)) +
    row("Balance due at salon", money(booking.balance_due), true) +
    row(
      "Payment method",
      booking.payment_method_label ||
        (deposit > 0 ? "Secure card payment" : "No payment required"),
    )
  );
}

export function renderCustomerBookingConfirmation(
  input: BookingCommunicationInput,
) {
  const actions =
    `<div style="margin-top:18px">${button("Manage booking", input.manageUrl || "")}${button("Get directions", input.directionsUrl || "", true)}${button("Stripe receipt", input.receiptUrl || "", true)}</div>`;
  const content =
    card("Booking reference", bookingIdentity(input)) +
    card("Appointment", appointmentDetails(input)) +
    card("Price breakdown", priceDetails(input)) +
    card(
      "Cancellation & rescheduling",
      `<tr><td colspan="2" style="padding:7px 0;color:#5f5664;font-size:13px;line-height:1.6">${escapeHtml(input.policy)}</td></tr>`,
    ) +
    actions;
  return shell(
    "Your appointment is confirmed",
    input.intro,
    content,
    input.footer,
    input.emailLogoUrl,
  );
}

export function renderSalonBookingConfirmation(
  input: BookingCommunicationInput,
) {
  const { booking } = input;
  const customerRows =
    row("Customer", booking.guest_name) +
    row("Email", booking.guest_email) +
    row("Phone", booking.guest_phone) +
    row("Customer notes", booking.client_notes || "None");
  const collectionRows =
    row("Deposit collected", money(booking.deposit_amount)) +
    row("Collect at salon", money(booking.balance_due), true);
  const content =
    card("Booking reference", bookingIdentity(input)) +
    card("Customer", customerRows) +
    card("Appointment", appointmentDetails(input)) +
    card("Price breakdown", priceDetails(input)) +
    card("Salon collection", collectionRows) +
    `<div style="margin-top:18px">${button("Open booking", input.dashboardUrl || "")}</div>`;
  return shell(
    "A new booking is confirmed",
    input.intro,
    content,
    input.footer,
    input.emailLogoUrl,
  );
}

export function renderBookingCancellation(
  input: BookingCommunicationInput & {
    audience: "customer" | "salon";
    cancelledBy: string;
    reason: string;
    refundStatus: string;
    nextAction: string;
    browseUrl?: string;
  },
) {
  const customerRows =
    row("Customer", input.booking.guest_name) +
    row("Customer email", input.booking.guest_email) +
    row("Customer phone", input.booking.guest_phone);
  const cancellationRows =
    row("Cancelled by", input.cancelledBy) +
    row("Reason", input.reason) +
    row("Deposit / refund status", input.refundStatus) +
    row("Next action", input.nextAction);
  const actions =
    input.audience === "customer"
      ? `<div style="margin-top:18px">${button("Manage booking", input.manageUrl || "")}${button("Find another salon", input.browseUrl || "", true)}</div>`
      : `<div style="margin-top:18px">${button("Open booking history", input.dashboardUrl || "")}</div>`;
  return shell(
    "Booking cancellation details",
    input.intro,
    card("Booking reference", bookingIdentity(input)) +
      card("Original appointment", appointmentDetails(input)) +
      (input.audience === "salon" ? card("Customer", customerRows) : "") +
      card("Cancellation", cancellationRows) +
      actions,
    input.footer,
    input.emailLogoUrl,
  );
}
