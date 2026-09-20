import "server-only";
import { createHash } from "crypto";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { inspectCanonicalMediaSource, createCanonicalMediaRendition } from "@/lib/mediaImageProcessor";
import { MEDIA_SOURCE_BUCKET } from "@/lib/mediaUploadProtocol";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/imageUpload";
import { instagramOnboardingAssetId, preservedInstagramOnboardingSource, type InstagramOnboardingPreview } from "@/lib/instagramOnboardingMedia";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type SavedDraft = { id: string; revision: number; source: Record<string, unknown>; facts: { photos: string[] }; status?: string };
type Asset = { id: string; import_id: string; salon_id: string; owner_id: string; private_path: string; private_sha256: string; mime: string; width: number; height: number; status: string; public_path: string | null; public_url: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = () => new Error("ONBOARDING_INSTAGRAM_UNAVAILABLE");
const notOwned = () => new Error("ONBOARDING_PHOTO_NOT_OWNED");
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const privatePath = (salonId: string, importId: string, assetId: string, mime: string) => `${salonId}/instagram-onboarding/${importId}/${assetId}.${mime === "image/png" ? "png" : "jpg"}`;

async function removeCreated(context: Context, bucket: string, path: string) {
 const result = await context.admin.storage.from(bucket).remove([path]);
 if (result.error) throw new Error("ONBOARDING_INSTAGRAM_CLEANUP_PENDING");
}

/** storage-js upload does not accept AbortSignal. Its signed-upload endpoint
 * does, using the same PUT shape but with a bounded server-side request. */
async function boundedUpload(context: Context, bucket: string, path: string, bytes: Buffer, mime: string, cacheSeconds: number, beforeWrite: () => Promise<void>) {
 const signed = await context.admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
 if (signed.error || !signed.data?.signedUrl) throw unavailable();
 const target = new URL(signed.data.signedUrl), expected = new URL(context.admin.storage.from(bucket).getPublicUrl(path).data.publicUrl);
 if (target.origin !== expected.origin || target.protocol !== "https:" || target.username || target.password || !target.pathname.endsWith(`/object/upload/sign/${bucket}/${path}`)) throw unavailable();
 await beforeWrite();
 const response = await fetch(target, { method: "PUT", body: Uint8Array.from(bytes), headers: { "Content-Type": mime, "cache-control": `max-age=${cacheSeconds}`, "x-upsert": "false" }, signal: AbortSignal.timeout(20_000), redirect: "error" });
 return response.ok;
}

async function stageReservation(context: Context, importId: string, assetId: string, expected?: { path: string; checksum: string }) {
 await owner(context);
 const [parent, child] = await Promise.all([
  context.admin.from("business_instagram_imports").select("id,salon_id,owner_id,status").eq("id", importId).eq("salon_id", context.salon.id).eq("owner_id", context.user.id).maybeSingle(),
  context.admin.from("business_instagram_import_assets").select("id,import_id,salon_id,owner_id,status,private_path,private_sha256,staging_until").eq("id", assetId).eq("import_id", importId).eq("salon_id", context.salon.id).eq("owner_id", context.user.id).maybeSingle(),
 ]);
 if (parent.error || child.error) throw unavailable();
 if (parent.data?.id !== importId || parent.data.salon_id !== context.salon.id || parent.data.owner_id !== context.user.id || child.data?.id !== assetId || child.data.import_id !== importId || child.data.salon_id !== context.salon.id || child.data.owner_id !== context.user.id) throw notOwned();
 if (expected && ["ready", "drafted"].includes(parent.data.status) && child.data.status === "staged" && child.data.private_path === expected.path && child.data.private_sha256 === expected.checksum) return "staged";
 if (parent.data.status !== "reading" || child.data.status !== "reserved" || !Number.isFinite(Date.parse(child.data.staging_until)) || Date.parse(child.data.staging_until) - Date.now() < 30_000) throw notOwned();
 return "reserved";
}

async function owner(context: Context) {
 const { admin, salon, user } = context;
 if (!context.isOwner) throw new Error("ONBOARDING_FORBIDDEN");
 const [access, current] = await Promise.all([
  admin.rpc("p0_actor_has_permission", { p_salon: salon.id, p_user: user.id, p_permission: "my_page" }),
  admin.from("salons").select("id").eq("id", salon.id).eq("user_id", user.id).maybeSingle(),
 ]);
 if (access.error || current.error) throw unavailable();
 if (access.data !== true || current.data?.id !== salon.id) throw new Error("ONBOARDING_FORBIDDEN");
}

async function verifiedBytes(context: Context, bucket: string, path: string, expected: string) {
 const read = await context.admin.storage.from(bucket).download(path);
 if (read.error || !read.data || read.data.size > MAX_IMAGE_UPLOAD_BYTES) throw unavailable();
 const bytes = Buffer.from(await read.data.arrayBuffer());
 if (!bytes.length || bytes.length > MAX_IMAGE_UPLOAD_BYTES || digest(bytes) !== expected) throw unavailable();
 return bytes;
}

/** Backend provides bytes from its bounded permitted Meta download, never a URL.
 * This helper neither contacts Meta nor inserts any public gallery record. */
export async function stageInstagramOnboardingPhoto(context: Context, input: { importId: string; assetId: string; bytes: Buffer; declaredMimeType: string }) {
 await owner(context);
 if (![context.salon.id, context.user.id, input.importId, input.assetId].every(id => uuid.test(id)) || !Buffer.isBuffer(input.bytes) || !input.bytes.length || input.bytes.length > MAX_IMAGE_UPLOAD_BYTES) throw unavailable();
 const source = await inspectCanonicalMediaSource(input.bytes, input.declaredMimeType);
 if (!["image/jpeg", "image/png"].includes(source.mimeType) || source.normalizedBuffer.length > MAX_IMAGE_UPLOAD_BYTES) throw unavailable();
 const path = privatePath(context.salon.id, input.importId, input.assetId, source.mimeType), checksum = digest(source.normalizedBuffer);
 let created = false;
 try {
  const reservation = await stageReservation(context, input.importId, input.assetId, { path, checksum });
  // A finalized identical retry is read-only; a reserved writer cannot overwrite.
  if (reservation === "reserved") created = await boundedUpload(context, MEDIA_SOURCE_BUCKET, path, source.normalizedBuffer, source.mimeType, 120, async () => { await stageReservation(context, input.importId, input.assetId); });
  await verifiedBytes(context, MEDIA_SOURCE_BUCKET, path, checksum);
  await stageReservation(context, input.importId, input.assetId, { path, checksum });
 } catch (error) { if (created) await removeCreated(context, MEDIA_SOURCE_BUCKET, path); throw error; }
 return { bucket_id: MEDIA_SOURCE_BUCKET, storage_path: path, mime_type: source.mimeType, file_size_bytes: source.normalizedBuffer.length, checksum_sha256: checksum, width: source.width, height: source.height };
}

/** Validates the entire selected asset set before signing, copying or applying. */
export async function readInstagramOnboardingAssets(context: Context, source: Record<string, unknown>, photos: readonly string[], allowApplied = false): Promise<Asset[]> {
 const ids = photos.map(instagramOnboardingAssetId).filter((id): id is string => id !== null);
 if (!ids.length) return [];
 await owner(context);
 if (ids.length > 16 || new Set(ids).size !== ids.length) throw notOwned();
 const imported = preservedInstagramOnboardingSource(source, { kind: String(source.kind), reference: String(source.reference) });
 if (!imported || ids.some(id => !imported.media_ids.includes(id))) throw notOwned();
 const read = await context.admin.from("business_instagram_imports").select("id,salon_id,owner_id,status,expires_at,draft_id").eq("id", imported.import_id).eq("salon_id", context.salon.id).eq("owner_id", context.user.id).maybeSingle();
 if (read.error) throw unavailable();
 if (!read.data || read.data.id !== imported.import_id || read.data.salon_id !== context.salon.id || read.data.owner_id !== context.user.id || !["ready", "drafted"].includes(read.data.status)
  || !allowApplied && (!Number.isFinite(Date.parse(read.data.expires_at)) || Date.parse(read.data.expires_at) <= Date.now())) throw notOwned();
 const assets = await context.admin.from("business_instagram_import_assets").select("id,import_id,salon_id,owner_id,private_path,private_sha256,mime,width,height,status,public_path,public_url").eq("import_id", imported.import_id).eq("salon_id", context.salon.id).eq("owner_id", context.user.id).in("id", ids).limit(16);
 if (assets.error || !Array.isArray(assets.data)) throw unavailable();
 const rows = assets.data as Asset[];
 if (rows.length !== ids.length || new Set(rows.map(row => row.id)).size !== ids.length || rows.some(row => !ids.includes(row.id) || row.import_id !== imported.import_id || row.salon_id !== context.salon.id || row.owner_id !== context.user.id
  || !["staged", "prepared", ...(allowApplied ? ["applied"] : [])].includes(row.status) || !["image/jpeg", "image/png"].includes(row.mime) || !/^[a-f0-9]{64}$/.test(row.private_sha256)
  || row.private_path !== privatePath(context.salon.id, imported.import_id, row.id, row.mime) || !Number.isSafeInteger(row.width) || !Number.isSafeInteger(row.height) || row.width <= 0 || row.height <= 0)) throw notOwned();
 await owner(context);
 return rows;
}

export async function instagramOnboardingPreviews(context: Context, drafts: SavedDraft[]): Promise<InstagramOnboardingPreview[]> {
 const previews = new Map<string, string>();
 for (const draft of drafts) {
  let assets: Asset[];
  const imported = preservedInstagramOnboardingSource(draft.source, { kind: String(draft.source.kind), reference: String(draft.source.reference) });
  const photos = draft.status === "draft" && imported ? imported.media_ids.map(id => `instagram-asset:${id}`) : draft.facts.photos;
  try { assets = await readInstagramOnboardingAssets(context, draft.source, photos, draft.status === "applied"); }
  catch (error) { if (error instanceof Error && error.message === "ONBOARDING_FORBIDDEN") throw error; continue; }
  for (const asset of assets) {
   const token = `instagram-asset:${asset.id}`;
   if (asset.status === "applied") {
    const allowedPaths = ["image/jpeg", "image/png"].map(mime => privatePath(context.salon.id, asset.import_id, asset.id, mime));
    if (!asset.public_path || !allowedPaths.includes(asset.public_path) || asset.public_url !== context.admin.storage.from("salon-photos").getPublicUrl(asset.public_path).data.publicUrl) continue;
    previews.set(token, asset.public_url); continue;
   }
   const signed = await context.admin.storage.from(MEDIA_SOURCE_BUCKET).createSignedUrl(asset.private_path, 120);
   if (signed.error || !signed.data?.signedUrl) continue;
   previews.set(token, signed.data.signedUrl);
  }
 }
 if (previews.size) await owner(context);
 return [...previews].map(([token, url]) => ({ token, url }));
}

/** Called only after the existing exact six-section confirmation was validated.
 * Canonical SQL apply alone attaches the prepared URLs to the business page. */
export async function prepareInstagramOnboardingPhotos(context: Context, draft: SavedDraft) {
 if (!uuid.test(draft.id) || !Number.isSafeInteger(draft.revision) || draft.revision < 1 || draft.status !== "draft") throw notOwned();
 const assets = await readInstagramOnboardingAssets(context, draft.source, draft.facts.photos);
 const prepared: { token: string; url: string }[] = [];
 for (const asset of assets) {
  const bytes = await verifiedBytes(context, MEDIA_SOURCE_BUCKET, asset.private_path, asset.private_sha256);
  const source = await inspectCanonicalMediaSource(bytes, asset.mime);
  if (source.mimeType !== asset.mime || source.width !== asset.width || source.height !== asset.height) throw unavailable();
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
  const rendition = await createCanonicalMediaRendition({ source, target: { width: Math.max(1, Math.round(source.width * scale)), height: Math.max(1, Math.round(source.height * scale)) }, quality: 88, maximumBytes: 4 * 1024 * 1024 });
  const path = privatePath(context.salon.id, asset.import_id, asset.id, rendition.mimeType);
  const publicUrl = context.admin.storage.from("salon-photos").getPublicUrl(path).data.publicUrl;
  const lease = await context.admin.rpc("manage_business_instagram", { p_salon: context.salon.id, p_owner: context.user.id, p_action: "begin_prepare", p_args: { asset_id: asset.id, draft_id: draft.id, revision: draft.revision, private_sha256: asset.private_sha256 } });
  if (lease.error) throw unavailable();
  let created = false;
  try {
   created = await boundedUpload(context, "salon-photos", path, rendition.buffer, rendition.mimeType, 31536000, async () => {
    await readInstagramOnboardingAssets(context, draft.source, draft.facts.photos);
    const current = await context.admin.from("business_instagram_import_assets").select("staging_until").eq("id", asset.id).eq("import_id", asset.import_id).eq("salon_id", context.salon.id).eq("owner_id", context.user.id).maybeSingle();
    if (current.error || !current.data || !Number.isFinite(Date.parse(current.data.staging_until)) || Date.parse(current.data.staging_until) - Date.now() < 30_000) throw notOwned();
   });
   await verifiedBytes(context, "salon-photos", path, rendition.checksum);
   const marked = await context.admin.rpc("manage_business_instagram", { p_salon: context.salon.id, p_owner: context.user.id, p_action: "prepare_asset", p_args: { asset_id: asset.id, private_sha256: asset.private_sha256, public_path: path, public_url: publicUrl, draft_id: draft.id, revision: draft.revision } });
   if (marked.error) throw unavailable();
  } catch (error) {
   if (created) {
    const saved = await context.admin.from("business_instagram_import_assets").select("status,public_path,public_url").eq("id", asset.id).eq("salon_id", context.salon.id).eq("owner_id", context.user.id).maybeSingle();
    // A lost RPC response may already have attached/prepared the image. Preserve
    // it on uncertain readback; durable cleanup owns unresolved lease recovery.
    if (!saved.error && (!saved.data || !["prepared", "applied"].includes(saved.data.status) || saved.data.public_path !== path || saved.data.public_url !== publicUrl)) await removeCreated(context, "salon-photos", path);
   }
   throw error;
  }
  prepared.push({ token: `instagram-asset:${asset.id}`, url: publicUrl });
 }
 if (assets.length) await owner(context);
 return prepared;
}
