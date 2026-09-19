import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { moderatePublicContent } from "@/lib/contentModerationServer";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { onboardingConfirmation, onboardingFacts, onboardingSource, onboardingUncertainty, onboardingOwnedPhotos, ONBOARDING_SECTIONS, OnboardingInputError } from "@/lib/businessOnboardingDraft";
import { salonPublicPath } from "@/lib/salonVanity";
import { structureOwnerSource } from "@/lib/businessOnboardingSource";
import { structureOnboardingWithAi } from "@/lib/businessOnboardingAiServer";
import { OnboardingAiError } from "@/lib/businessOnboardingAiProtocol";
import { preservedInstagramOnboardingSource } from "@/lib/instagramOnboardingMedia";
import { instagramOnboardingPreviews, readInstagramOnboardingAssets, prepareInstagramOnboardingPhotos } from "@/lib/instagramOnboardingMediaServer";

const headers = { "Cache-Control": "private, no-store" };
const fields = "id,revision,status,source,facts,uncertain,result,created_at";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonOwner>> | undefined;
  try {
    context = await requireSalonOwner(request);
    if (!context.isOwner) return Response.json({ code: "ONBOARDING_OWNER_REQUIRED" }, { status: 403, headers });
    const { admin, salon, user } = context;
    const ownedPhotos = onboardingOwnedPhotos(salon.gallery_photos);
    if (request.method === "GET") {
      const [drafts, groups] = await Promise.all([
        admin.from("business_onboarding_drafts").select(fields).eq("salon_id", salon.id).eq("created_by", user.id).order("created_at", { ascending: false }).limit(10),
        admin.from("service_groups").select("id,name").eq("is_active", true).is("archived_at", null).order("name"),
      ]);
      if (drafts.error || groups.error) throw drafts.error || groups.error;
      const privatePhotos = await instagramOnboardingPreviews(context, drafts.data || []);
      return Response.json({ drafts: drafts.data || [], groups: groups.data || [], owned_photos: ownedPhotos, private_photos: privatePhotos,
        current_name: salon.name, live_business: salon.is_discoverable === true || salon.status === "Active", current_is_discoverable: salon.is_discoverable === true,
        workspace_path: "/salon/dashboard", page_path: salon.slug ? salonPublicPath(String(salon.slug), salon.vanity_slug ? String(salon.vanity_slug) : null) : null,
        automatic_source_import: false, source_import_status: "APPROVED_PROVIDER_CONNECTION_REQUIRED" }, { headers });
    }
    enforceRateLimit(request, `onboarding-draft:${user.id}`, 15, 60_000);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new OnboardingInputError("ONBOARDING_INVALID");
    if (body.action === "draft" || body.action === "structure") {
      const withAi = body.action === "structure";
      const allowed = withAi ? ["action", "source", "locale"] : ["action", "id", "revision", "source", "facts", "locale"];
      if (Object.keys(body).some(key => !allowed.includes(key)) || !["en", "fr", "es", "zh-CN"].includes(body.locale)) throw new OnboardingInputError("ONBOARDING_INVALID");
      if (body.id !== null && body.id !== undefined && (typeof body.id !== "string" || !uuid.test(body.id) || !Number.isSafeInteger(body.revision) || body.revision < 1)) throw new OnboardingInputError("ONBOARDING_INVALID");
      const source = onboardingSource(body.source);
      let prior: Record<string, unknown> | null = null;
      if (!withAi && body.id) {
        const previous = await admin.from("business_onboarding_drafts").select("source,revision,status").eq("id", body.id).eq("salon_id", salon.id).eq("created_by", user.id).maybeSingle();
        if (previous.error) throw previous.error;
        if (!previous.data || previous.data.status !== "draft" || previous.data.revision !== body.revision) throw new Error("ONBOARDING_STALE");
        prior = previous.data.source;
      }
      const imported = preservedInstagramOnboardingSource(prior, source);
      const generated = withAi ? await structureOnboardingWithAi(context, source.text || "") : null;
      const inputFacts = generated?.facts ?? body.facts;
      const privateAssets = imported ? await readInstagramOnboardingAssets(context, { ...source, provider_import: imported }, Array.isArray(inputFacts?.photos) ? inputFacts.photos : []) : [];
      const facts = onboardingFacts(inputFacts, [...ownedPhotos, ...privateAssets.map(asset => `instagram-asset:${asset.id}`)]);
      const structured = !generated && source.text ? structureOwnerSource(source.text) : null;
      let extraction: Record<string, unknown> | null = generated ? { method: "openai_source_quotes", model: generated.model, source_sha256: generated.source_sha256, evidence: generated.evidence, unresolved: generated.unresolved, original_facts: generated.facts } : structured ? { method: "explicit_source_labels", evidence: structured.evidence, unresolved: structured.unresolved } : null;
      if (prior) {
        // Keep server-generated provenance through owner review edits. Never
        // accept a client-supplied model result/evidence as a trusted extraction.
        const priorExtraction = prior.extraction as Record<string, unknown> | undefined;
        if (priorExtraction?.method === "openai_source_quotes" && prior.text === source.text && prior.kind === source.kind && prior.reference === source.reference) extraction = { ...priorExtraction, owner_review_edited: true };
      }
      const result = await admin.rpc("save_business_onboarding_draft", { p_salon: salon.id, p_actor: user.id,
        p_source: { ...source, locale: body.locale, ...(extraction ? { extraction } : {}), ...(imported ? { provider_import: imported } : {}) }, p_facts: facts, p_uncertain: onboardingUncertainty(facts), p_id: body.id || null, p_revision: body.id ? body.revision : null });
      if (result.error) throw result.error;
      const readback = await admin.from("business_onboarding_drafts").select(fields).eq("id", result.data.id).eq("salon_id", salon.id).eq("created_by", user.id).single();
      if (readback.error || !readback.data || readback.data.revision !== result.data.revision) throw readback.error || new Error("ONBOARDING_READBACK_FAILED");
      return Response.json({ draft: readback.data, verified: true, published: false, ...(withAi ? { provider: "openai" } : {}) }, { headers });
    }
    const confirmation = onboardingConfirmation(body);
    const stored = await admin.from("business_onboarding_drafts").select(fields).eq("id", confirmation.id).eq("salon_id", salon.id).eq("created_by", user.id).maybeSingle();
    if (stored.error) throw stored.error;
    if (!stored.data) return Response.json({ code: "ONBOARDING_NOT_FOUND" }, { status: 404, headers });
    // Apply only the saved, reviewed facts; a confirmation cannot smuggle edits.
    if (stored.data.status !== "applied") {
      if (stored.data.status !== "draft" || stored.data.revision !== confirmation.revision) throw new Error("ONBOARDING_STALE");
      const assets = await readInstagramOnboardingAssets(context, stored.data.source, stored.data.facts.photos);
      const facts = onboardingFacts(stored.data.facts, [...ownedPhotos, ...assets.map(asset => `instagram-asset:${asset.id}`)]);
      const copy = [facts.identity.name, facts.identity.description, ...facts.services.map(row => row.name), ...facts.team.flatMap(row => [row.name, row.bio]), facts.policies?.business_policy_text || ""].join("\n");
      const moderation = await moderatePublicContent(admin, { name: facts.identity.name, body: copy });
      if (!moderation.allowed) throw new OnboardingInputError("ONBOARDING_CONTENT_REVIEW_REQUIRED");
      await prepareInstagramOnboardingPhotos(context, stored.data);
    }
    const result = await admin.rpc("apply_business_onboarding_draft", { p_salon: salon.id, p_actor: user.id, p_id: confirmation.id, p_revision: confirmation.revision, p_reviewed: [...ONBOARDING_SECTIONS], p_keep_unpublished: confirmation.keepUnpublished, p_public_impact: confirmation.publicImpact });
    if (result.error) throw result.error;
    const readback = await admin.from("business_onboarding_drafts").select(fields).eq("id", confirmation.id).eq("salon_id", salon.id).eq("created_by", user.id).single();
    if (readback.error || readback.data?.status !== "applied" || readback.data?.revision !== confirmation.revision || typeof readback.data.result?.published !== "boolean" || confirmation.keepUnpublished && readback.data.result.published !== false) throw readback.error || new Error("ONBOARDING_READBACK_FAILED");
    const current = await admin.from("salons").select("is_discoverable,status").eq("id", salon.id).eq("user_id", user.id).single();
    if (current.error || !current.data) throw current.error || new Error("ONBOARDING_READBACK_FAILED");
    return Response.json({ draft: readback.data, verified: true, published: readback.data.result.published, current_is_discoverable: current.data.is_discoverable === true, live_business: current.data.is_discoverable === true || current.data.status === "Active" }, { headers });
  } catch (error) {
    if (error instanceof OnboardingAiError) {
      const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, error,
        feature: "business-onboarding-draft", action: "structure", actorRole: "salon", safeMessage: "The AI draft could not be prepared. Manual setup remains available." });
      return safeFailure("The AI draft could not be prepared. Manual setup remains available.", reference, error.status, { code: error.code });
    }
    if (error instanceof SyntaxError || error instanceof OnboardingInputError) return Response.json({ code: error instanceof OnboardingInputError ? error.code : "ONBOARDING_INVALID" }, { status: 400, headers });
    if (error instanceof RateLimitError) return Response.json({ code: "ONBOARDING_RATE_LIMIT" }, { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfter) } });
    const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message || "");
    if (/Unauthorized|Forbidden|ONBOARDING_FORBIDDEN/.test(message)) return Response.json({ code: "ONBOARDING_ACCESS_DENIED" }, { status: /Unauthorized/.test(message) ? 401 : 403, headers });
    const conflict = message.match(/ONBOARDING_(?:STALE|WORKSPACE_CHANGED|LIVE_BUSINESS_REVIEW_REQUIRED|EXISTING_SERVICE|EXISTING_TEAM|CATALOG_CHANGED|PHOTO_NOT_OWNED|NAME_REQUIRED|REVIEW_REQUIRED|NOT_FOUND|PUBLICATION_GUARD)/)?.[0];
    const safeMessage = conflict ? "Review the onboarding draft before saving these changes." : "We couldn't save the onboarding draft.";
    const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, error,
      feature: "business-onboarding-draft", action: request.method.toLowerCase(), actorRole: "salon", safeMessage });
    if (conflict) return Response.json({ code: conflict, request_id: reference }, { status: 409, headers: { ...headers, "X-Request-ID": reference } });
    return safeFailure(safeMessage, reference, 500, { code: "ONBOARDING_UNAVAILABLE" });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/onboarding-draft", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/onboarding-draft", "POST"), handle);
