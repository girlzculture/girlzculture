import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeUsState, normalizeUsZip } from "@/lib/usStates";
import { normalizePlan } from "@/lib/plans";
import { cleanEmail, cleanText, cleanUsPhone, enforceRateLimit, errorResponse, rejectBot } from "@/lib/requestSecurity";

function applicationMediaUrl(value: unknown) {
  const text = cleanText(value, 1000);
  if (!text) return null;
  const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "http://invalid.local").origin;
  const parsed = new URL(text);
  if (parsed.origin !== supabaseOrigin || !parsed.pathname.includes("/storage/v1/object/public/application-media/")) throw new Error("Upload the salon logo through the application form.");
  return parsed.toString();
}

function optionalPublicUrl(value: unknown) {
  const text = cleanText(value, 500);
  if (!text) return null;
  const parsed = new URL(text);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Website and Instagram links must use https://.");
  return parsed.toString();
}

function applicationMediaUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map(applicationMediaUrl).filter((url): url is string => Boolean(url));
}

function applicationDocumentPaths(value: unknown, userId: string) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((item) => cleanText(item, 500)).filter((path) => {
    if (!path || !path.startsWith(`${userId}/documents/`) || path.includes("..")) {
      throw new Error("Upload supporting documents through the application form.");
    }
    return true;
  });
}

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  let createdSalonId: string | null = null;
  try {
    enforceRateLimit(request, "salon-application", 5, 10 * 60_000);
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ error: "Please sign in again before submitting." }, { status: 401 });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
    const user = authData.user;
    const body = await request.json() as Record<string, unknown>;
    rejectBot(body);
    const required = ["business_name", "owner_name", "business_email", "phone", "street_address", "city", "state", "zip_code", "business_type", "years_in_operation", "stylist_count", "business_license_number"];
    const missing = required.find((field) => !String(body[field] || "").trim());
    if (missing) return Response.json({ error: `Missing required field: ${missing.replaceAll("_", " ")}` }, { status: 400 });
    if (!body.consent_authorized || !body.consent_terms || !body.consent_photos) return Response.json({ error: "All confirmations are required." }, { status: 400 });

    const selectedPlan = normalizePlan(body.selected_plan);
    const yearsInOperation = Math.round(Number(body.years_in_operation));
    const stylistCount = Math.round(Number(body.stylist_count));
    if (yearsInOperation < 0 || yearsInOperation > 150) throw new Error("Enter valid years in operation.");
    if (stylistCount < 1 || stylistCount > 500) throw new Error("Enter the number of working stylists.");
    const slugBase = cleanText(body.business_name, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "salon";
    const salonPatch = {
      user_id: user.id, name: cleanText(body.business_name, 120), owner_name: cleanText(body.owner_name, 120),
      email: cleanEmail(body.business_email), phone: cleanUsPhone(body.phone),
      address_street: cleanText(body.street_address, 180), address_line2: cleanText(body.address_line2, 120) || null, address_city: cleanText(body.city, 100), address_state: normalizeUsState(body.state),
      address_zip: normalizeUsZip(body.zip_code),
      business_type: cleanText(body.business_type, 80), application_state: cleanText(body.state, 50), status: "Pending", verification_status: "Pending",
      logo_url: applicationMediaUrl(body.logo_url),
    };
    const salonResult = await admin.from("salons").select("id,slug").eq("user_id", user.id).maybeSingle();
    let salon = salonResult.data;
    if (salonResult.error) throw salonResult.error;
    if (!salon) {
      const created = await admin.from("salons").insert({ ...salonPatch, slug: `${slugBase}-${user.id.slice(0, 6)}`, subscription_tier: selectedPlan, subscription_status: "inactive" }).select("id,slug").single();
      if (created.error) throw created.error;
      salon = created.data;
      createdSalonId = salon.id;
    } else {
      const updated = await admin.from("salons").update({ ...salonPatch, subscription_tier: selectedPlan, subscription_status: "inactive" }).eq("id", salon.id).select("id,slug").single();
      if (updated.error) throw updated.error;
      salon = updated.data;
    }

    const application = {
      salon_id: salon.id, user_id: user.id, business_name: salonPatch.name, owner_name: salonPatch.owner_name,
      business_email: salonPatch.email, phone: salonPatch.phone, street_address: salonPatch.address_street, address_line2: salonPatch.address_line2,
      city: salonPatch.address_city, state: salonPatch.address_state, zip_code: salonPatch.address_zip,
      neighborhood: null, business_type: salonPatch.business_type, referral_source: cleanText(body.referral_source, 120), selected_plan: selectedPlan,
      years_in_operation: yearsInOperation, stylist_count: stylistCount,
      website_url: optionalPublicUrl(body.website_url), instagram_url: optionalPublicUrl(body.instagram_url),
      business_license_number: cleanText(body.business_license_number, 120), cosmetology_license_number: cleanText(body.cosmetology_license_number, 120) || null,
      logo_url: salonPatch.logo_url, photo_urls: applicationMediaUrls(body.photo_urls), document_urls: applicationDocumentPaths(body.document_urls, user.id),
      consent_authorized: true, consent_terms: true, consent_photos: true, status: "Pending", rejection_reason: null,
    };
    const { data: saved, error: applicationError } = await admin.from("salon_applications").upsert(application, { onConflict: "salon_id" }).select("id,state,status").single();
    if (applicationError) throw applicationError;
    console.info("Salon application saved", { applicationId: saved.id, salonId: salon.id, state: saved.state, userId: user.id });
    return Response.json({ ok: true, application: saved, salon });
  } catch (error) {
    if (createdSalonId) await admin.from("salons").delete().eq("id", createdSalonId);
    console.error("Salon application submission failed", error);
    return errorResponse(error, "Unable to submit application");
  }
}
