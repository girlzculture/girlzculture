import QRCode from "qrcode";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function GETHandler(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const admin = getSupabaseAdmin();
  let salonId: string | null = null;
  try {
    const { slug } = await params;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return Response.json({ error: "Salon not found." }, { status: 404 });
    }
    const result = await admin
      .from("salons")
      .select("id,vanity_slug")
      .eq("vanity_slug", slug)
      .eq("status", "Active")
      .eq("is_discoverable", true)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      return Response.json({ error: "Salon not found." }, { status: 404 });
    }
    salonId = result.data.id;
    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const origin = configuredOrigin
      ? configuredOrigin.replace(/\/+$/, "")
      : new URL(request.url).origin;
    const svg = await QRCode.toString(`${origin}/${slug}`, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 2,
      color: { dark: "#5B1A6B", light: "#FBF4EE" },
    });
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "salon-vanity-url",
      action: "generate-qr",
      actorRole: "public",
      salonId,
      recordType: "salon",
      recordId: salonId,
      safeMessage: "We couldn't generate this salon link.",
    });
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/salons/[slug]/qr", "GET"),
  GETHandler,
);
