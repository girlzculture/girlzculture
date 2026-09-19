import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Meta Instagram Login documentation, retrieved 2026-09-19. No Facebook Login
// fields, public-profile discovery, refresh, publishing or messaging scopes.
export const INSTAGRAM_API_VERSION = "v26.0";
export const INSTAGRAM_SCOPE = "instagram_business_basic";
export const INSTAGRAM_MEDIA_LIMIT = 16;
export class InstagramOnboardingError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code); }
}
export type InstagramConfig = { clientId: string; clientSecret: string; key: Buffer; redirectUri: string; mode: "acceptance" | "live"; acceptanceOwner: string };
export type InstagramToken = { access_token: string; user_id: string; expires_at: number };
export type InstagramProfile = { id: string; user_id: string; username: string; name: string; account_type: string };
export type InstagramMedia = { id: string; media_url: string; timestamp: string | null };
const fail = (code = "INSTAGRAM_RESPONSE_INVALID"): never => { throw new InstagramOnboardingError(code); };
const id = (value: unknown): string => typeof value === "string" && /^\d{1,30}$/.test(value) ? value : fail();
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail();
export function instagramConfig(env: NodeJS.ProcessEnv = process.env): InstagramConfig | null {
  const mode = env.INSTAGRAM_ONBOARDING_ACTIVATION;
  if ((mode !== "acceptance" && mode !== "live") || env.INSTAGRAM_ONBOARDING_APPROVED !== "true") return null;
  const clientId = env.INSTAGRAM_ONBOARDING_CLIENT_ID || "", clientSecret = env.INSTAGRAM_ONBOARDING_CLIENT_SECRET || "";
  const encoded = env.INSTAGRAM_ONBOARDING_ENCRYPTION_KEY || "", acceptanceOwner = env.INSTAGRAM_ONBOARDING_ACCEPTANCE_OWNER_ID || "";
  if (!/^\d{1,30}$/.test(clientId) || !clientSecret || /\s/.test(clientSecret) || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) return null;
  const key = Buffer.from(encoded, "base64"); if (key.length !== 32) return null;
  let redirect: URL; try { redirect = new URL(env.INSTAGRAM_ONBOARDING_REDIRECT_URI || ""); } catch { return null; }
  if (redirect.protocol !== "https:" || redirect.username || redirect.password || redirect.port || redirect.search || redirect.hash || redirect.pathname !== "/api/salon/onboarding-instagram/callback") return null;
  if (mode === "acceptance" && (!/^[a-f0-9]{24}--girlzculture\.netlify\.app$/.test(redirect.hostname) || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(acceptanceOwner))) return null;
  const verifiedAt = Date.parse(env.INSTAGRAM_ONBOARDING_VERIFIED_AT || "");
  if (mode === "live" && (redirect.hostname !== "girlzculture.com" || !Number.isFinite(verifiedAt) || verifiedAt > Date.now())) return null;
  return { clientId, clientSecret, key, redirectUri: redirect.toString(), mode, acceptanceOwner };
}
export function assertInstagramAccess(config: InstagramConfig | null, origin: string, owner: string): asserts config is InstagramConfig {
  if (!config || new URL(config.redirectUri).origin !== origin || config.mode === "acceptance" && config.acceptanceOwner !== owner) throw new InstagramOnboardingError("INSTAGRAM_ACTIVATION_REQUIRED", 503);
}
export function sealInstagramSecret(value: unknown, business: string, key: Buffer) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`gc-instagram-onboarding-v1:${business}:tokens`));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), bytes.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}
export function openInstagramSecret(value: string, business: string, key: Buffer): InstagramToken {
  try {
    const [version, iv, data, tag, ...rest] = value.split("."); if (version !== "v1" || rest.length) throw Error();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(`gc-instagram-onboarding-v1:${business}:tokens`)); decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8"));
  } catch { return fail("INSTAGRAM_AUTH_RECONNECT"); }
}
export function instagramAuthorization(config: InstagramConfig) {
  const state = randomBytes(32).toString("base64url"), url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: INSTAGRAM_SCOPE, state, enable_fb_login: "false", force_reauth: "true" }).toString();
  return { state, stateHash: createHash("sha256").update(state).digest("hex"), url: url.toString() };
}
export function verifyInstagramState(state: string, cookie: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || state.length !== cookie.length || !timingSafeEqual(Buffer.from(state), Buffer.from(cookie))) throw new InstagramOnboardingError("INSTAGRAM_AUTHORIZATION_EXPIRED", 400);
  return createHash("sha256").update(state).digest("hex");
}
export function verifyInstagramSignedRequest(input: string, secret: string, now = Date.now()) {
  if (!secret || input.length > 8192) throw new InstagramOnboardingError("INSTAGRAM_SIGNATURE_INVALID", 400);
  const parts = input.split("."); if (parts.length !== 2 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new InstagramOnboardingError("INSTAGRAM_SIGNATURE_INVALID", 400);
  const signature = Buffer.from(parts[0], "base64url"), expected = createHmac("sha256", secret).update(parts[1]).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new InstagramOnboardingError("INSTAGRAM_SIGNATURE_INVALID", 400);
  let payload: Record<string, unknown>; try { payload = object(JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))); } catch { throw new InstagramOnboardingError("INSTAGRAM_SIGNATURE_INVALID", 400); }
  if (payload.algorithm !== "HMAC-SHA256" || typeof payload.issued_at !== "number" || !Number.isSafeInteger(payload.issued_at) || payload.issued_at * 1000 > now + 60_000 || payload.issued_at * 1000 < now - 86_400_000) throw new InstagramOnboardingError("INSTAGRAM_SIGNATURE_INVALID", 400);
  return { user_id: id(payload.user_id), issued_at: payload.issued_at, code: createHash("sha256").update(input).digest("hex") };
}
export function instagramProfile(input: unknown, expectedUser: string): InstagramProfile {
  const row = object(input);
  if (id(row.id) !== expectedUser || typeof row.username !== "string" || !/^[a-zA-Z0-9_.]{1,30}$/.test(row.username) || !["BUSINESS", "MEDIA_CREATOR", "Business", "Media_Creator"].includes(String(row.account_type))) return fail("INSTAGRAM_ACCOUNT_MISMATCH");
  if (row.name !== undefined && (typeof row.name !== "string" || row.name.length > 240)) return fail();
  return { id: expectedUser, user_id: id(row.user_id), username: row.username, name: String(row.name || ""), account_type: String(row.account_type) };
}
export function instagramMediaUrl(value: unknown) {
  let url: URL; try { url = new URL(String(value)); } catch { return fail("INSTAGRAM_MEDIA_UNAVAILABLE"); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash || url.toString().length > 4096 || !/^(?:[a-z0-9-]+\.)+(?:cdninstagram\.com|fbcdn\.net)$/.test(url.hostname)) return fail("INSTAGRAM_MEDIA_UNAVAILABLE");
  return url.toString();
}
export function instagramMedia(value: unknown, expectedUser: string): InstagramMedia | null {
  const row = object(value);
  if (id(object(row.owner).id) !== expectedUser) return fail("INSTAGRAM_ACCOUNT_MISMATCH");
  const mediaId = id(row.id);
  if (row.media_type === "VIDEO" || row.media_type === "CAROUSEL_ALBUM") return null;
  if (row.media_type !== "IMAGE") return fail();
  if (row.timestamp !== undefined && (typeof row.timestamp !== "string" || !Number.isFinite(Date.parse(row.timestamp)))) return fail();
  return { id: mediaId, media_url: instagramMediaUrl(row.media_url), timestamp: row.timestamp ? new Date(String(row.timestamp)).toISOString() : null };
}
export class InstagramOnboardingProvider {
  constructor(private config: InstagramConfig, private transport: typeof fetch = fetch, private deadline = Date.now() + 45_000) {}
  private async response(url: string, init: RequestInit = {}) {
    const remaining = this.deadline - Date.now(); if (remaining <= 0) return fail("INSTAGRAM_DEADLINE_EXCEEDED");
    let response: Response; try { response = await this.transport(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(Math.min(10_000, remaining)) }); } catch { return fail("INSTAGRAM_PROVIDER_UNAVAILABLE"); }
    if (!response.ok) throw new InstagramOnboardingError(response.status === 401 ? "INSTAGRAM_AUTH_RECONNECT" : response.status === 429 ? "INSTAGRAM_RATE_LIMITED" : "INSTAGRAM_PROVIDER_UNAVAILABLE", response.status === 429 ? 429 : 503);
    return response;
  }
  private async json(url: string, init: RequestInit = {}) {
    const response = await this.response(url, init), bytes = await boundedInstagramBody(response, 256_000);
    try { return object(JSON.parse(bytes.toString("utf8"))); } catch { return fail(); }
  }
  async exchange(code: string): Promise<InstagramToken> {
    if (!code || code.length > 4096) return fail("INSTAGRAM_AUTHORIZATION_EXPIRED");
    const form = new FormData(); for (const [key, value] of Object.entries({ client_id: this.config.clientId, client_secret: this.config.clientSecret, grant_type: "authorization_code", redirect_uri: this.config.redirectUri, code })) form.set(key, value);
    const result = await this.json("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
    if (!Array.isArray(result.data) || result.data.length !== 1) return fail("INSTAGRAM_AUTH_RECONNECT");
    const token = object(result.data[0]);
    if (typeof token.access_token !== "string" || !token.access_token || token.access_token.length > 4096 || typeof token.permissions !== "string" || !token.permissions.split(",").map(x => x.trim()).includes(INSTAGRAM_SCOPE)) return fail("INSTAGRAM_AUTH_RECONNECT");
    return { access_token: token.access_token, user_id: id(token.user_id), expires_at: Date.now() + 3_500_000 };
  }
  private get(token: InstagramToken, path: string, fields: string, extra: Record<string, string> = {}) {
    // Meta's documented token query contract. No URL is surfaced in logs/errors.
    return this.json(`https://graph.instagram.com/${INSTAGRAM_API_VERSION}/${path}?${new URLSearchParams({ fields, access_token: token.access_token, ...extra })}`);
  }
  async profile(token: InstagramToken) { return instagramProfile(await this.get(token, "me", "id,user_id,username,name,account_type"), token.user_id); }
  async media(token: InstagramToken, professionalId: string) {
    const result = await this.get(token, `${id(professionalId)}/media`, "id", { limit: "17" });
    if (!Array.isArray(result.data) || result.data.length > 17) return fail();
    const media: InstagramMedia[] = [], ids = new Set<string>(); let unsupported = 0;
    for (const raw of result.data.slice(0, INSTAGRAM_MEDIA_LIMIT)) {
      const mediaId = id(object(raw).id); if (ids.has(mediaId)) return fail(); ids.add(mediaId);
      const item = instagramMedia(await this.get(token, mediaId, "id,owner,media_type,media_url,timestamp"), professionalId);
      if (item && item.id !== mediaId) return fail(); if (item) media.push(item); else unsupported++;
    }
    return { media, is_excerpt: result.data.length > INSTAGRAM_MEDIA_LIMIT || Boolean(object(result.paging || {}).next) || unsupported > 0 };
  }
  async download(url: string) {
    const response = await this.response(instagramMediaUrl(url));
    const type = response.headers.get("content-type")?.split(";")[0].trim();
    if (type !== "image/jpeg" && type !== "image/png") return fail("INSTAGRAM_MEDIA_UNAVAILABLE");
    return { bytes: await boundedInstagramBody(response, 10_000_000), declaredMimeType: type };
  }
}
export async function boundedInstagramBody(response: Response, limit: number) {
  if (Number(response.headers.get("content-length")) > limit || !response.body) return fail("INSTAGRAM_RESPONSE_TOO_LARGE");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const value = await reader.read(); if (value.done) break; length += value.value.byteLength; if (length > limit) { await reader.cancel(); return fail("INSTAGRAM_RESPONSE_TOO_LARGE"); } chunks.push(value.value); } }
  catch (error) { if (error instanceof InstagramOnboardingError) throw error; return fail("INSTAGRAM_PROVIDER_UNAVAILABLE"); }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
