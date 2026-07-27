import { revalidatePath } from "next/cache";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanText } from "@/lib/requestSecurity";
import {
  validateHomepageSectionPublication,
} from "@/lib/homepageSectionOrderingCore";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

async function GETHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    monitoringAdmin = admin;
    const { data, error } = await admin
      .from("homepage_sections")
      .select("*")
      .in("section_key", [
        "promo_rail",
        "salons_near_you",
        "featured_salons",
        "trending_picks",
      ])
      .order("sort_order");
    if (error) throw error;
    return Response.json(
      { sections: data || [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "marketing",
      action: "load_homepage_order",
      actorRole: "admin",
      safeMessage: "We couldn't load homepage marketing settings.",
    });
  }
}

async function POSTHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin, user } = await requireAdminPermission(request, "marketing");
    monitoringAdmin = admin;
    const body = (await request.json()) as Record<string, unknown>;
    if (cleanText(body.kind, 30) !== "section_order") {
      rejectRequest("Unknown marketing action.");
    }
    let sections;
    try {
      sections = validateHomepageSectionPublication(body.sections).map(
        (section) => ({
          ...section,
          title: cleanText(section.title, 90),
        }),
      );
    } catch (error) {
      rejectRequest(
        error instanceof Error
          ? error.message
          : "Homepage section order is invalid.",
      );
    }
    if (sections.some((section) => !section.title)) {
      rejectRequest("Every homepage section needs a public heading.");
    }
    const { data, error } = await admin.rpc(
      "admin_publish_homepage_section_order",
      {
        p_actor_user_id: user.id,
        p_sections: sections,
      },
    );
    if (error) throw error;
    revalidatePath("/");
    return Response.json({ sections: Array.isArray(data) ? data : [] });
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "marketing",
      action: "publish_homepage_order",
      actorRole: "admin",
      safeMessage: "We couldn't publish the homepage order.",
    });
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/marketing", "GET"),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/marketing", "POST"),
  POSTHandler,
);
