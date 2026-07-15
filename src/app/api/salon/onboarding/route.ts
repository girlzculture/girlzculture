import { errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";

type Row = Record<string, unknown>;
type CheckKey = "logo" | "photos" | "style" | "stylist" | "hours";

const checkLabels: Record<CheckKey, string> = {
  logo: "Upload a salon logo",
  photos: "Upload at least one salon or work photo",
  style: "Add at least one service with a price",
  stylist: "Add at least one stylist or confirm that the owner is the sole stylist",
  hours: "Set salon hours",
};

function hasUsableHours(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some((day) => {
    if (Array.isArray(day)) return Boolean(day[0] && day[1]);
    if (!day || typeof day !== "object") return false;
    const row = day as Row;
    return row.closed !== true && Boolean(row.open && row.close);
  });
}

function hasPhoto(salon: Row) {
  if (String(salon.cover_photo_url || "").trim()) return true;
  return Array.isArray(salon.gallery_photos) && salon.gallery_photos.some((photo) => Boolean(String(photo || "").trim()));
}

function hasPricedService(style: Row) {
  const value = style.base_price ?? style.price_display_min;
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}

async function evaluate(request: Request, action: "load" | "refresh" | "finish" | "set_sole_stylist" = "load", soleStylistValue?: boolean) {
  const { admin, salon: initialSalon, isOwner } = await requireSalonOwner(request);
  if (!isOwner) throw new Error("Only the salon owner can complete marketplace onboarding.");

  let salon = initialSalon as Row;
  if (action === "set_sole_stylist") {
    const { data, error } = await admin.from("salons").update({ owner_is_sole_stylist: soleStylistValue === true }).eq("id", salon.id).select("*").single();
    if (error) throw error;
    salon = data as Row;
  }

  const [{ data: styles, error: stylesError }, { data: stylists, error: stylistsError }] = await Promise.all([
    admin.from("styles").select("id,base_price,price_display_min").eq("salon_id", salon.id),
    admin.from("stylists").select("id,is_active").eq("salon_id", salon.id),
  ]);
  if (stylesError) throw stylesError;
  if (stylistsError) throw stylistsError;

  const activeStylists = (stylists || []).filter((stylist) => stylist.is_active !== false);
  const checks: Record<CheckKey, boolean> = {
    logo: Boolean(String(salon.logo_url || "").trim()),
    photos: hasPhoto(salon),
    style: (styles || []).some(hasPricedService),
    stylist: activeStylists.length > 0 || salon.owner_is_sole_stylist === true,
    hours: hasUsableHours(salon.hours),
  };
  const missing = (Object.keys(checks) as CheckKey[]).filter((key) => !checks[key]).map((key) => ({ key, label: checkLabels[key] }));
  const completeCount = Object.values(checks).filter(Boolean).length;
  const progress = Math.round((completeCount / Object.keys(checks).length) * 100);
  const checklistComplete = missing.length === 0;
  const activeStatus = String(salon.status || "").toLowerCase() === "active";
  const activeSubscription = ["active", "trialing"].includes(String(salon.subscription_status || "").toLowerCase());
  const canPublish = checklistComplete && activeStatus && activeSubscription;
  const publishNow = action === "finish" && canPublish;
  const discoverable = checklistComplete && activeStatus && activeSubscription && (publishNow || salon.is_discoverable === true);
  const completedAt = discoverable ? salon.onboarding_completed_at || new Date().toISOString() : checklistComplete ? salon.onboarding_completed_at || null : null;

  const { error: updateError } = await admin.from("salons").update({
    onboarding_progress: progress,
    onboarding_completed_at: completedAt,
    is_discoverable: discoverable,
  }).eq("id", salon.id);
  if (updateError) throw updateError;

  const blockers = [
    ...missing.map((item) => item.label),
    ...(!activeStatus ? ["Wait for Girlz Culture to activate the salon"] : []),
    ...(!activeSubscription ? ["Activate the salon subscription"] : []),
  ];
  return Response.json({
    salon: { id: salon.id, name: salon.name, slug: salon.slug, status: salon.status, subscription_status: salon.subscription_status },
    checks,
    missing,
    progress,
    checklist_complete: checklistComplete,
    discoverable,
    finished: publishNow,
    owner_is_sole_stylist: salon.owner_is_sole_stylist === true,
    finish_blockers: blockers,
    eligibility: { active_status: activeStatus, active_subscription: activeSubscription },
  });
}

export async function GET(request: Request) {
  try { return await evaluate(request); }
  catch (error) { console.error("Salon onboarding evaluation failed", error); return errorResponse(error, "Unable to evaluate onboarding"); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const requestedAction = String(body.action || "refresh");
    const action = (["refresh", "finish", "set_sole_stylist"].includes(requestedAction) ? requestedAction : "refresh") as "refresh" | "finish" | "set_sole_stylist";
    return await evaluate(request, action, body.owner_is_sole_stylist === true);
  }
  catch (error) { console.error("Salon onboarding refresh failed", error); return errorResponse(error, "Unable to refresh onboarding"); }
}
