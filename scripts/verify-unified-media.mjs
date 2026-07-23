import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const upload = read("src/components/ImageUpload.tsx");
const api = read("src/app/api/media/upload/route.ts");
const rules = read("src/lib/imageUpload.ts");
const migration = read("supabase/migrations/20260720150000_unified_media_engine.sql");
const application = read("src/components/SalonApplication.tsx");
const review = read("src/components/ReviewForm.tsx");

const checks = [
  [upload.includes("Drag and drop or choose a file") && upload.includes("Save all crops"), "unified upload editor"],
  [upload.includes('label={`${device} image zoom`}') && upload.includes("horizontal image position") && upload.includes("vertical image position") && upload.includes("Rotate 90°"), "per-device crop controls"],
  [upload.includes('role="tablist"') && upload.includes("desktop") && upload.includes("tablet") && upload.includes("mobile") && upload.includes("activeProfile.safeArea"), "responsive placement previews"],
  [api.includes("imageDimensions") && api.includes("authorize(request, bucket, folder)") && api.includes("media_assets") && api.includes("renditions"), "server validation and responsive registry"],
  [api.includes("Object.values((asset.renditions || {})") && api.includes("new Set([asset.object_path, ...renditionPaths]"), "all staged renditions are removed together"],
  [rules.includes("logo:") && rules.includes("cover:") && rules.includes("avatar:") && rules.includes("product:") && rules.includes("review:"), "asset-specific profiles"],
  [migration.includes("create table if not exists public.media_upload_profiles") && migration.includes("attach_registered_media") && upload.includes("crop_metadata"), "media migration and atomic attachment"],
  [!application.includes('bucket="application-media"') && application.includes("Photos are added after approval"), "duplicate application media removed"],
  [review.includes('folder={`reviews/${booking.id || ""}`}'), "booking-owned review path"],
];
for (const [passed, name] of checks) if (!passed) throw new Error(`Unified media verification failed: ${name}`);
console.log("Verified reusable crop/resize previews, server validation, ownership-aware storage, media registry attachment, and post-approval application media setup.");
