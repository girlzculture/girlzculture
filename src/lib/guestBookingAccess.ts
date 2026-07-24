import "server-only";

import {
  randomInt,
  randomUUID,
} from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientAddress } from "@/lib/requestSecurity";
import {
  guestTokenHash,
  parseGuestToken,
  protectedHmac,
  recoveryHash,
  recoveryMatches,
  signGuestToken,
  type GuestTokenPayload,
} from "@/lib/guestBookingTokenCore";

export type VerifiedGuestBookingAccess = {
  bookingId: string;
  tokenId: string;
  expiresAt: string;
};

function signingSecret() {
  const secret =
    process.env.GUEST_BOOKING_LINK_SECRET ||
    process.env.INTERNAL_API_SECRET ||
    process.env.MFA_CODE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("Guest booking link signing is not configured.");
  }
  return secret;
}

async function configuredExpiryHours(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("engine_settings")
    .select("published_value")
    .eq("setting_key", "booking.guest_link_expiry_hours")
    .eq("status", "Published")
    .maybeSingle();
  if (error) throw error;
  const value = Number(data?.published_value ?? 168);
  return Number.isFinite(value) && value >= 1 && value <= 720 ? value : 168;
}

function requestFingerprint(request: Request) {
  return protectedHmac(
    `${clientAddress(request)}:${request.headers.get("user-agent") || "unknown"}`,
    signingSecret(),
  );
}

function safeMetadata(metadata: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => /^[a-z][a-z0-9_]{0,39}$/i.test(key))
      .slice(0, 12)
      .map(([key, value]) => [
        key,
        ["string", "number", "boolean"].includes(typeof value)
          ? String(value).slice(0, 160)
          : null,
      ]),
  );
}

export async function auditGuestBookingAccess(
  admin: SupabaseClient,
  request: Request | null,
  input: {
    bookingId?: string | null;
    tokenId?: string | null;
    action: string;
    outcome: "allowed" | "denied" | "completed";
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("booking_guest_access_audit").insert({
    booking_id: input.bookingId || null,
    token_id: input.tokenId || null,
    action: input.action,
    outcome: input.outcome,
    request_fingerprint: request ? requestFingerprint(request) : null,
    metadata: safeMetadata(input.metadata),
  });
  if (error) throw error;
}

export async function issueGuestBookingToken(
  admin: SupabaseClient,
  bookingId: string,
  options: {
    reason?: string;
    rotatedFromId?: string | null;
    rootUrl?: string;
  } = {},
) {
  const hours = await configuredExpiryHours(admin);
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  const payload: GuestTokenPayload = {
    v: 1,
    b: bookingId,
    t: tokenId,
    e: Math.floor(expiresAt.getTime() / 1000),
  };
  const token = signGuestToken(payload, signingSecret());
  const now = new Date().toISOString();
  const { data: active, error: activeError } = await admin
    .from("booking_guest_access_tokens")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("purpose", "manage")
    .is("revoked_at", null);
  if (activeError) throw activeError;
  if (active?.length) {
    const { error: revokeError } = await admin
      .from("booking_guest_access_tokens")
      .update({
        revoked_at: now,
        revoked_reason: options.reason || "Rotated",
      })
      .in("id", active.map((row) => row.id));
    if (revokeError) throw revokeError;
  }
  const rotatedFromId = options.rotatedFromId || active?.[0]?.id || null;
  const { error } = await admin.from("booking_guest_access_tokens").insert({
    id: tokenId,
    booking_id: bookingId,
    token_hash: guestTokenHash(token),
    purpose: "manage",
    expires_at: expiresAt.toISOString(),
    rotated_from_id: rotatedFromId,
  });
  if (error) throw error;
  await auditGuestBookingAccess(admin, null, {
    bookingId,
    tokenId,
    action: "issued",
    outcome: "completed",
    metadata: { reason: options.reason || "Booking communication" },
  });
  const root = String(
    options.rootUrl ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://girlzculture.com",
  ).replace(/\/$/, "");
  return {
    token,
    tokenId,
    expiresAt: expiresAt.toISOString(),
    url: `${root}/booking/manage/${encodeURIComponent(token)}`,
  };
}

export async function verifyGuestBookingToken(
  admin: SupabaseClient,
  token: string,
): Promise<VerifiedGuestBookingAccess | null> {
  const payload = parseGuestToken(token, signingSecret());
  if (!payload) return null;
  const { data, error } = await admin
    .from("booking_guest_access_tokens")
    .select("id,booking_id,expires_at,revoked_at,token_hash,use_count")
    .eq("id", payload.t)
    .eq("booking_id", payload.b)
    .maybeSingle();
  if (error) throw error;
  if (
    !data ||
    data.revoked_at ||
    new Date(data.expires_at).getTime() <= Date.now() ||
    String(data.token_hash) !== guestTokenHash(token)
  ) {
    return null;
  }
  const { error: touchError } = await admin
    .from("booking_guest_access_tokens")
    .update({
      last_used_at: new Date().toISOString(),
      use_count: Number(data.use_count || 0) + 1,
    })
    .eq("id", data.id)
    .is("revoked_at", null);
  if (touchError) throw touchError;
  return {
    bookingId: data.booking_id,
    tokenId: data.id,
    expiresAt: data.expires_at,
  };
}

export async function revokeGuestBookingToken(
  admin: SupabaseClient,
  access: VerifiedGuestBookingAccess,
  reason: string,
) {
  const { error } = await admin
    .from("booking_guest_access_tokens")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason.slice(0, 160),
    })
    .eq("id", access.tokenId)
    .eq("booking_id", access.bookingId)
    .is("revoked_at", null);
  if (error) throw error;
}

export async function rotateGuestBookingToken(
  admin: SupabaseClient,
  access: VerifiedGuestBookingAccess,
  reason: string,
  rootUrl?: string,
) {
  await revokeGuestBookingToken(admin, access, reason);
  return issueGuestBookingToken(admin, access.bookingId, {
    reason,
    rotatedFromId: access.tokenId,
    rootUrl,
  });
}

export function createRecoveryCode() {
  return String(randomInt(100000, 1000000));
}

export function recoveryCodeHash(challengeId: string, code: string) {
  return recoveryHash(challengeId, code, signingSecret());
}

export function recoveryCodeMatches(
  challengeId: string,
  code: string,
  expectedHash: string,
) {
  return recoveryMatches(
    challengeId,
    code,
    expectedHash,
    signingSecret(),
  );
}

export function guestRequestFingerprint(request: Request) {
  return requestFingerprint(request);
}
