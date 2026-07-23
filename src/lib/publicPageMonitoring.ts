import "server-only";

import { capturePlatformError } from "@/lib/platformErrors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function capturePublicPageFailure(
  error: unknown,
  feature: string,
  action: string,
) {
  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    admin = undefined;
  }
  return capturePlatformError({
    admin,
    error,
    feature,
    action,
    actorRole: "public",
    provider: "supabase",
    safeMessage: "This public page could not load all of its current content.",
    severity: "high",
    metadata: { safe_fallback_used: true },
  });
}
