import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { monitoredRouteFailure } from "@/lib/platformErrors";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(secret && supplied && secret === supplied);
}

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  try {
    if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
    const { data, error } = await admin
      .from("media_assets")
      .select("id,bucket_id,object_path,renditions")
      .eq("status", "Staged")
      .lt("created_at", cutoff)
      .order("created_at")
      .limit(100);
    if (error) throw error;

    let cleaned = 0;
    for (const asset of data || []) {
      const renditionPaths = Object.values((asset.renditions || {}) as Record<string, { path?: string }>)
        .map((rendition) => rendition.path)
        .filter((path): path is string => Boolean(path));
      const paths = [...new Set([asset.object_path, ...renditionPaths].filter(Boolean))];
      const removal = await admin.storage.from(asset.bucket_id).remove(paths);
      if (removal.error) throw removal.error;
      const archived = await admin.from("media_assets").update({ status: "Archived", archived_at: new Date().toISOString() }).eq("id", asset.id).eq("status", "Staged");
      if (archived.error) throw archived.error;
      cleaned += 1;
    }
    return Response.json({ cleaned, remaining_batch_possible: (data || []).length === 100 });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "media", action: "cleanup_staged_media", actorRole: "system", safeMessage: "Staged media cleanup could not finish." });
  }
}
