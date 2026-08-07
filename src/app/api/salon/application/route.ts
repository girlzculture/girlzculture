import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { getSupabaseAdmin, sendEmail } from "@/lib/supabaseAdmin";
import { normalizeUsState, normalizeUsZip } from "@/lib/usStates";
import { normalizePlan } from "@/lib/plans";
import {
  cleanEmail,
  cleanText,
  cleanUsPhone,
  enforceRateLimit,
  errorResponse,
  rejectBot,
} from "@/lib/requestSecurity";
import { geocodeSalonAddress } from "@/lib/geocodingServer";
import { getEngineList } from "@/lib/engineConfigServer";

function applicationMediaUrl(value: unknown) {
  const text = cleanText(value, 1000);
  if (!text) return null;
  const supabaseOrigin = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://invalid.local",
  ).origin;
  const parsed = new URL(text);
  if (
    parsed.origin !== supabaseOrigin ||
    !parsed.pathname.includes("/storage/v1/object/public/application-media/")
  )
    throw new Error("Upload the salon logo through the application form.");
  return parsed.toString();
}

function optionalPublicUrl(value: unknown) {
  const text = cleanText(value, 500);
  if (!text) return null;
  const parsed = new URL(text);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("Website and Instagram links must use https://.");
  return parsed.toString();
}

function applicationMediaUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map(applicationMediaUrl)
    .filter((url): url is string => Boolean(url));
}

function applicationDocumentPaths(value: unknown, userId: string) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 5)
    .map((item) => cleanText(item, 500))
    .filter((path) => {
      if (
        !path ||
        !path.startsWith(`${userId}/documents/`) ||
        path.includes("..")
      ) {
        throw new Error("Upload supporting documents through the application form.");
      }
      return true;
    });
}

type AtomicSubmissionResult = {
  salon?: Record<string, unknown>;
  application?: Record<string, unknown>;
  created_salon?: boolean;
};

