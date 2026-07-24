import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import {
  normalizeBrandFocalPoint,
  stripBrandAssetVersion,
  versionBrandAssetUrl,
} from "@/lib/brandAssetCore";

type BrandAsset = {
  asset_key: string;
  display_name: string;
  guidance: string;
  allowed_mime_types: string[];
  min_width_px: number;
  min_height_px: number;
  max_bytes: number;
  draft_url?: string | null;
  draft_storage_path?: string | null;
  draft_alt_text?: string | null;
  draft_focal_x?: number | null;
  draft_focal_y?: number | null;
  draft_width_px?: number | null;
  draft_height_px?: number | null;
  published_url?: string | null;
  published_storage_path?: string | null;
  published_alt_text?: string | null;
  published_focal_x?: number | null;
  published_focal_y?: number | null;
  published_width_px?: number | null;
  published_height_px?: number | null;
  published_version: number;
};

const ASSET_KEY = /^[a-z_]{3,40}$/;
const focal = (value: unknown) => {
  const parsed = normalizeBrandFocalPoint(value);
  if (parsed === null)
    rejectRequest("Choose a crop position between 0 and 100.");
  return parsed;
};

async function recordAudit(
  admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"],
  userId: string,
  action: string,
  assetKey: string,
  details: Record<string, unknown> = {},
) {
  const result = await admin.from("admin_security_events").insert({
    actor_user_id: userId,
    action,
    details: { asset_key: assetKey, ...details },
  });
  if (result.error) throw result.error;
}

