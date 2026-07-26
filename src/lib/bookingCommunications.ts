type Row = Record<string, unknown>;
export type EmailBrandTheme = {
  primary: string;
  cta: string;
  page: string;
  card: string;
  heading: string;
  body: string;
  muted: string;
  headingFont: string;
  bodyFont: string;
};
const DEFAULT_EMAIL_THEME: EmailBrandTheme = {
  primary: "#0083A6",
  cta: "#0083A6",
  page: "#FFFFFF",
  card: "#FFFFFF",
  heading: "#0D1114",
  body: "#0D1114",
  muted: "#52616A",
  headingFont: "Playfair Display",
  bodyFont: "Montserrat",
};

function bookingReference(row: Row) {
  return String(
    row.public_reference ||
      row.confirmation_code ||
      row.id ||
      "Reference pending",
  );
}

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

function row(
  label: string,
  value: unknown,
  emphasized = false,
  theme = DEFAULT_EMAIL_THEME,
) {
  if (value === null || value === undefined || value === "") return "";
  return `<tr><td style="padding:7px 0;color:${theme.muted};font-size:13px">${escapeHtml(label)}</td><td style="padding:7px 0;text-align:right;color:${theme.body};font-size:13px;${emphasized ? "font-weight:800" : "font-weight:600"}">${escapeHtml(value)}</td></tr>`;
}

function card(title: string, rows: string, theme = DEFAULT_EMAIL_THEME) {
  return `<table role="presentation" width="100%" style="margin-top:18px;border:1px solid ${theme.primary}33;border-radius:14px;background:${theme.card};border-collapse:separate;padding:16px"><tr><td colspan="2" style="padding-bottom:8px;font-family:'${theme.headingFont}',Georgia,serif;font-size:18px;font-weight:700;color:${theme.heading}">${escapeHtml(title)}</td></tr>${rows}</table>`;
}

function button(
  label: string,
  href: string,
  secondary = false,
  theme = DEFAULT_EMAIL_THEME,
) {
  if (!/^https?:\/\//i.test(href)) return "";
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:8px 8px 0 0;padding:12px 18px;border-radius:9px;${secondary ? `border:1px solid ${theme.cta};color:${theme.cta};background:${theme.card}` : `color:#fff;background:${theme.cta}`};font-size:13px;font-weight:800;text-decoration:none">${escapeHtml(label)}</a>`;
}

function shell(
  title: string,
  intro: string,
  content: string,
  footer: string,
  emailLogoUrl?: string,
  theme = DEFAULT_EMAIL_THEME,
) {
  const logo = emailLogoUrl && /^https:\/\//i.test(emailLogoUrl)
    ? `<img src="${escapeHtml(emailLogoUrl)}" alt="Girlz Culture" width="210" style="display:block;max-width:210px;max-height:70px;width:auto;height:auto;border:0" />`
    : `<div style="font-family:'${theme.headingFont}',Georgia,serif;font-size:27px;font-weight:800;color:${theme.heading}">Girlz Culture<span style="color:${theme.cta}">.</span></div>`;
  return `<!doctype html><html><body style="margin:0;background:${theme.page};font-family:'${theme.bodyFont}',Arial,sans-serif;color:${theme.body}"><table role="presentation" width="100%" style="background:${theme.page}"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" style="max-width:680px;border-radius:18px;background:${theme.card};padding:28px;border:1px solid ${theme.primary}33"><tr><td>${logo}<h1 style="margin:22px 0 8px;font-family:'${theme.headingFont}',Georgia,serif;font-size:30px;line-height:1.1;color:${theme.heading}">${escapeHtml(title)}</h1><p style="margin:0;color:${theme.muted};font-size:14px;line-height:1.6">${escapeHtml(intro)}</p>${content}<p style="margin:24px 0 0;color:${theme.muted};font-size:11px;line-height:1.6">${escapeHtml(footer)}</p></td></tr></table></td></tr></table></body></html>`;
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
  emailTheme?: EmailBrandTheme;
};

function bookingIdentity(input: BookingCommunicationInput) {
  const { booking } = input;
  const theme = input.emailTheme || DEFAULT_EMAIL_THEME;
  return (
    row("Booking reference", bookingReference(booking), false, theme) +
    row("Salon", input.salon.name, false, theme) +
    row("Address", input.salon.full_address, false, theme) +
    row("Salon phone", input.salon.phone, false, theme) +
    row("Salon email", input.salon.email, false, theme)
  );
}

function appointmentDetails(input: BookingCommunicationInput) {
  const { booking, style, stylist, material } = input;
  const theme = input.emailTheme || DEFAULT_EMAIL_THEME;
  const options = [
    booking.selected_size ? `Size: ${booking.selected_size}` : "",
    booking.selected_length ? `Length: ${booking.selected_length}` : "",
    ...labelList(booking.selected_addons),
    ...selectedOptionLabels(booking.selected_options),
  ].filter(Boolean);
  return (
    row("Service", style?.name || "Braiding service", false, theme) +
    row("Selected options & add-ons", options.join(", ") || "None", false, theme) +
    row("Hair / material", material?.name || material?.brand || "Not selected", false, theme) +
    row("Stylist", stylist?.name || "Salon assigned", false, theme) +
    row("Appointment", input.when, false, theme) +
    row("Salon timezone", input.salon.time_zone || "America/New_York", false, theme) +
    row("Estimated duration", input.duration, false, theme)
  );
}

function priceDetails(input: BookingCommunicationInput) {
  const { booking, style } = input;
  const theme = input.emailTheme || DEFAULT_EMAIL_THEME;
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
      false,
      theme,
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
      false,
      theme,
    ) +
    row(
      promotionSnapshot.title ? `Promotion: ${String(promotionSnapshot.title)}` : "Promotion / discount",
      promotionDiscount ? `-${money(promotionDiscount)}` : "$0.00",
      false,
      theme,
    ) +
    row("Adjusted total", money(total), true, theme) +
    row("Reservation deposit", `${input.depositPercentage}%`, false, theme) +
    row("Deposit paid", money(deposit), false, theme) +
    row("Balance due at salon", money(booking.balance_due), true, theme) +
    row(
      "Payment method",
      booking.payment_method_label ||
        (deposit > 0 ? "Secure card payment" : "No payment required"),
      false,
      theme,
    )
  );
}

