import { createHash } from "node:crypto";
import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { PolicyInputError, validateBusinessPolicy } from "@/lib/businessPolicyCore";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { isSubscriptionActive } from "@/lib/plans";
import { withOperationalMonitoring, routeMonitoringProfile } from "@/lib/operationalMonitoring";

const headers = { "Cache-Control": "private, no-store" };
const locales = new Set(["en", "fr", "wo", "es", "zh-CN"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const policyDigest = (policy: unknown) => createHash("sha256").update(JSON.stringify(validateBusinessPolicy(policy))).digest("hex");
async function handle(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonPermission>> | undefined;
  try {
    context = await requireSalonPermission(request, "my_page");
    const { admin, salon, user } = context;
    if (request.method === "GET") {
      const result = await admin.from("business_policy_revisions").select("id,policy,source_locale,version,created_at,published_at").eq("salon_id", salon.id).order("created_at", { ascending: false }).limit(30);
      if (result.error) throw result.error;
      return Response.json({ revisions: result.data, current: salon.business_policy_revision_id || null }, { headers });
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
    if (policyDigest(draft.data.policy) !== body.digest) return Response.json({ code: "POLICY_PREVIEW_STALE" }, { status: 409, headers });
    const result = await admin.rpc("publish_business_policy", { p_salon: salon.id, p_user: user.id, p_revision: body.revision_id, p_expected_revision: body.expected_revision || null });
    if (result.error) throw result.error;
    return Response.json({ revision: result.data, verified: true }, { headers });
  } catch (error) {
    if (error instanceof RateLimitError) return Response.json({ code: "POLICY_RATE_LIMIT" }, { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfter) } });
    if (error instanceof SyntaxError) return Response.json({ code: "POLICY_INVALID" }, { status: 400, headers });
    if (error instanceof PolicyInputError) return Response.json({ code: error.code }, { status: 400, headers });
    const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || "");
    if (message === "PLAN_ACCESS_REQUIRED") return Response.json({ code: message }, { status: 403, headers });
    if (/Unauthorized|Forbidden|POLICY_PREVIEW_STALE|POLICY_NOT_FOUND|FORBIDDEN/.test(message)) return Response.json({ code: /Unauthorized/.test(message) ? "AUTH_REQUIRED" : /STALE/.test(message) ? "POLICY_PREVIEW_STALE" : "ACCESS_DENIED" }, { status: /Unauthorized/.test(message) ? 401 : /STALE/.test(message) ? 409 : 403, headers });
    const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, error, feature: "business-policies", action: request.method.toLowerCase(), actorRole: "salon", safeMessage: "Business policies are temporarily unavailable." });
    return safeFailure("Business policies are temporarily unavailable.", reference, 500, { code: "POLICY_UNAVAILABLE" });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/policies", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/policies", "POST"), handle);
