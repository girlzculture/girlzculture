import "server-only";
import type { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { InstagramOnboardingError } from "@/lib/instagramOnboardingCore";
type Admin = ReturnType<typeof getSupabaseAdmin>;
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
/** Exact durable path reservations, never a caller-provided bucket or URL. */
export async function purgeInstagramOnboardingData(admin: Admin, user: string, code: string) {
  const marked = await admin.rpc("delete_business_instagram_data", { p_user: user, p_code: code });
  if (marked.error || !marked.data) throw new InstagramOnboardingError("INSTAGRAM_DELETION_PENDING");
  if (marked.data.complete === true) return true;
  if (marked.data.busy === true) return false;
  if (!Array.isArray(marked.data.assets) || marked.data.assets.length > 160) throw new InstagramOnboardingError("INSTAGRAM_DELETION_PENDING");
  for (const asset of marked.data.assets as { id: string; salon_id: string; import_id: string }[]) {
    if (![asset.id, asset.salon_id, asset.import_id].every(uuid)) throw new InstagramOnboardingError("INSTAGRAM_DELETION_PENDING");
    const prefix = `${asset.salon_id}/instagram-onboarding/${asset.import_id}/${asset.id}`;
    for (const bucket of ["media-originals", "salon-photos"]) {
      const removed = await admin.storage.from(bucket).remove([`${prefix}.jpg`, `${prefix}.png`]);
      if (removed.error) throw new InstagramOnboardingError("INSTAGRAM_DELETION_PENDING");
    }
  }
  const finished = await admin.rpc("delete_business_instagram_data", { p_user: user, p_code: code, p_complete: true });
  if (finished.error || !finished.data) throw new InstagramOnboardingError("INSTAGRAM_DELETION_PENDING");
  return finished.data.complete === true;
}
/** Reuses the existing authenticated daily media cleanup lifecycle. No provider
 * calls, secrets, public inventories, new scheduler or automatic import writes. */
export async function processInstagramOnboardingCleanup(admin: Admin) {
  const expired = await admin.rpc("queue_business_instagram_expiry");
  if (expired.error || !Array.isArray(expired.data) || expired.data.length > 10) throw new InstagramOnboardingError("INSTAGRAM_DELETION_PENDING");
  let expiredCompleted = 0, expiredFailed = 0;
  for (const imported of expired.data) {
    try {
      if (!uuid(imported.id) || typeof imported.private_only !== "boolean" || !Array.isArray(imported.assets) || imported.assets.length > 16) throw new InstagramOnboardingError("INSTAGRAM_DELETION_PENDING");
      for (const asset of imported.assets) {
        if (![asset.id, asset.import_id, asset.salon_id].every(uuid) || asset.import_id !== imported.id || typeof asset.preserve_public !== "boolean" || asset.preserve_public && !imported.private_only) throw new InstagramOnboardingError("INSTAGRAM_DELETION_PENDING");
        const prefix = `${asset.salon_id}/instagram-onboarding/${asset.import_id}/${asset.id}`;
        for (const bucket of asset.preserve_public ? ["media-originals"] : ["media-originals", "salon-photos"]) {
          const removed = await admin.storage.from(bucket).remove([`${prefix}.jpg`, `${prefix}.png`]);
          if (removed.error) throw new InstagramOnboardingError("INSTAGRAM_DELETION_PENDING");
        }
      }
      const completed = await admin.rpc("finish_business_instagram_expiry", { p_id: imported.id, p_private_only: imported.private_only });
      if (completed.error) throw new InstagramOnboardingError("INSTAGRAM_DELETION_PENDING"); expiredCompleted++;
    } catch { expiredFailed++; }
  }
  const pending = await admin.from("business_instagram_deletions").select("code,provider_user_id").eq("status", "pending").order("created_at").limit(10);
  if (pending.error || !Array.isArray(pending.data)) throw new InstagramOnboardingError("INSTAGRAM_DELETION_PENDING");
  let completed = expiredCompleted, failed = expiredFailed;
  for (const item of pending.data) {
    try { if (await purgeInstagramOnboardingData(admin, item.provider_user_id, item.code)) completed++; }
    catch { failed++; }
  }
  return { examined: pending.data.length + expired.data.length, completed, failed, pending: pending.data.length + expired.data.length - completed, remaining_batch_possible: pending.data.length === 10 || expired.data.length === 10 };
}
