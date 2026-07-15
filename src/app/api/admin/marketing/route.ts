import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

const SECTION_KEYS = new Set(["salons_near_you", "featured_salons", "trending_now", "trending_picks"]);

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    const [{ data: sections, error: sectionError }, { data: videos, error: videoError }] = await Promise.all([
      admin.from("homepage_sections").select("*").order("sort_order"),
      admin.from("trending_videos").select("*,salon:salons(id,name,slug)").order("slot"),
    ]);
    if (sectionError) throw sectionError;
    if (videoError) throw videoError;
    return Response.json({ sections: sections || [], videos: videos || [] });
  } catch (error) {
    console.error("Admin homepage marketing load failed", error);
    return errorResponse(error, "Unable to load homepage marketing settings.");
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "marketing");
    const body = await request.json() as Record<string, unknown>;
    const kind = cleanText(body.kind, 30);
    if (kind === "section") {
      const sectionKey = cleanText(body.section_key, 40);
      if (!SECTION_KEYS.has(sectionKey)) throw new Error("Unknown homepage section.");
      const title = cleanText(body.title, 90);
      if (!title) throw new Error("Enter a section title.");
      const sortOrder = Math.max(1, Math.min(20, Math.round(Number(body.sort_order || 1))));
      const { data, error } = await admin.from("homepage_sections").upsert({ section_key: sectionKey, title, description: cleanText(body.description, 180) || null, is_visible: body.is_visible === true, sort_order: sortOrder, updated_by: user.id, updated_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      return Response.json({ section: data });
    }
    if (kind === "video") {
      const slot = Math.round(Number(body.slot));
      const duration = Number(body.duration_seconds);
      const fileSize = Math.round(Number(body.file_size_bytes));
      const mimeType = cleanText(body.mime_type, 40);
      if (slot < 1 || slot > 6) throw new Error("Choose a card slot from 1 to 6.");
      if (!(duration > 0 && duration <= 30.5)) throw new Error("Trending videos must be 30 seconds or shorter.");
      if (!(fileSize > 0 && fileSize <= 25 * 1024 * 1024)) throw new Error("Trending videos must be 25 MB or smaller.");
      if (!["video/mp4", "video/webm"].includes(mimeType)) throw new Error("Upload an MP4 or WebM video.");
      const videoUrl = cleanText(body.video_url, 1200);
      const storagePath = cleanText(body.storage_path, 600);
      const description = cleanText(body.description, 180);
      const salonId = cleanText(body.salon_id, 60);
      if (!videoUrl || !storagePath || !description || !salonId) throw new Error("Upload a video, select a salon, and enter a description.");
      const { data: salon } = await admin.from("salons").select("id").eq("id", salonId).single();
      if (!salon) throw new Error("The selected salon no longer exists.");
      const { data: existing } = await admin.from("trending_videos").select("storage_path").eq("slot", slot).maybeSingle();
      const { data, error } = await admin.from("trending_videos").upsert({ slot, salon_id: salonId, video_url: videoUrl, storage_path: storagePath, description, duration_seconds: duration, file_size_bytes: fileSize, mime_type: mimeType, is_active: true, updated_by: user.id, updated_at: new Date().toISOString() }).select("*,salon:salons(id,name,slug)").single();
      if (error) throw error;
      if (existing?.storage_path && existing.storage_path !== storagePath) await admin.storage.from("trending-videos").remove([existing.storage_path]);
      return Response.json({ video: data });
    }
    throw new Error("Unknown marketing action.");
  } catch (error) {
    console.error("Admin homepage marketing save failed", error);
    return errorResponse(error, "Unable to save homepage marketing settings.");
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    const slot = Math.round(Number(new URL(request.url).searchParams.get("slot")));
    if (slot < 1 || slot > 6) throw new Error("Choose a valid card slot.");
    const { data: existing } = await admin.from("trending_videos").select("storage_path").eq("slot", slot).maybeSingle();
    const { error } = await admin.from("trending_videos").delete().eq("slot", slot);
    if (error) throw error;
    if (existing?.storage_path) await admin.storage.from("trending-videos").remove([existing.storage_path]);
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("Admin trending video delete failed", error);
    return errorResponse(error, "Unable to remove trending video.");
  }
}
