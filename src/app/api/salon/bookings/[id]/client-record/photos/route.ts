import { createHash } from "node:crypto";
import sharp from "sharp";
import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { clientFailure, clientHeaders, readBusinessClientCard, type ClientContext } from "@/lib/businessClientServer";
import { clientLocales, clientUuid } from "@/lib/businessClientCore";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
async function post(request: Request, route: { params: Promise<{ id: string }> }) {
  let context: ClientContext | undefined;
  try {
    context = await requireSalonPermission(request, "client_history");
    enforceRateLimit(request, `client-photo:${context.user.id}`, 12, 60_000);
    const { id } = await route.params;
    const card = await readBusinessClientCard(context, id);
    if (!card.permissions.client_edit || !card.permissions.client_photos) throw Error("CLIENT_ACCESS_DENIED");
    if (new URL(request.url).searchParams.size || Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024) throw Error("CLIENT_INVALID");
    const form = await request.formData();
    const file = form.get("file"), photoId = String(form.get("request_id") || ""), caption = String(form.get("caption") || ""), locale = String(form.get("locale") || "");
    if ([...form.keys()].some(key => !["file", "request_id", "caption", "locale"].includes(key)) || !(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024 || !clientUuid.test(photoId) || caption.length > 300 || !clientLocales.includes(locale as typeof clientLocales[number])) throw Error("CLIENT_INVALID");
    const source = Buffer.from(await file.arrayBuffer());
    let bytes: Buffer;
    try {
      const decoded = sharp(source, { failOn: "error", limitInputPixels: 40_000_000 });
      const metadata = await decoded.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format || "") || !metadata.width || !metadata.height || (metadata.pages || 1) > 1) throw Error("CLIENT_INVALID_IMAGE");
      // Original composition retained, EXIF/location stripped; no public URL.
      bytes = await decoded.autoOrient().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    } catch { throw Error("CLIENT_INVALID_IMAGE"); }
    const path = `${context.salon.id}/${id}/${photoId}.webp`, storage = context.admin.storage.from("business-client-work");
    const uploaded = await storage.upload(path, bytes, { contentType: "image/webp", upsert: false });
    if (uploaded.error) {
      // A retry may follow a lost response. Never overwrite existing pixels.
      const existing = await storage.download(path);
      if (existing.error || !existing.data) throw Error("CLIENT_PHOTO_UPLOAD_FAILED");
      const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
      if (hash(Buffer.from(await existing.data.arrayBuffer())) !== hash(bytes)) throw Error("CLIENT_REQUEST_CONFLICT");
    }
    const saved = await context.admin.rpc("record_business_client_photo", { p_salon: context.salon.id, p_actor: context.user.id, p_booking: id, p_photo: photoId, p_caption: caption, p_locale: locale, p_remove: false });
    if (saved.error) throw saved.error;
    if (saved.data?.id !== photoId || saved.data?.verified !== true) throw Error("CLIENT_NOT_VERIFIED");
    return Response.json({ verified: true, card: await readBusinessClientCard(context, id) }, { headers: clientHeaders });
  } catch (error) { return clientFailure(request, error, context); }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/bookings/[id]/client-record/photos", "POST"), post);
