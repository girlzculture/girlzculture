import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";

type StripeProviderError = Error & {
  provider: "stripe";
  code: string;
  status?: number;
  deliveryUncertain?: boolean;
  diagnostics?: ReturnType<typeof allowedStripeFailure>;
};

function allowedStripeFailure(response: Response, body: unknown) {
  const error = body && typeof body === "object" && "error" in body ? (body as { error?: Record<string, unknown> }).error : null;
  const codes = new Set(["resource_missing", "parameter_missing", "parameter_invalid_empty", "parameter_invalid_integer", "parameter_invalid_string_blank", "parameter_unknown", "url_invalid", "account_invalid", "api_key_expired", "rate_limit", "idempotency_key_in_use", "testmode_charges_only"]);
  const types = new Set(["invalid_request_error", "authentication_error", "permission_error", "rate_limit_error", "api_error", "idempotency_error", "card_error"]);
  const params = new Set(["customer", "subscription", "configuration", "return_url", "flow_data[type]", "flow_data[after_completion][type]", "flow_data[after_completion][redirect][return_url]"]);
  const requestId = response.headers.get("request-id") || "";
  return {
    http_status: response.status,
    provider_code: typeof error?.code === "string" && codes.has(error.code) ? error.code : "unclassified",
    provider_type: typeof error?.type === "string" && types.has(error.type) ? error.type : "unclassified",
    parameter: typeof error?.param === "string" && params.has(error.param) ? error.param : null,
    provider_request_id: /^req_[A-Za-z0-9]{1,120}$/.test(requestId) ? requestId : null,
  };
}

/** Never retain/return provider messages, body, URLs, credential values or
 * arbitrary error fields. Unknown diagnostics stay unknown. */
export function stripeFailureDiagnostics(error: unknown) {
  return error && typeof error === "object" && "provider" in error && error.provider === "stripe" && "diagnostics" in error
    ? (error as StripeProviderError).diagnostics || null : null;
}

function stripeProviderError(
  message: string,
  code: string,
  options: { status?: number; deliveryUncertain?: boolean; cause?: unknown; diagnostics?: ReturnType<typeof allowedStripeFailure> } = {},
) {
  return Object.assign(new Error(message), {
    provider: "stripe" as const,
    code,
    status: options.status,
    deliveryUncertain: options.deliveryUncertain === true,
    cause: options.cause,
    diagnostics: options.diagnostics,
  }) as StripeProviderError;
}

export function stripeConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
  );
}

export async function stripeRequest<T>(
  path: string,
  values: Record<string, string | number | boolean | null | undefined>,
  options?: { idempotencyKey?: string; signal?: AbortSignal; onResponse?: (evidence: { requestId: string | null }) => void },
) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe test mode is not configured yet.");
  const form = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined) form.set(key, String(value));
  });

  let response: Response;
  try {
    response = await fetch(`${STRIPE_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(options?.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      body: form,
      cache: "no-store",
      signal: options?.signal,
    });
  } catch (error) {
    throw stripeProviderError(
      "STRIPE_NETWORK_FAILURE",
      "NETWORK_ERROR",
      { deliveryUncertain: true, cause: error },
    );
  }

  let data: T;
  const responseRequestId = response.headers.get("request-id") || "";
  options?.onResponse?.({ requestId: /^req_[A-Za-z0-9]{1,120}$/.test(responseRequestId) ? responseRequestId : null });
  try {
    data = (await response.json()) as T;
  } catch (error) {
    throw stripeProviderError(
      `STRIPE_RESPONSE_INVALID:${response.status}`,
      `HTTP_${response.status}`,
      {
        status: response.status,
        deliveryUncertain: response.ok || response.status >= 500,
        cause: error,
      },
    );
  }
  if (!response.ok) {
    throw stripeProviderError(
      `STRIPE_PROVIDER_FAILURE:${response.status}`,
      `HTTP_${response.status}`,
      {
        status: response.status,
        deliveryUncertain: response.status >= 500,
        diagnostics: allowedStripeFailure(response, data),
      },
    );
  }
  return data;
}

export async function stripeGet<T>(path: string, options?: { signal?: AbortSignal }) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe test mode is not configured yet.");

  let response: Response;
  try {
    response = await fetch(`${STRIPE_API}${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: options?.signal,
    });
  } catch (error) {
    throw stripeProviderError(
      "STRIPE_NETWORK_FAILURE",
      "NETWORK_ERROR",
      { cause: error },
    );
  }

  let data: T;
  try {
    data = (await response.json()) as T;
  } catch (error) {
    throw stripeProviderError(
      `STRIPE_RESPONSE_INVALID:${response.status}`,
      `HTTP_${response.status}`,
      { status: response.status, cause: error },
    );
  }
  if (!response.ok) {
    throw stripeProviderError(
      `STRIPE_PROVIDER_FAILURE:${response.status}`,
      `HTTP_${response.status}`,
      { status: response.status, diagnostics: allowedStripeFailure(response, data) },
    );
  }
  return data;
}

export function verifyStripeEvent(
  rawBody: string,
  signatureHeader: string | null,
) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) {
    throw new Error("Stripe webhook is not configured.");
  }
  const parts = signatureHeader.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts
    .filter(([key]) => key === "v1")
    .map(([, value]) => value);
  if (
    !timestamp ||
    !signatures.length ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  ) {
    throw new Error("Invalid Stripe signature.");
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const valid = signatures.some((signature) => {
    const left = Buffer.from(signature, "hex");
    const right = Buffer.from(expected, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
  });
  if (!valid) throw new Error("Invalid Stripe signature.");
  return JSON.parse(rawBody) as {
    id: string;
    type: string;
    created?: number;
    data: {
      object: Record<string, unknown>;
      previous_attributes?: Record<string, unknown>;
    };
  };
}

export function siteUrl(request?: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (request ? new URL(request.url).origin : "http://localhost:3000")
  ).replace(/\/$/, "");
}
