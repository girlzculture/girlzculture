export const MARKETPLACE_PREVIEW_COOKIE = "gc_marketplace_preview";
export const MARKETPLACE_PREVIEW_TTL_SECONDS = 30 * 60;

type PreviewGrant = {
  version: 1;
  admin_user_id: string;
  issued_at: number;
  expires_at: number;
};

const encoder = new TextEncoder();

function secret() {
  const value =
    process.env.MARKETPLACE_PREVIEW_SECRET || process.env.INTERNAL_API_SECRET;
  if (!value) throw new Error("MARKETPLACE_PREVIEW_SIGNING_NOT_CONFIGURED");
  return value;
}

function encodeBase64Url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(usage: KeyUsage) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function issueMarketplacePreviewGrant(
  adminUserId: string,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1000);
  const grant: PreviewGrant = {
    version: 1,
    admin_user_id: adminUserId,
    issued_at: issuedAt,
    expires_at: issuedAt + MARKETPLACE_PREVIEW_TTL_SECONDS,
  };
  const payload = encodeBase64Url(JSON.stringify(grant));
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey("sign"), encoder.encode(payload)),
  );
  return {
    value: `${payload}.${encodeBase64Url(signature)}`,
    expiresAt: new Date(grant.expires_at * 1000),
  };
}

export async function verifyMarketplacePreviewGrant(
  value: string | null | undefined,
  now = Date.now(),
) {
  try {
    const [payload, suppliedSignature, extra] = String(value || "").split(".");
    if (
      !payload ||
      !suppliedSignature ||
      extra ||
      !/^[A-Za-z0-9_-]+$/.test(payload + suppliedSignature)
    ) return null;
    const verified = await crypto.subtle.verify(
      "HMAC",
      await hmacKey("verify"),
      decodeBase64Url(suppliedSignature),
      encoder.encode(payload),
    );
    if (!verified) return null;
    const grant = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payload)),
    ) as Partial<PreviewGrant>;
    const nowSeconds = Math.floor(now / 1000);
    if (
      grant.version !== 1 ||
      !/^[0-9a-f-]{36}$/i.test(String(grant.admin_user_id || "")) ||
      !Number.isInteger(grant.issued_at) ||
      !Number.isInteger(grant.expires_at) ||
      Number(grant.issued_at) > nowSeconds + 60 ||
      Number(grant.expires_at) <= nowSeconds ||
      Number(grant.expires_at) - Number(grant.issued_at) >
        MARKETPLACE_PREVIEW_TTL_SECONDS
    ) return null;
    return {
      adminUserId: String(grant.admin_user_id),
      expiresAt: new Date(Number(grant.expires_at) * 1000),
    };
  } catch {
    return null;
  }
}
