import { errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";

type Row = Record<string, unknown>;

function hasUsableHours(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some((day) => {
    if (Array.isArray(day)) return Boolean(day[0] && day[1]);
    if (!day || typeof day !== "object") return false;
    const row = day as Row;
    return row.closed !== true && Boolean(row.open && row.close);
  });
}

function hasStylistAvailability(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some((day) => {
    if (!day || typeof day !== "object" || Array.isArray(day)) return false;
    const row = day as Row;
    return row.closed !== true && Boolean(row.open && row.close);
  });
}

async function evaluate(request: Request) {
  const { admin, salon, isOwner } = await requireSalonOwner(request);
  if (!isOwner) throw new Error("Only the salon owner can complete marketplace onboarding.");

  const [{ data: styles, error: stylesError }, { data: stylists, error: stylistsError }, availabilityResult] = await Promise.all([
    admin.from("styles").select("id,base_price,price_display_min").eq("salon_id", salon.id),
    admin.from("stylists").select("id,is_active,availability").eq("salon_id", salon.id),
    admin.from("availability").select("id", { count: "exact", head: true }).eq("salon_id", salon.id),
  ]);
  if (stylesError) throw stylesError;
  if (stylistsError) throw stylistsError;
  if (availabilityResult.error) throw availabilityResult.error;

  const gallery = Array.isArray(salon.gallery_photos) ? salon.gallery_photos.filter(Boolean) : [];
  const activeStylists = (stylists || []).filter((stylist) => stylist.is_active !== false);
  const checks = {
    logo: Boolean(String(salon.logo_url || "").trim()),
    photos: gallery.length >= 3,
    style: (styles || []).some((style) => Number(style.base_price || style.price_display_min || 0) > 0),
    stylist: activeStylists.length > 0,
    hours: hasUsableHours(salon.hours),
    availability: Number(availabilityResult.count || 0) > 0 || activeStylists.some((stylist) => hasStylistAvailability(stylist.availability)),
    alerts: Boolean(salon.pwa_installed_at && salon.push_enabled_at && salon.push_reachable),
  };
  const completeCount = Object.values(checks).filter(Boolean).length;
  const progress = Math.round((completeCount / Object.keys(checks).length) * 100);
  const checklistComplete = completeCount === Object.keys(checks).length;
  const activeStatus = String(salon.status || "").toLowerCase() === "active";
  const activeSubscription = ["active", "trialing"].includes(String(salon.subscription_status || "").toLowerCase());
  const discoverable = activeStatus && activeSubscription && checklistComplete;
  const completedAt = checklistComplete ? salon.onboarding_completed_at || new Date().toISOString() : null;

  const { error: updateError } = await admin.from("salons").update({
    onboarding_progress: progress,
    onboarding_completed_at: completedAt,
    is_discoverable: discoverable,
  }).eq("id", salon.id);
  if (updateError) throw updateError;

  return Response.json({
    salon: { id: salon.id, name: salon.name, slug: salon.slug, status: salon.status, subscription_status: salon.subscription_status },
    checks, progress, checklist_complete: checklistComplete, discoverable,
    eligibility: { active_status: activeStatus, active_subscription: activeSubscription },
  });
}

export async function GET(request: Request) {
  try { return await evaluate(request); }
  catch (error) { console.error("Salon onboarding evaluation failed", error); return errorResponse(error, "Unable to evaluate onboarding"); }
}

export async function POST(request: Request) {
  try { return await evaluate(request); }
  catch (error) { console.error("Salon onboarding refresh failed", error); return errorResponse(error, "Unable to refresh onboarding"); }
}
