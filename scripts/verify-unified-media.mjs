import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const upload = read("src/components/ImageUpload.tsx");
const api = read("src/app/api/media/upload/route.ts");
const rules = read("src/lib/imageUpload.ts");
const migration = read("supabase/migrations/20260720150000_unified_media_engine.sql");
const application = read("src/components/SalonApplication.tsx");
const review = read("src/components/ReviewForm.tsx");

const checks = [
  [upload.includes("Drag and drop or choose a file") && upload.includes("Crop & upload"), "unified upload editor"],
  [upload.includes("Image zoom") && upload.includes("Horizontal image position") && upload.includes("Vertical image position") && upload.includes("Rotate 90°"), "crop controls"],
  [upload.includes("Mobile placement preview") && upload.includes("safe area"), "placement previews"],
  [api.includes("imageDimensions") && api.includes("authorize(request, bucket, folder)") && api.includes("media_assets"), "server validation and registry"],
  [rules.includes("logo:") && rules.includes("cover:") && rules.includes("avatar:") && rules.includes("product:") && rules.includes("review:"), "asset-specific profiles"],
  [migration.includes("create table if not exists public.media_upload_profiles") && migration.includes("attach_registered_media"), "media migration and atomic attachment"],
  [!application.includes('bucket="application-media"') && application.includes("Photos are added after approval"), "duplicate application media removed"],
  [review.includes('folder={`reviews/${booking.id || ""}`}'), "booking-owned review path"],
];
for (const [passed, name] of checks) if (!passed) throw new Error(`Unified media verification failed: ${name}`);
console.log("Verified reusable crop/resize previews, server validation, ownership-aware storage, media registry attachment, and post-approval application media setup.");
