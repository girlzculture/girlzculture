import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export async function stripeRequest<T>(path: string, values: Record<string, string | number | boolean | null | undefined>, options?: { idempotencyKey?: string }) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe test mode is not configured yet.");
  const form = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== null && value !== undefined) form.set(key, String(value)); });
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded", ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}) },
    body: form,
    cache: "no-store",
  });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "Stripe request failed.");
  return data;
}

export async function stripeGet<T>(path: string) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe test mode is not configured yet.");
  const response = await fetch(`${STRIPE_API}${path}`, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || "Stripe request failed.");
  return data;
}

export function verifyStripeEvent(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) throw new Error("Stripe webhook is not configured.");
  const parts = signatureHeader.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error("Invalid Stripe signature.");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const valid = signatures.some((signature) => {
    const left = Buffer.from(signature, "hex");
    const right = Buffer.from(expected, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
  });
  if (!valid) throw new Error("Invalid Stripe signature.");
  return JSON.parse(rawBody) as { id: string; type: string; created?: number; data: { object: Record<string, unknown>; previous_attributes?: Record<string, unknown> } };
}

export function siteUrl(request?: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || (request ? new URL(request.url).origin : "http://localhost:3000")).replace(/\/$/, "");
}
