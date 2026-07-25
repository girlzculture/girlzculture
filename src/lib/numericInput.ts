export type NumericDraft = string;

export type NumericDraftOptions = {
  integer?: boolean;
  allowNegative?: boolean;
  maximumDecimalPlaces?: number;
};

export type NumericBounds = {
  label: string;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  required?: boolean;
};

/**
 * Keeps numeric editing as text until save/blur validation. This is important:
 * Number("") is zero, which is why controlled price and duration inputs used to
 * fight Backspace/Delete and immediately restore a value.
 */
export function normalizeNumericDraft(
  rawValue: unknown,
  options: NumericDraftOptions = {},
): NumericDraft {
  const integer = options.integer === true;
  const allowNegative = options.allowNegative === true;
  const maximumDecimalPlaces = Math.max(
    0,
    Math.min(8, options.maximumDecimalPlaces ?? 2),
  );
  let raw = String(rawValue ?? "")
    .replace(/[$,\s]/g, "")
    .replace(/[^\d.-]/g, "");

  const negative = allowNegative && raw.startsWith("-");
  raw = raw.replace(/-/g, "");
  if (integer) {
    const digits = raw.replace(/\D/g, "");
    return `${negative && digits ? "-" : ""}${digits}`;
  }

  const dotIndex = raw.indexOf(".");
  const whole = (dotIndex < 0 ? raw : raw.slice(0, dotIndex)).replace(/\D/g, "");
  const decimal =
    dotIndex < 0
      ? ""
      : raw
          .slice(dotIndex + 1)
          .replace(/\D/g, "")
          .slice(0, maximumDecimalPlaces);
  const hasDot = dotIndex >= 0;
  const normalizedWhole = hasDot && whole === "" ? "0" : whole;
  if (!normalizedWhole && !hasDot) return "";
  return `${negative ? "-" : ""}${normalizedWhole}${hasDot ? `.${decimal}` : ""}`;
}

export function parseNumericDraft(
  draft: NumericDraft,
  bounds: NumericBounds,
): number | null {
  const value = draft.trim();
  if (value === "") {
    if (bounds.required === false) return null;
    throw new Error(`${bounds.label} is required.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new Error(`${bounds.label} must be a valid number.`);
  if (bounds.integer && !Number.isInteger(parsed))
    throw new Error(`${bounds.label} must be a whole number.`);
  if (bounds.minimum !== undefined && parsed < bounds.minimum)
    throw new Error(`${bounds.label} must be at least ${bounds.minimum}.`);
  if (bounds.maximum !== undefined && parsed > bounds.maximum)
    throw new Error(`${bounds.label} must be no more than ${bounds.maximum}.`);
  return parsed;
}
