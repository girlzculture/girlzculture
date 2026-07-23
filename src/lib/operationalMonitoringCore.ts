export type MonitoringClassification =
  | "protected"
  | "provider-backed"
  | "public-read-only"
  | "expected-only"
  | "not-applicable";

export function classifyOperationalRoute(
  route: string,
  method: string,
): MonitoringClassification {
  const providerBacked =
    /(?:stripe|media|messages|notifications|reminders|concierge|application|support|complaints|password-reset|engine\/ai|geocode|push|monitor\/client-provider|admin\/data|admin\/team|admin\/submissions|salon\/bookings|guest\/bookings)/.test(
      route,
    );
  const protectedRoute =
    /^(?:\/api\/admin|\/api\/salon|\/api\/customer|\/api\/messages|\/api\/push|\/api\/stripe\/(?:portal|subscription|booking-checkout)|\/api\/bookings|\/api\/auth\/(?:destination|mfa\/settings)|\/api\/i18n\/preference)/.test(
      route,
    );
  const expectedOnly =
    /\/api\/auth\/(?:login|password-reset|signup)|\/api\/(?:newsletter|support|promo\/validate)/.test(
      route,
    );
  if (providerBacked) return "provider-backed";
  if (protectedRoute) return "protected";
  if (expectedOnly) return "expected-only";
  if (method === "GET") return "public-read-only";
  return "expected-only";
}

const UNSAFE_ERROR_PATTERN =
  /\b(row[- ]level security|permission denied for|duplicate key|violates .* constraint|pgrst\d*|sqlstate|(?:22|23|28|40|42|53|54|55|57|58|XX)[0-9A-Z]{3}|supabase|stripe|openai|twilio|resend|vapid|service[_ -]?role|relation .* does not exist|column .* does not exist|jwt|fetch failed|econn|enotfound|socket hang up|provider payload|storage object|stack trace|authorization bearer|whsec_|sk_(?:live|test)_|pk_(?:live|test)_|api[-_ ]?key|card number|cvc)\b/i;

const SAFE_EXPECTED_PATTERN =
  /^(please |choose |enter |select |unable to submit this form|too many requests|not found|another administrator changed|this .* (?:is|required|must|cannot|belongs|has)|[^.!]{1,100}\b(?:is required|must|cannot|not found)\b|no .* found|invalid (?:request|code|signature)|booking is no longer|the appointment|you do not have permission)/i;

export function isUnsafeOperationalMessage(value: unknown) {
  const message = String(value || "").slice(0, 2_000);
  return UNSAFE_ERROR_PATTERN.test(message);
}

export function isClearlyExpectedMessage(value: unknown) {
  const message = String(value || "").trim().slice(0, 2_000);
  return Boolean(message) && !isUnsafeOperationalMessage(message) && SAFE_EXPECTED_PATTERN.test(message);
}

export function isAuthenticationFailureMessage(value: unknown) {
  return /^(unauthorized|please sign in|sign in to|your session (?:has expired|could not)|session (?:expired|invalid))/i.test(
    String(value || "").trim(),
  );
}

export function isPermissionDenialMessage(value: unknown) {
  return /^(forbidden|you do not have (?:access|permission)|this account is not (?:allowed|an? )|this role cannot|only (?:the )?[\w -]+ can\b)/i.test(
    String(value || "").trim(),
  );
}

export function safeOperationalCode(status: number) {
  if (status === 401) return "AUTHENTICATION_SESSION_FAILURE";
  if (status === 408 || status === 504) return "OPERATION_TIMEOUT";
  return `HTTP_${status || 500}`;
}

export function shouldCaptureResponse(
  status: number,
  message: unknown,
  classification: MonitoringClassification,
) {
  if (status >= 500) return true;
  if (
    (status === 401 || isAuthenticationFailureMessage(message)) &&
    (classification === "protected" || classification === "provider-backed")
  ) {
    return true;
  }
  if (status >= 400 && status < 500 && isUnsafeOperationalMessage(message)) return true;
  if (
    status >= 400 &&
    status < 500 &&
    (classification === "protected" || classification === "provider-backed") &&
    !isPermissionDenialMessage(message) &&
    !isClearlyExpectedMessage(message)
  ) {
    return true;
  }
  return false;
}

export function shouldCaptureProviderResponse(
  status: number,
  code: unknown,
  message: unknown,
) {
  const safeCode = String(code || "").slice(0, 80);
  if (status === 406 && safeCode === "PGRST116") return false;
  return status >= 500
    || status === 401
    || status === 403
    || status === 409
    || status === 429
    || isUnsafeOperationalMessage(`${safeCode} ${String(message || "").slice(0, 300)}`);
}

export function safeIdentifier(value: unknown) {
  const text = String(value || "").trim();
  return /^[a-z0-9][a-z0-9_.:-]{0,159}$/i.test(text) ? text : null;
}

export function pickAffectedRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = [
    "bookingId",
    "booking_id",
    "salonId",
    "salon_id",
    "stylistId",
    "stylist_id",
    "styleId",
    "style_id",
    "applicationId",
    "application_id",
    "recordId",
    "record_id",
    "id",
  ];
  for (const key of keys) {
    const identifier = safeIdentifier(record[key]);
    if (identifier) return { type: key.replace(/_?id$/i, "") || "record", id: identifier };
  }
  return null;
}

export function pickRouteRecord(routeTemplate: string, pathname: string) {
  const templateParts = routeTemplate.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (templateParts.length !== pathParts.length) return null;
  for (let index = 0; index < templateParts.length; index += 1) {
    const match = templateParts[index].match(/^\[([a-z][a-z0-9_]*)\]$/i);
    if (!match) continue;
    let decoded = pathParts[index];
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    const id = safeIdentifier(decoded);
    if (!id) return null;
    const parameter = match[1].replace(/_?id$/i, "");
    const previous = (templateParts[index - 1] || "record").replace(/s$/i, "");
    return {
      type: parameter && parameter !== "id" ? parameter : previous,
      id,
    };
  }
  return null;
}

export function addOperationalWarnings(
  body: Record<string, unknown>,
  references: string[],
) {
  return {
    ...body,
    operational_warnings: references.map((reference) => ({
      message: `A secondary operation needs attention. Reference ${reference}.`,
      request_id: reference,
    })),
  };
}
