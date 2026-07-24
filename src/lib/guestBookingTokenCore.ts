import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type GuestTokenPayload = {
  v: 1;
  b: string;
  t: string;
  e: number;
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function protectedHmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function guestTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function signGuestToken(payload: GuestTokenPayload, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function parseGuestToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): GuestTokenPayload | null {
  const [body, suppliedSignature, extra] = token.split(".");
  if (!body || !suppliedSignature || extra) return null;
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  if (!safeEqual(expected, suppliedSignature)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as GuestTokenPayload;
    if (
      payload.v !== 1 ||
      !/^[0-9a-f-]{36}$/i.test(payload.b) ||
      !/^[0-9a-f-]{36}$/i.test(payload.t) ||
      !Number.isInteger(payload.e) ||
      payload.e <= nowSeconds
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function recoveryHash(
  challengeId: string,
  code: string,
  secret: string,
) {
  return protectedHmac(`${challengeId}:${code}`, secret);
}

export function recoveryMatches(
  challengeId: string,
  code: string,
  expectedHash: string,
  secret: string,
) {
  return safeEqual(
    recoveryHash(challengeId, code, secret),
    expectedHash,
  );
}
