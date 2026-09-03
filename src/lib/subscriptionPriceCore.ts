export type StripePriceSnapshot = {
  id?: string;
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
  type?: string;
  recurring?: {
    interval?: string;
    interval_count?: number;
  } | null;
};

export type SubscriptionPriceValidationReason =
  | "SALES_NOT_ENABLED"
  | "MISSING_CONFIGURATION"
  | "PROVIDER_LOOKUP_FAILED"
  | "PRICE_ID_MISMATCH"
  | "INACTIVE_PRICE"
  | "WRONG_CURRENCY"
  | "WRONG_AMOUNT"
  | "NON_RECURRING_PRICE"
  | "WRONG_INTERVAL"
  | "CURRENT_SUBSCRIPTION_IDENTITY_UNRECOGNIZED";

/**
 * A deploy-time Stripe catalog mismatch is an operational failure, not customer
 * input. Keep the public message generic while retaining a non-secret reason
 * code for the Engine and test diagnostics.
 */
export class SubscriptionPriceValidationError extends Error {
  readonly code = "SUBSCRIPTION_PRICE_CONFIGURATION_INVALID";
  readonly provider = "stripe";
  readonly status = 503;
  readonly reason: SubscriptionPriceValidationReason;

  constructor(
    reason: SubscriptionPriceValidationReason,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SubscriptionPriceValidationError";
    this.reason = reason;
  }
}

export function isSubscriptionPriceValidationError(
  error: unknown,
): error is SubscriptionPriceValidationError {
  return error instanceof SubscriptionPriceValidationError;
}

function configurationError(
  reason: SubscriptionPriceValidationReason,
  message: string,
  cause?: unknown,
) {
  return new SubscriptionPriceValidationError(reason, message, { cause });
}

export function assertSubscriptionSalesEnabled(value: unknown) {
  if (value !== "true") {
    throw configurationError(
      "SALES_NOT_ENABLED",
      "New subscription sales are not enabled for this deployment.",
    );
  }
}

export function validateStripeSubscriptionPrice(input: {
  configuredPriceId: string;
  expectedAmountCents: number;
  price: StripePriceSnapshot;
}) {
  const configuredPriceId = input.configuredPriceId.trim();
  if (!configuredPriceId) {
    throw configurationError(
      "MISSING_CONFIGURATION",
      "Subscription billing is not configured for the selected plan.",
    );
  }
  if (!input.price.id || input.price.id !== configuredPriceId) {
    throw configurationError(
      "PRICE_ID_MISMATCH",
      "The selected subscription price could not be verified.",
    );
  }
  if (input.price.active !== true) {
    throw configurationError(
      "INACTIVE_PRICE",
      "The selected subscription price is not active.",
    );
  }
  if (String(input.price.currency || "").toLowerCase() !== "usd") {
    throw configurationError(
      "WRONG_CURRENCY",
      "The selected subscription price has an invalid currency configuration.",
    );
  }
  if (input.price.unit_amount !== input.expectedAmountCents) {
    throw configurationError(
      "WRONG_AMOUNT",
      "The selected subscription price has an invalid amount configuration.",
    );
  }
  if (input.price.type !== "recurring" || !input.price.recurring) {
    throw configurationError(
      "NON_RECURRING_PRICE",
      "The selected subscription price is not recurring.",
    );
  }
  if (
    input.price.recurring.interval !== "month" ||
    input.price.recurring.interval_count !== 1
  ) {
    throw configurationError(
      "WRONG_INTERVAL",
      "The selected subscription price is not configured for monthly billing.",
    );
  }
  return {
    priceId: configuredPriceId,
    amountCents: input.expectedAmountCents,
    currency: "usd" as const,
    interval: "month" as const,
  };
}

/**
 * Resolve first, validate second. Dependencies are injected so the complete
 * guard can be exercised without a provider or credential in regression tests.
 */
export async function resolveStripeSubscriptionPrice(input: {
  configuredPriceId: string | undefined;
  expectedAmountCents: number;
  retrievePrice: (priceId: string) => Promise<StripePriceSnapshot>;
}) {
  const configuredPriceId = String(input.configuredPriceId || "").trim();
  if (!configuredPriceId) {
    throw configurationError(
      "MISSING_CONFIGURATION",
      "Subscription billing is not configured for the selected plan.",
    );
  }
  let price: StripePriceSnapshot;
  try {
    price = await input.retrievePrice(configuredPriceId);
  } catch (error) {
    if (isSubscriptionPriceValidationError(error)) throw error;
    throw configurationError(
      "PROVIDER_LOOKUP_FAILED",
      "The subscription price could not be verified right now.",
      error,
    );
  }
  return validateStripeSubscriptionPrice({
    configuredPriceId,
    expectedAmountCents: input.expectedAmountCents,
    price,
  });
}

export type SubscriptionCatalogEntry = {
  key: string;
  configuredPriceId: string | undefined;
  expectedAmountCents: number;
};

/**
 * Verify the complete canonical catalog before any sale/change mutation. The
 * configuration preflight is intentionally completed before the first Stripe
 * read, so one missing sibling plan cannot leave a partially verified catalog.
 */
export async function resolveStripeSubscriptionCatalog(input: {
  entries: readonly SubscriptionCatalogEntry[];
  retrievePrice: (priceId: string) => Promise<StripePriceSnapshot>;
}) {
  const entries = input.entries.map((entry) => ({
    ...entry,
    configuredPriceId: String(entry.configuredPriceId || "").trim(),
  }));
  if (entries.some((entry) => !entry.configuredPriceId)) {
    throw configurationError(
      "MISSING_CONFIGURATION",
      "The subscription price catalog is not fully configured.",
    );
  }

  const verified: Record<string, ReturnType<typeof validateStripeSubscriptionPrice>> = {};
  for (const entry of entries) {
    verified[entry.key] = await resolveStripeSubscriptionPrice({
      configuredPriceId: entry.configuredPriceId,
      expectedAmountCents: entry.expectedAmountCents,
      retrievePrice: input.retrievePrice,
    });
  }
  return verified;
}