async function POSTHandler(request: Request) {
  const admin = getSupabaseAdmin();
  try {
    enforceRateLimit(request, "salon-application", 5, 10 * 60_000);
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (!token)
      return Response.json(
        { error: "Please sign in again before submitting." },
        { status: 401 },
      );
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user)
      return Response.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 },
      );
    const user = authData.user;
    const body = (await request.json()) as Record<string, unknown>;
    rejectBot(body);
    const required = [
      "business_name",
      "owner_name",
      "business_email",
      "phone",
      "street_address",
      "city",
      "state",
      "zip_code",
      "business_type",
      "years_in_operation",
      "stylist_count",
    ];
    const missing = required.find(
      (field) => !String(body[field] || "").trim(),
    );
    if (missing)
      return Response.json(
        { error: `Missing required field: ${missing.replaceAll("_", " ")}` },
        { status: 400 },
      );
    if (
      !body.consent_authorized ||
      !body.consent_terms ||
      !body.consent_photos
    )
      return Response.json(
        { error: "All confirmations are required." },
        { status: 400 },
      );

    const accountEmail = cleanEmail(user.email);
    const businessEmail = cleanEmail(body.business_email);
    if (businessEmail !== accountEmail) {
      return Response.json(
        {
          error:
            "Use the email address associated with your signed-in salon account.",
        },
        { status: 400 },
      );
    }

    const selectedPlan = normalizePlan(body.selected_plan);
    const businessTypes = await getEngineList(
      "catalog.business_types",
      [
        "Braiding Studio",
        "Hair Salon",
        "Beauty Shop",
        "Independent Braider",
        "Mobile Braider",
        "Natural Hair Studio",
        "Other",
      ],
      30,
    );
    const businessType = cleanText(body.business_type, 80);
    if (!businessTypes.includes(businessType))
      throw new Error("Choose an approved business type.");
    const yearsInOperation = Math.round(Number(body.years_in_operation));
    const stylistCount = Math.round(Number(body.stylist_count));
    if (
      !Number.isFinite(yearsInOperation) ||
      yearsInOperation < 0 ||
      yearsInOperation > 150
    )
      throw new Error("Enter valid years in operation.");
    if (
      !Number.isFinite(stylistCount) ||
      stylistCount < 1 ||
      stylistCount > 500
    )
      throw new Error("Enter the number of working stylists.");

    const businessName = cleanText(body.business_name, 120);
    const ownerName = cleanText(body.owner_name, 120);
    const phone = cleanUsPhone(body.phone);
    const street = cleanText(body.street_address, 180);
    const line2 = cleanText(body.address_line2, 120) || null;
    const city = cleanText(body.city, 100);
    const state = normalizeUsState(body.state);
    const zip = normalizeUsZip(body.zip_code);
    const logoUrl = applicationMediaUrl(body.logo_url);
    const slugBase =
      businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "salon";

    const salonValues = {
      name: businessName,
      slug: `${slugBase}-${user.id.slice(0, 6)}`,
      owner_name: ownerName,
      email: accountEmail,
      phone,
      address_street: street,
      address_line2: line2,
      address_city: city,
      address_state: state,
      address_zip: zip,
      business_type: businessType,
      logo_url: logoUrl,
      subscription_tier: selectedPlan,
    };
    const applicationValues = {
      business_name: businessName,
      owner_name: ownerName,
      business_email: accountEmail,
      phone,
      street_address: street,
      address_line2: line2,
      city,
      state,
      zip_code: zip,
      business_type: businessType,
      referral_source: cleanText(body.referral_source, 120) || null,
      selected_plan: selectedPlan,
      years_in_operation: yearsInOperation,
      stylist_count: stylistCount,
      website_url: optionalPublicUrl(body.website_url),
      instagram_url: optionalPublicUrl(body.instagram_url),
      business_license_number:
        cleanText(body.business_license_number, 120) || null,
      cosmetology_license_number:
        cleanText(body.cosmetology_license_number, 120) || null,
      logo_url: logoUrl,
      photo_urls: applicationMediaUrls(body.photo_urls),
      document_urls: applicationDocumentPaths(body.document_urls, user.id),
    };

    const atomic = await admin.rpc("submit_salon_application_atomic", {
      p_user_id: user.id,
      p_salon_values: salonValues,
      p_application_values: applicationValues,
    });
    if (atomic.error) throw atomic.error;
    const result = (atomic.data || {}) as AtomicSubmissionResult;
    const salon = result.salon || {};
    const saved = result.application || {};
    const salonId = cleanText(salon.id, 60);
    const applicationId = cleanText(saved.id, 60);
    if (!salonId || !applicationId)
      throw new Error("The saved application could not be verified.");

    console.info("Salon application saved atomically", {
      applicationId,
      salonId,
      state: saved.state,
      userId: user.id,
      createdSalon: result.created_salon === true,
    });
    try {
      const geocode = await geocodeSalonAddress(salonId);
      console.info("Salon application address processed", {
        applicationId,
        salonId,
        status: geocode.status,
      });
    } catch (geocodeError) {
      noteOperationalFailure("Salon application geocoding deferred", {
        applicationId,
        salonId,
        geocodeError,
      });
    }

    const receipt = await sendEmail(
      accountEmail,
      "We received your Girlz Culture application",
      "<p>We have received your application. Our team will review and get back to you within 2–4 business days.</p>",
      "account",
    ).catch((deliveryError) => {
      noteOperationalFailure("Salon application confirmation email failed", {
        applicationId,
        salonId,
        deliveryError,
      });
      return { skipped: true, failed: true };
    });
    return Response.json({
      ok: true,
      application: saved,
      salon,
      confirmation_email_sent: !("skipped" in receipt && receipt.skipped),
    });
  } catch (error) {
    noteOperationalFailure("Salon application submission failed", error);
    return errorResponse(error, "Unable to submit application");
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/salon/application", "POST"),
  POSTHandler,
);
