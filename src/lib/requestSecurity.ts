type RateEntry = { count: number; resetAt: number };
import { isValidEmail, normalizeEmail, normalizeUsPhone } from "@/lib/validation";
const rateEntries = new Map<string, RateEntry>();

export function clientAddress(request: Request) {
  return request.headers.get("x-nf-client-connection-ip")
    || request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export function enforceRateLimit(request: Request, scope: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const key = `${scope}:${clientAddress(request)}`;
  const current = rateEntries.get(key);
  if (!current || current.resetAt <= now) {
    rateEntries.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) throw new RateLimitError(Math.ceil((current.resetAt - now) / 1000));
}

export class RateLimitError extends Error {
  constructor(public retryAfter: number) { super("Too many requests. Please try again shortly."); }
}

export function cleanText(value: unknown, maxLength = 500) {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maxLength);
}

export function cleanEmail(value: unknown) {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) throw new Error("Please enter a valid email address (name@example.com).");
  return email;
}

export function cleanUsPhone(value: unknown, required = true) {
  if (!cleanText(value, 30) && !required) return "";
  return normalizeUsPhone(value);
}

export function rejectBot(body: Record<string, unknown>) {
  if (cleanText(body.website, 200)) throw new Error("Unable to submit this form.");
}

export function errorResponse(error: unknown, fallback: string) {
  if (error instanceof RateLimitError) {
    return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter) } });
  }
  const message = error instanceof Error ? error.message : fallback;
  const status = /^Unauthorized\b/i.test(message)
    ? 401
    : /^Forbidden\b/i.test(message)
      ? 403
      : 400;
  return Response.json({ error: message }, { status });
}

/**
 * Public endpoints must not echo database, provider, or authorization details to
 * unauthenticated callers. Rate-limit errors are deliberately preserved because
 * the retry window is safe and actionable; every other failure is logged by the
 * caller and reduced to a customer-friendly message here.
 */
export function publicErrorResponse(error: unknown, fallback: string, status = 500) {
  if (error instanceof RateLimitError) {
    return Response.json(
      { error: error.message },
      { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
    );
  }
  return Response.json({ error: fallback }, { status });
}
