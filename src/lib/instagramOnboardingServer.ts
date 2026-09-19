import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin, requireSalonOwner } from "@/lib/supabaseAdmin";
import { capturePlatformError } from "@/lib/platformErrors";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { emptyOnboardingFacts, onboardingUncertainty } from "@/lib/businessOnboardingDraft";
import { stageInstagramOnboardingPhoto } from "@/lib/instagramOnboardingMediaServer";
import { purgeInstagramOnboardingData } from "@/lib/instagramOnboardingCleanupServer";
import { assertInstagramAccess, instagramAuthorization, instagramConfig, InstagramOnboardingError, InstagramOnboardingProvider, openInstagramSecret, sealInstagramSecret, verifyInstagramSignedRequest, verifyInstagramState, type InstagramConfig } from "@/lib/instagramOnboardingCore";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;
type ImportRow = { id: string; salon_id: string; owner_id: string; generation: number; profile: { user_id: string; username: string; name?: string }; username: string; status: string; created_at: string; expires_at: string; shown_count: number; is_excerpt: boolean; draft_id: string | null };
type Connection = { salon_id: string; owner_id: string; generation: number; status: string; secret: string; provider_user_id: string; app_user_id: string; username: string; expires_at: string };
const cookieName = "__Host-gc-instagram-flow";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const cookie = (state: string, seconds: number) => `${cookieName}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
const uuid = (input: unknown): input is string => typeof input === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input);
const invalid = (): never => { throw new InstagramOnboardingError("INSTAGRAM_INVALID", 400); };
function safe(error: unknown) {
  if (error instanceof InstagramOnboardingError) return error;
  if (error instanceof RateLimitError) return new InstagramOnboardingError("INSTAGRAM_RATE_LIMITED", 429);
  const message = String((error as { message?: unknown })?.message || "");
  if (/Unauthorized|Forbidden|ONBOARDING_FORBIDDEN/.test(message)) return new InstagramOnboardingError("INSTAGRAM_ACCESS_DENIED", 403);
  return new InstagramOnboardingError("INSTAGRAM_UNAVAILABLE");
}
async function failure(request: Request, error: unknown, c?: Context) {
  const problem = safe(error);
  const reference = await capturePlatformError({ request, admin: c?.admin, actorId: c?.user.id, salonId: c?.salon.id, error: Error(problem.code), feature: "instagram-onboarding", action: request.method.toLowerCase(), actorRole: c ? "salon" : "system", safeMessage: "The private Instagram import could not be completed. Manual setup remains available." });
  return Response.json({ code: problem.code, request_id: reference }, { status: problem.status, headers: { ...headers, "X-Request-ID": reference } });
}
async function mutate(c: Context, action: string, args: Row = {}) {
  const result = await c.admin.rpc("manage_business_instagram", { p_salon: c.salon.id, p_owner: c.user.id, p_action: action, p_args: args });
  if (result.error) { const code = /^INSTAGRAM_[A-Z_]+$/.test(result.error.message) ? result.error.message : "INSTAGRAM_UNAVAILABLE"; throw new InstagramOnboardingError(code, /DENIED/.test(code) ? 403 : /CHANGED|CONFLICT|UNAVAILABLE|NOT_OWNED/.test(code) ? 409 : 503); }
  return result.data as Row;
}
async function freshOwner(c: Context) {
  const result = await c.admin.rpc("instagram_onboarding_owner", { p_salon: c.salon.id, p_owner: c.user.id });
  if (result.error || result.data !== true) throw new InstagramOnboardingError("INSTAGRAM_ACCESS_DENIED", 403);
}
async function connection(c: Context) {
  const result = await c.admin.from("business_instagram_connections").select("salon_id,owner_id,generation,status,secret,provider_user_id,app_user_id,username,expires_at").eq("salon_id", c.salon.id).eq("owner_id", c.user.id).maybeSingle();
  if (result.error) throw new InstagramOnboardingError("INSTAGRAM_UNAVAILABLE");
  if (result.data && (result.data.salon_id !== c.salon.id || result.data.owner_id !== c.user.id)) throw new InstagramOnboardingError("INSTAGRAM_ACCESS_DENIED", 403);
  return result.data as Connection | null;
}
async function importById(c: Context, id: string) {
  const result = await c.admin.from("business_instagram_imports").select("id,salon_id,owner_id,generation,profile,username,status,created_at,expires_at,shown_count,is_excerpt,draft_id").eq("id", id).eq("salon_id", c.salon.id).eq("owner_id", c.user.id).maybeSingle();
  if (result.error) throw new InstagramOnboardingError("INSTAGRAM_UNAVAILABLE");
  if (!result.data || result.data.salon_id !== c.salon.id || result.data.owner_id !== c.user.id || !["ready", "drafted"].includes(result.data.status) || Date.parse(result.data.expires_at) <= Date.now()) throw new InstagramOnboardingError("INSTAGRAM_IMPORT_UNAVAILABLE", 409);
  return result.data as ImportRow;
}
async function projectedImport(c: Context, imported: ImportRow) {
  const result = await c.admin.from("business_instagram_import_assets").select("id,import_id,salon_id,owner_id,private_path,status,timestamp").eq("import_id", imported.id).eq("salon_id", c.salon.id).eq("owner_id", c.user.id).limit(17);
  if (result.error || !Array.isArray(result.data) || result.data.length > 16 || result.data.some(row => row.salon_id !== c.salon.id || row.owner_id !== c.user.id || row.import_id !== imported.id || !uuid(row.id) || !["staged", "prepared", "applied"].includes(row.status) || !["jpg", "png"].some(extension => row.private_path === `${c.salon.id}/instagram-onboarding/${imported.id}/${row.id}.${extension}`))) throw new InstagramOnboardingError("INSTAGRAM_IMPORT_UNAVAILABLE", 409);
  const media = [];
  for (const row of result.data) {
    const signed = await c.admin.storage.from("media-originals").createSignedUrl(row.private_path, 120);
    if (signed.error || !signed.data?.signedUrl) throw new InstagramOnboardingError("INSTAGRAM_IMPORT_UNAVAILABLE", 409);
    media.push({ id: row.id, preview_url: signed.data.signedUrl, timestamp: row.timestamp });
  }
  await freshOwner(c); await importById(c, imported.id);
  return { id: imported.id, profile: { username: imported.username, name: imported.profile.name || "" }, media, shown_count: media.length, is_excerpt: imported.is_excerpt };
}
async function readSource(c: Context, config: InstagramConfig) {
  const current = await connection(c);
  if (!current || current.status !== "connected" || Date.parse(current.expires_at) <= Date.now()) throw new InstagramOnboardingError("INSTAGRAM_AUTH_RECONNECT", 409);
  const token = openInstagramSecret(current.secret, c.salon.id, config.key);
  if (token.user_id !== current.app_user_id || token.expires_at <= Date.now()) throw new InstagramOnboardingError("INSTAGRAM_AUTH_RECONNECT", 409);
  const claim = await mutate(c, "claim_import", { id: randomUUID(), generation: current.generation });
  const claimed = claim.import as ImportRow;
  if (claim.existing) return projectedImport(c, await importById(c, claimed.id));
  const provider = new InstagramOnboardingProvider(config), profile = await provider.profile(token);
  if (profile.user_id !== current.provider_user_id || profile.username !== current.username) throw new InstagramOnboardingError("INSTAGRAM_ACCOUNT_MISMATCH", 409);
  const read = await provider.media(token, profile.user_id), assets: Row[] = [];
  for (const item of read.media) {
    // Durable reservation precedes bytes so interrupted uploads remain purgeable.
    const assetId = randomUUID(); await mutate(c, "reserve_asset", { import_id: claimed.id, asset_id: assetId, provider_media_id: item.id });
    const image = await provider.download(item.media_url);
    const staged = await stageInstagramOnboardingPhoto(c, { importId: claimed.id, assetId, ...image });
    assets.push({ id: assetId, provider_media_id: item.id, private_path: staged.storage_path, private_sha256: staged.checksum_sha256, mime: staged.mime_type, width: staged.width, height: staged.height, timestamp: item.timestamp });
  }
  await mutate(c, "finish_import", { id: claimed.id, profile, assets, is_excerpt: read.is_excerpt });
  return projectedImport(c, await importById(c, claimed.id));
}
export async function instagramOnboardingRequest(request: Request) {
  let c: Context | undefined;
  try {
    c = await requireSalonOwner(request); if (!c.isOwner) throw new InstagramOnboardingError("INSTAGRAM_ACCESS_DENIED", 403);
    await freshOwner(c); enforceRateLimit(request, `instagram-onboarding:${c.user.id}`, 12, 60_000);
    const config = instagramConfig(), origin = new URL(request.url).origin;
    if (new URL(request.url).searchParams.size) invalid();
    if (request.method === "GET") {
      try { assertInstagramAccess(config, origin, c.user.id); } catch { return Response.json({ status: "unavailable", reason: "INSTAGRAM_ACTIVATION_REQUIRED" }, { headers }); }
      const current = await connection(c);
      const latest = await c.admin.from("business_instagram_imports").select("id").eq("salon_id", c.salon.id).eq("owner_id", c.user.id).in("status", ["ready", "drafted"]).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latest.error) throw new InstagramOnboardingError("INSTAGRAM_UNAVAILABLE");
      const imported = latest.data ? await projectedImport(c, await importById(c, latest.data.id)) : undefined;
      await freshOwner(c);
      return Response.json({ status: current?.status === "connected" && Date.parse(current.expires_at) > Date.now() ? "connected" : "disconnected", ...(current?.username ? { account: { username: current.username } } : {}), ...(imported ? { import: imported } : {}) }, { headers });
    }
    const text = await request.text(); if (text.length > 4096) invalid();
    let input: Row; try { input = JSON.parse(text); } catch { return invalid(); }
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !["action", "permitted", "import_id", "media_ids", "locale", "request_id"].includes(k))) invalid();
    if (input.action === "disconnect") return Response.json(await mutate(c, "disconnect"), { headers });
    assertInstagramAccess(config, origin, c.user.id);
    if (input.action === "authorize") {
      if (input.permitted !== true) invalid(); const auth = instagramAuthorization(config); await mutate(c, "flow", { state_hash: auth.stateHash });
      return Response.json({ authorization_url: auth.url }, { headers: { ...headers, "Set-Cookie": cookie(auth.state, 600) } });
    }
    if (input.action === "read") return Response.json({ import: await readSource(c, config) }, { headers });
    if (input.action === "create_draft") {
      if (input.permitted !== true || !uuid(input.import_id) || !uuid(input.request_id) || !["en", "fr", "es", "zh-CN"].includes(String(input.locale)) || !Array.isArray(input.media_ids) || input.media_ids.length > 16 || input.media_ids.some(value => !uuid(value)) || new Set(input.media_ids).size !== input.media_ids.length) invalid();
      const imported = await importById(c, input.import_id as string), facts = emptyOnboardingFacts();
      facts.identity.name = imported.profile.name || ""; facts.photos = (input.media_ids as string[]).map(value => `instagram-asset:${value}`);
      const draft = await mutate(c, "create_draft", { import_id: imported.id, request_id: input.request_id, locale: input.locale, facts, uncertain: onboardingUncertainty(facts) });
      const readback = await c.admin.from("business_onboarding_drafts").select("id,revision,status,source,facts,uncertain,result,created_at").eq("id", draft.id).eq("salon_id", c.salon.id).eq("created_by", c.user.id).single();
      if (readback.error || !readback.data || readback.data.revision !== draft.revision || readback.data.status !== "draft") throw new InstagramOnboardingError("INSTAGRAM_READBACK_FAILED");
      await freshOwner(c); return Response.json({ draft: readback.data, verified: true, published: false }, { headers });
    }
    return invalid();
  } catch (error) { return failure(request, error, c); }
}
export async function instagramOnboardingCallback(request: Request) {
  try {
    const config = instagramConfig(); if (!config) throw new InstagramOnboardingError("INSTAGRAM_ACTIVATION_REQUIRED");
    const url = new URL(request.url), stored = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(cookieName + "="))?.slice(cookieName.length + 1) || "";
    const hash = verifyInstagramState(url.searchParams.get("state") || "", stored), admin = getSupabaseAdmin();
    const consumed = await admin.rpc("consume_business_instagram_flow", { p_hash: hash });
    if (consumed.error || !consumed.data) throw new InstagramOnboardingError("INSTAGRAM_AUTHORIZATION_EXPIRED", 400);
    const flow = consumed.data as { salon_id: string; owner_id: string; generation: number }; assertInstagramAccess(config, url.origin, flow.owner_id);
    if (url.searchParams.has("error")) throw new InstagramOnboardingError("INSTAGRAM_AUTHORIZATION_CANCELLED", 400);
    const provider = new InstagramOnboardingProvider(config), token = await provider.exchange(url.searchParams.get("code") || "");
    // Reject a previously bound foreign account before reading its profile/media.
    const binding = await admin.rpc("instagram_onboarding_account_available", { p_salon: flow.salon_id, p_owner: flow.owner_id, p_user: token.user_id });
    if (binding.error || binding.data !== true) throw new InstagramOnboardingError("INSTAGRAM_ACCOUNT_MISMATCH", 403);
    const profile = await provider.profile(token);
    const result = await admin.rpc("manage_business_instagram", { p_salon: flow.salon_id, p_owner: flow.owner_id, p_action: "authorize", p_args: { generation: flow.generation, secret: sealInstagramSecret(token, flow.salon_id, config.key), app_user_id: token.user_id, provider_user_id: profile.user_id, username: profile.username, expires_at: new Date(token.expires_at).toISOString() } });
    if (result.error) throw new InstagramOnboardingError("INSTAGRAM_CONNECTION_CHANGED", 409);
    return new Response(null, { status: 303, headers: { ...headers, Location: "/salon/onboarding/import?instagram=connected", "Set-Cookie": cookie("", 0) } });
  } catch (error) { const response = await failure(request, error); response.headers.set("Set-Cookie", cookie("", 0)); return response; }
}

// Callback verification remains available when new connections are disabled;
// deleting previously imported provider data must not depend on the launch gate.
export async function instagramOnboardingDeletion(request: Request) {
  try {
    const raw = await request.text(); if (raw.length > 12_000) invalid();
    const secret = process.env.INSTAGRAM_ONBOARDING_CLIENT_SECRET || "";
    const signed = new URLSearchParams(raw).get("signed_request") || "";
    const verified = verifyInstagramSignedRequest(signed, secret);
    const configured = new URL(process.env.INSTAGRAM_ONBOARDING_REDIRECT_URI || "");
    if (configured.protocol !== "https:" || configured.origin !== new URL(request.url).origin || configured.username || configured.password) invalid();
    const admin = getSupabaseAdmin();
    const done = await purgeInstagramOnboardingData(admin, verified.user_id, verified.code);
    return Response.json({ url: `${configured.origin}/api/salon/onboarding-instagram/deletion-status?code=${verified.code}`, confirmation_code: verified.code, status: done ? "complete" : "pending" }, { headers });
  } catch (error) { return failure(request, error); }
}
export async function instagramOnboardingDeletionStatus(request: Request) {
  const code = new URL(request.url).searchParams.get("code") || "";
  if (!/^[a-f0-9]{64}$/.test(code)) return Response.json({ status: "unknown" }, { status: 404, headers });
  const result = await getSupabaseAdmin().from("business_instagram_deletions").select("status").eq("code", code).maybeSingle();
  if (result.error || !result.data) return Response.json({ status: "unknown" }, { status: 404, headers });
  return Response.json({ status: result.data.status }, { headers });
}