export function renderCustomerBookingConfirmation(
  input: BookingCommunicationInput,
) {
  const theme = input.emailTheme || DEFAULT_EMAIL_THEME;
  const actions =
    `<div style="margin-top:18px">${button("Manage booking", input.manageUrl || "", false, theme)}${button("Get directions", input.directionsUrl || "", true, theme)}${button("Stripe receipt", input.receiptUrl || "", true, theme)}</div>`;
  const content =
    card("Booking reference", bookingIdentity(input), theme) +
    card("Appointment", appointmentDetails(input), theme) +
    card("Price breakdown", priceDetails(input), theme) +
    card(
      "Cancellation & rescheduling",
      `<tr><td colspan="2" style="padding:7px 0;color:${theme.muted};font-size:13px;line-height:1.6">${escapeHtml(input.policy)}</td></tr>`,
      theme,
    ) +
    actions;
  return shell(
    "Your appointment is confirmed",
    input.intro,
    content,
    input.footer,
    input.emailLogoUrl,
    theme,
  );
}

export function renderSalonBookingConfirmation(
  input: BookingCommunicationInput,
) {
  const { booking } = input;
  const theme = input.emailTheme || DEFAULT_EMAIL_THEME;
  const customerRows =
    row("Customer", booking.guest_name, false, theme) +
    row("Email", booking.guest_email, false, theme) +
    row("Phone", booking.guest_phone, false, theme) +
    row("Customer notes", booking.client_notes || "None", false, theme);
  const collectionRows =
    row("Deposit collected", money(booking.deposit_amount), false, theme) +
    row("Collect at salon", money(booking.balance_due), true, theme);
  const content =
    card("Booking reference", bookingIdentity(input), theme) +
    card("Customer", customerRows, theme) +
    card("Appointment", appointmentDetails(input), theme) +
    card("Price breakdown", priceDetails(input), theme) +
    card("Salon collection", collectionRows, theme) +
    `<div style="margin-top:18px">${button("Open booking", input.dashboardUrl || "", false, theme)}</div>`;
  return shell(
    "A new booking is confirmed",
    input.intro,
    content,
    input.footer,
    input.emailLogoUrl,
    theme,
  );
}

export function renderBookingCancellation(
  input: BookingCommunicationInput & {
    audience: "customer" | "salon";
    cancelledBy: string;
    reason: string;
    customerMessage?: string;
    refundStatus: string;
    browseUrl?: string;
    supportUrl?: string;
  },
) {
  const theme = input.emailTheme || DEFAULT_EMAIL_THEME;
  const customerRows =
    row("Customer", input.booking.guest_name, false, theme) +
    row("Customer email", input.booking.guest_email, false, theme) +
    row("Customer phone", input.booking.guest_phone, false, theme);
  const cancellationRows =
    row("Cancelled by", input.cancelledBy, false, theme) +
    row("Reason", input.reason, false, theme) +
    (input.customerMessage
      ? row("Message from the salon", input.customerMessage, false, theme)
      : "") +
    row("Refund status", input.refundStatus, false, theme);
  const actions =
    input.audience === "customer"
      ? `<div style="margin-top:18px">${button("Manage booking", input.manageUrl || "", false, theme)}${button("Find another salon", input.browseUrl || "", true, theme)}${button("Support", input.supportUrl || "", true, theme)}</div>`
      : `<div style="margin-top:18px">${button("Open booking history", input.dashboardUrl || "", false, theme)}${button("Support", input.supportUrl || "", true, theme)}</div>`;
  return shell(
    "Appointment cancelled",
    input.intro,
    card("Booking reference", bookingIdentity(input), theme) +
      card("Original appointment", appointmentDetails(input), theme) +
      (input.audience === "salon" ? card("Customer", customerRows, theme) : "") +
      card("Cancellation", cancellationRows, theme) +
      actions,
    input.footer,
    input.emailLogoUrl,
    theme,
  );
}