async function GETHandler(request: Request) {
  let admin;
  try {
    const context = await requireAdminPermission(request, "settings");
    admin = context.admin;
    const [assets, versions] = await Promise.all([
      admin.from("platform_brand_assets").select("*").order("display_name"),
      admin
        .from("platform_brand_asset_versions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(160),
    ]);
    if (assets.error) throw assets.error;
    if (versions.error) throw versions.error;
    return Response.json(
      { assets: assets.data || [], versions: versions.data || [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "brand-appearance",
      action: "load-brand-assets",
      actorRole: "admin",
      provider: "supabase",
      safeMessage: "We couldn't load Brand & Appearance.",
    });
  }
}

async function POSTHandler(request: Request) {
  let admin;
  let assetKey: string | null = null;
  try {
    const context = await requireAdminPermission(request, "settings");
    admin = context.admin;
    const form = await request.formData();
    assetKey = cleanText(form.get("asset_key"), 40);
    if (!ASSET_KEY.test(assetKey)) rejectRequest("Choose a valid brand placement.");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0)
      rejectRequest("Choose an image to upload.");
    const result = await admin
      .from("platform_brand_assets")
      .select("*")
      .eq("asset_key", assetKey)
      .maybeSingle<BrandAsset>();
    if (result.error) throw result.error;
    if (!result.data) rejectRequest("This brand placement is not configured.", 404);
    const asset = result.data;
    if (file.size > Number(asset.max_bytes || 0))
      rejectRequest(`This image exceeds the ${Math.ceil(asset.max_bytes / 1_048_576)} MB limit.`);
    if (!asset.allowed_mime_types.includes(file.type))
      rejectRequest(`Use one of these file types: ${asset.allowed_mime_types.join(", ")}.`);

    const source = Buffer.from(await file.arrayBuffer());
    if (
      file.type === "image/svg+xml" &&
      /<(?:script|foreignObject)|\bon\w+\s*=|javascript:|https?:\/\//i.test(
        source.toString("utf8"),
      )
    ) rejectRequest("This SVG contains unsupported active or external content.");
    const sharp = (await import("sharp")).default;
    const image = sharp(source, { limitInputPixels: 40_000_000 }).rotate();
    const metadata = await image.metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    if (!width || !height) rejectRequest("The uploaded file is not a readable image.");
    if (width < asset.min_width_px || height < asset.min_height_px)
      rejectRequest(`Use an image at least ${asset.min_width_px} × ${asset.min_height_px} pixels.`);
    const social = assetKey === "social_share_image";
    const transformed = social
      ? await image.resize({ width: 2400, height: 1260, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
      : await image.resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    if (transformed.byteLength > asset.max_bytes)
      rejectRequest("The optimized image is still too large. Use a simpler or smaller image.");
    const extension = social ? "jpg" : "png";
    const contentType = social ? "image/jpeg" : "image/png";
    const path = `assets/${assetKey}/${crypto.randomUUID()}.${extension}`;
    const uploaded = await admin.storage.from("platform-brand-assets").upload(path, transformed, {
      cacheControl: "31536000",
      contentType,
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    const publicUrl = admin.storage.from("platform-brand-assets").getPublicUrl(path).data.publicUrl;
    const altText = cleanText(form.get("alt_text"), 180) || "Girlz Culture";
    const draft = await admin
      .from("platform_brand_assets")
      .update({
        draft_url: publicUrl,
        draft_storage_path: path,
        draft_alt_text: altText,
        draft_focal_x: focal(form.get("focal_x") ?? 50),
        draft_focal_y: focal(form.get("focal_y") ?? 50),
        draft_width_px: width,
        draft_height_px: height,
        updated_by: context.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("asset_key", assetKey)
      .select("*")
      .single();
    if (draft.error) throw draft.error;
    await recordAudit(admin, context.user.id, "brand_asset_draft_uploaded", assetKey, {
      width,
      height,
      bytes: transformed.byteLength,
    });
    return Response.json({ asset: draft.data, uploaded: true });
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "brand-appearance",
      action: "upload-brand-asset",
      actorRole: "admin",
      recordType: "platform_brand_asset",
      recordId: assetKey,
      provider: "supabase-storage",
      safeMessage: "We couldn't upload this brand image.",
    });
  }
}

async function PATCHHandler(request: Request) {
  let admin;
  let assetKey: string | null = null;
  try {
    const context = await requireAdminPermission(request, "settings");
    admin = context.admin;
    const body = await request.json() as Record<string, unknown>;
    assetKey = cleanText(body.asset_key, 40);
    const action = cleanText(body.action, 30);
    if (!ASSET_KEY.test(assetKey)) rejectRequest("Choose a valid brand placement.");
    const current = await admin
      .from("platform_brand_assets")
      .select("*")
      .eq("asset_key", assetKey)
      .single<BrandAsset>();
    if (current.error || !current.data) throw current.error || new Error("Brand asset not found.");

    if (action === "save_position") {
      const update = await admin
        .from("platform_brand_assets")
        .update({
          draft_alt_text: cleanText(body.alt_text, 180) || "Girlz Culture",
          draft_focal_x: focal(body.focal_x),
          draft_focal_y: focal(body.focal_y),
          updated_by: context.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("asset_key", assetKey)
        .select("*")
        .single();
      if (update.error) throw update.error;
      await recordAudit(admin, context.user.id, "brand_asset_position_saved", assetKey);
      return Response.json({ asset: update.data });
    }

    let source = current.data;
    let sourceVersion: number | null = null;
    if (action === "restore") {
      const targetVersion = Number(body.target_version);
      if (!Number.isInteger(targetVersion) || targetVersion < 1)
        rejectRequest("Choose a valid prior brand version.");
      const previous = await admin
        .from("platform_brand_asset_versions")
        .select("*")
        .eq("asset_key", assetKey)
        .eq("version", targetVersion)
        .maybeSingle();
      if (previous.error) throw previous.error;
      if (!previous.data) rejectRequest("That prior brand version no longer exists.", 404);
      source = {
        ...current.data,
        draft_url: previous.data.public_url,
        draft_storage_path: previous.data.storage_path,
        draft_alt_text: previous.data.alt_text,
        draft_focal_x: previous.data.focal_x,
        draft_focal_y: previous.data.focal_y,
        draft_width_px: previous.data.width_px,
        draft_height_px: previous.data.height_px,
      };
      sourceVersion = targetVersion;
    } else if (action !== "publish") {
      rejectRequest("Choose publish, restore, or save position.");
    }
    if (!source.draft_url || !source.draft_storage_path)
      rejectRequest("Upload a draft image before publishing.");
    const nextVersion = Number(current.data.published_version || 0) + 1;
    const cacheVersion = Date.now();
    const publishedUrl = versionBrandAssetUrl(String(source.draft_url), cacheVersion);
    const update = await admin
      .from("platform_brand_assets")
      .update({
        published_url: publishedUrl,
        published_storage_path: source.draft_storage_path,
        published_alt_text: source.draft_alt_text || "Girlz Culture",
        published_focal_x: source.draft_focal_x ?? 50,
        published_focal_y: source.draft_focal_y ?? 50,
        published_width_px: source.draft_width_px,
        published_height_px: source.draft_height_px,
        draft_url: stripBrandAssetVersion(String(source.draft_url)),
        draft_storage_path: source.draft_storage_path,
        draft_alt_text: source.draft_alt_text || "Girlz Culture",
        draft_focal_x: source.draft_focal_x ?? 50,
        draft_focal_y: source.draft_focal_y ?? 50,
        draft_width_px: source.draft_width_px,
        draft_height_px: source.draft_height_px,
        published_version: nextVersion,
        cache_version: cacheVersion,
        published_at: new Date().toISOString(),
        updated_by: context.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("asset_key", assetKey)
      .eq("published_version", current.data.published_version)
      .select("*")
      .maybeSingle();
    if (update.error) throw update.error;
    if (!update.data) rejectRequest("This brand asset changed in another session. Reload and try again.", 409);
    const history = await admin.from("platform_brand_asset_versions").insert({
      asset_key: assetKey,
      version: nextVersion,
      action: action === "restore" ? "Restored" : "Published",
      source_version: sourceVersion,
      public_url: publishedUrl,
      storage_path: source.draft_storage_path,
      alt_text: source.draft_alt_text || "Girlz Culture",
      focal_x: source.draft_focal_x ?? 50,
      focal_y: source.draft_focal_y ?? 50,
      width_px: source.draft_width_px,
      height_px: source.draft_height_px,
      created_by: context.user.id,
    });
    if (history.error) throw history.error;
    await recordAudit(
      admin,
      context.user.id,
      action === "restore" ? "brand_asset_restored" : "brand_asset_published",
      assetKey,
      { version: nextVersion, source_version: sourceVersion },
    );
    return Response.json({ asset: update.data, published: true });
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "brand-appearance",
      action: "publish-or-restore-brand-asset",
      actorRole: "admin",
      recordType: "platform_brand_asset",
      recordId: assetKey,
      provider: "supabase",
      safeMessage: "We couldn't update this brand asset.",
    });
  }
}

export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/brand-assets", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/brand-assets", "POST"), POSTHandler);
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/brand-assets", "PATCH"), PATCHHandler);
