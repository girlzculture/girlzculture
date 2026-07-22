import { cleanEmail, cleanText, cleanUsPhone, errorResponse } from "@/lib/requestSecurity";
import { capturePlatformError, monitoredRouteFailure, safeFailure } from "@/lib/platformErrors";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { normalizeUsState, normalizeUsZip } from "@/lib/usStates";

const TEXT_FIELDS = new Set(["name", "description", "address_street", "address_line2", "address_city", "address_state", "address_zip", "phone", "email", "logo_url", "cover_photo_url"]);
const ALLOWED_FIELDS = new Set([...TEXT_FIELDS, "gallery_photos", "languages", "trust_info", "media_consent", "hours", "booking_settings", "notification_preferences"]);

function httpsUrl(value: unknown) {
  const text = cleanText(value, 1200);
  if (!text) return null;
  const url = new URL(text);
  if (url.protocol !== "https:") throw new Error("Media links must use HTTPS.");
  return url.toString();
}

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a valid object.`);
  return value as Record<string, unknown>;
}

function sanitizePatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(body)) if (!ALLOWED_FIELDS.has(key)) throw new Error(`The ${key} field cannot be changed here.`);
  for (const key of TEXT_FIELDS) {
    if (!(key in body)) continue;
    if (key === "email") patch.email = cleanEmail(body.email);
    else if (key === "phone") patch.phone = cleanUsPhone(body.phone);
    else if (key === "address_state") patch.address_state = normalizeUsState(body.address_state);
    else if (key === "address_zip") patch.address_zip = normalizeUsZip(body.address_zip);
    else if (key === "logo_url" || key === "cover_photo_url") patch[key] = httpsUrl(body[key]);
    else patch[key] = cleanText(body[key], key === "description" ? 2_000 : 240) || (key === "address_line2" ? null : "");
  }
  if ("gallery_photos" in body) {
    if (!Array.isArray(body.gallery_photos)) throw new Error("Gallery photos must be a list.");
    patch.gallery_photos = body.gallery_photos.slice(0, 16).map(httpsUrl).filter(Boolean);
  }
  if ("languages" in body) {
    if (!Array.isArray(body.languages)) throw new Error("Languages must be a list.");
    patch.languages = body.languages.slice(0, 5).map((value) => cleanText(value, 50)).filter(Boolean);
  }
  if ("media_consent" in body) patch.media_consent = body.media_consent === true;
  if ("trust_info" in body) patch.trust_info = objectValue(body.trust_info, "Trust information");
  if ("hours" in body) patch.hours = objectValue(body.hours, "Store hours");
  if ("booking_settings" in body) patch.booking_settings = objectValue(body.booking_settings, "Booking settings");
  if ("notification_preferences" in body) patch.notification_preferences = objectValue(body.notification_preferences, "Notification preferences");
  if (!Object.keys(patch).length) throw new Error("Choose at least one salon field to update.");
  return patch;
}

function permissionFor(keys: string[]) {
  if (keys.some((key) => ["notification_preferences"].includes(key))) return "settings";
  if (keys.some((key) => ["hours", "booking_settings"].includes(key))) return "availability";
  if (keys.every((key) => ["cover_photo_url", "gallery_photos", "media_consent"].includes(key))) return "photos";
  return "my_page";
}

export async function GET(request: Request) {
  let admin;
  try {
    const context = await requireSalonOwner(request);
    admin = context.admin;
    return Response.json({ salon: context.salon }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "salon-profile", action: "load", actorRole: "salon", safeMessage: "We couldn't load the salon profile." });
  }
}

export async function PATCH(request: Request) {
  let admin;
  let salonId: string | null = null;
  try {
    const context = await requireSalonOwner(request);
    admin = context.admin;
    salonId = context.salon.id;
    const body = await request.json() as Record<string, unknown>;
    const permission = permissionFor(Object.keys(body));
    if (!context.isOwner && !(context.teamMember?.permissions as Record<string, boolean> | undefined)?.[permission]) {
      throw new Error("Forbidden: this salon role cannot update these profile fields.");
    }
    const patch = sanitizePatch(body);
    const { data, error } = await context.admin.from("salons").update(patch).eq("id", context.salon.id).select("*").single();
    if (error) throw error;
    return Response.json({ salon: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^(Unauthorized|Forbidden)|must be|cannot be changed|valid object|valid email|US phone|HTTPS|at least one/i.test(message)) return errorResponse(error, "Unable to update the salon profile.");
    const safeMessage = "We couldn't save this change.";
    const reference = await capturePlatformError({ request, admin, error, feature: "salon-profile", action: "update", actorRole: "salon", salonId, safeMessage });
    return safeFailure(safeMessage, reference);
  }
}
