import { createHash } from "node:crypto";
import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { PolicyInputError, validateBusinessPolicy } from "@/lib/businessPolicyCore";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { isSubscriptionActive } from "@/lib/plans";
import { salonPublicPath } from "@/lib/salonVanity";
import { withOperationalMonitoring, routeMonitoringProfile } from "@/lib/operationalMonitoring";

const headers = { "Cache-Control": "private, no-store" };
const locales = new Set(["en", "fr", "wo", "es", "zh-CN"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const policyDigest = (policy: unknown) => {
  const validated = validateBusinessPolicy(policy);
  // JSONB preserves values, not JavaScript key insertion order. Approval must
  // compare content across that round trip while still rejecting edited drafts.
  const canonical = Object.fromEntries(Object.entries(validated).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
};
async function handle(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonPermission>> | undefined;
  async function stalePreview() {
    const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, error: new Error("POLICY_PREVIEW_STALE"), feature: "business-policies", action: "review-conflict", actorRole: "salon", severity: "low", safeMessage: "The policy changed after review. Review a new draft before publishing." });
    // Preserve this actionable conflict and its exact Engine reference. The
    // generic monitoring wrapper otherwise turns code-only HTTP 409 into 500.
    return Response.json({ code: "POLICY_PREVIEW_STALE", request_id: reference }, { status: 409, headers: { ...headers, "X-Request-ID": reference } });
  }
  try {
    context = await requireSalonPermission(request, "my_page");
    const { admin, salon, user } = context;
    if (request.method === "GET") {
      const selectedDraft = new URL(request.url).searchParams.get("draft");
      if (selectedDraft !== null && !uuid.test(selectedDraft)) throw new PolicyInputError("POLICY_INVALID");
      const fields = "id,policy,source_locale,version,created_at,published_at";
      const result = await admin.from("business_policy_revisions").select(fields).eq("salon_id", salon.id).order("created_at", { ascending: false }).limit(30);
      if (result.error) throw result.error;
      const revisions = result.data || [];
      // Drafts can push the live revision out of the history page. Always
      // retrieve it by the authenticated business before enabling the editor.
      const current = salon.business_policy_revision_id || null;
      if (current) {
        let published = revisions.find(row => row.id === current);
        if (!published) {
          const existing = await admin.from("business_policy_revisions").select(fields).eq("salon_id", salon.id).eq("id", current).maybeSingle();
          if (existing.error) throw existing.error;
          published = existing.data || undefined;
          if (published) revisions.push(published);
        }
        if (!published?.published_at) throw new Error("POLICY_CURRENT_UNAVAILABLE");
      }
      // Resume one explicitly selected private draft, even after more recent
      // revisions have pushed it off the history page. Never select a newest
      // draft implicitly or accept an ID from another business.
      if (selectedDraft) {
        let draft = revisions.find(row => row.id === selectedDraft);
        if (!draft) {
          const selected = await admin.from("business_policy_revisions").select(fields).eq("salon_id", salon.id).eq("id", selectedDraft).maybeSingle();
          if (selected.error) throw selected.error;
          draft = selected.data || undefined;
          if (draft) revisions.push(draft);
        }
        if (!draft || draft.published_at) return Response.json({ code: "POLICY_DRAFT_NOT_FOUND" }, { status: 404, headers });
      }
      return Response.json({ revisions, current, public_policy_path: salon.slug ? `${salonPublicPath(String(salon.slug), salon.vanity_slug ? String(salon.vanity_slug) : null)}#business-policies` : null }, { headers });
    }
    enforceRateLimit(request, `business-policies:${user.id}`, 20, 60_000);
    const subscription = await admin.from("subscriptions").select("status,current_period_end").eq("salon_id", salon.id).maybeSingle();
    if (subscription.error) throw subscription.error;
    if (!isSubscriptionActive(subscription.data?.status || salon.subscription_status, subscription.data?.current_period_end)) return Response.json({ code: "PLAN_ACCESS_REQUIRED" }, { status: 403, headers });
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new PolicyInputError("POLICY_INVALID");
    if (body.action === "draft") {
      if (!locales.has(body.locale) || Object.keys(body).some(key => !["action", "locale", "policy"].includes(key))) throw new PolicyInputError("POLICY_INVALID");
      const policy = validateBusinessPolicy(body.policy);
      const result = await admin.from("business_policy_revisions").insert({ salon_id: salon.id, policy, source_locale: body.locale, created_by: user.id }).select("id,policy,source_locale,version,created_at,published_at").single();
      if (result.error) throw result.error;
      return Response.json({ revision: result.data, digest: policyDigest(policy), expected_revision: salon.business_policy_revision_id || null, review_required: true }, { headers });
    }
    if (body.action !== "publish" || body.confirm !== true || body.platform_rules_acknowledged !== true || body.source_reviewed !== true || typeof body.digest !== "string" || Object.keys(body).some(key => !["action", "revision_id", "digest", "expected_revision", "confirm", "platform_rules_acknowledged", "source_reviewed"].includes(key))) throw new PolicyInputError("POLICY_INVALID");
    if (typeof body.revision_id !== "string" || !uuid.test(body.revision_id) || !/^[0-9a-f]{64}$/.test(body.digest) || (body.expected_revision !== null && (typeof body.expected_revision !== "string" || !uuid.test(body.expected_revision)))) throw new PolicyInputError("POLICY_INVALID");
    const draft = await admin.from("business_policy_revisions").select("policy").eq("salon_id", salon.id).eq("id", body.revision_id).maybeSingle();
    if (draft.error) throw draft.error;
    if (draft.error || !draft.data) return Response.json({ code: "POLICY_NOT_FOUND" }, { status: 404, headers });
    if (policyDigest(draft.data.policy) !== body.digest) return stalePreview();
    const result = await admin.rpc("publish_business_policy", { p_salon: salon.id, p_user: user.id, p_revision: body.revision_id, p_expected_revision: body.expected_revision || null });
    if (result.error) throw result.error;
    return Response.json({ revision: result.data, verified: true }, { headers });
  } catch (error) {
    if (error instanceof RateLimitError) return Response.json({ code: "POLICY_RATE_LIMIT" }, { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfter) } });
    if (error instanceof SyntaxError) return Response.json({ code: "POLICY_INVALID" }, { status: 400, headers });
    if (error instanceof PolicyInputError) return Response.json({ code: error.code }, { status: 400, headers });
    const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || "");
    if (message === "PLAN_ACCESS_REQUIRED") return Response.json({ code: message }, { status: 403, headers });
    if (message.includes("POLICY_PREVIEW_STALE")) return stalePreview();
    if (/Unauthorized|Forbidden|POLICY_NOT_FOUND|FORBIDDEN/.test(message)) return Response.json({ code: /Unauthorized/.test(message) ? "AUTH_REQUIRED" : "ACCESS_DENIED" }, { status: /Unauthorized/.test(message) ? 401 : 403, headers });
    const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, error, feature: "business-policies", action: request.method.toLowerCase(), actorRole: "salon", safeMessage: "Business policies are temporarily unavailable." });
    return safeFailure("Business policies are temporarily unavailable.", reference, 500, { code: "POLICY_UNAVAILABLE" });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/policies", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/policies", "POST"), handle);
