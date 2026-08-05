import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { createSalonDescriptionDraft } from "@/lib/salonDescriptionDraftServer";

export const runtime = "nodejs";

async function POSTHandler(request: Request) {
  let admin;
  let salonId: string | null = null;
  try {
    enforceRateLimit(request, "salon-description-draft", 10, 60 * 60_000);
    const context = await requireSalonOwner(request);
    admin = context.admin;
    salonId = context.salon.id;
    if (!context.isOwner && !(context.teamMember?.permissions as Record<string, boolean> | undefined)?.my_page)
      throw new Error("Forbidden: this salon role cannot draft profile copy.");
    const body = await request.json() as Record<string, unknown>;
    const keywords = cleanText(body.keywords, 600);
    if (keywords.length < 3) throw new Error("Enter a few services, qualities, or details about the salon.");
    const draft = await createSalonDescriptionDraft(
      context.admin,
      context.user.id,
      cleanText(context.salon.name, 120) || "This salon",
      keywords,
    );
    return Response.json({ ...draft, label: "AI-assisted draft — review before saving" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^(Unauthorized|Forbidden)|Enter a few/i.test(message))
      return errorResponse(error, "Unable to create a description draft.");
    const safeMessage = "We couldn't create this description draft. You can still write the description manually.";
    const reference = await capturePlatformError({ request, admin, error, feature: "salon-description-draft", action: "draft", actorRole: "salon", salonId, provider: "openai", safeMessage });
    return safeFailure(safeMessage, reference);
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/salon/profile/description-draft", "POST", {
    classification: "provider-backed",
    feature: "salon-description-draft",
    actorRole: "salon",
    provider: "openai",
    safeMessage: "We couldn't create this description draft.",
  }),
  POSTHandler,
);
