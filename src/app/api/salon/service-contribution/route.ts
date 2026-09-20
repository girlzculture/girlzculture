import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { readServiceContribution, saveServiceContribution } from "@/lib/businessServiceContributionServer";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "private, no-store" };
async function handler(request: Request) {
 let context: Awaited<ReturnType<typeof requireSalonOwner>> | undefined;
 try {
  context = await requireSalonOwner(request);
  enforceRateLimit(request, `service-contribution:${context.user.id}`, 30, 60000);
  if (request.method === "GET") {
   const params = new URL(request.url).searchParams;
   if (params.size !== 2 || !params.has("from") || !params.has("to")) throw Error("CONTRIBUTION_INVALID_PERIOD");
   return Response.json(await readServiceContribution(context, params.get("from")!, params.get("to")!), { headers });
  }
  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join(",") !== "payload,request_id" || !id.test(body.request_id) || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload) || JSON.stringify(body.payload).length > 12000) throw Error("CONTRIBUTION_REVIEW_INVALID");
  const p = body.payload;
  if (Object.keys(p).sort().join(",") !== "allocations,complete,fingerprint,from,note,revision,service_id,to,zero_confirmed" || p.complete !== true || typeof p.zero_confirmed !== "boolean" || !id.test(p.service_id) || !/^[0-9a-f]{32}$/.test(p.fingerprint) || !Number.isSafeInteger(p.revision) || p.revision < 0 || typeof p.note !== "string" || !p.note.trim() || p.note.length > 1000 || !/^\d{4}-\d{2}-\d{2}$/.test(p.from) || !/^\d{4}-\d{2}-\d{2}$/.test(p.to) || !Array.isArray(p.allocations) || p.allocations.length > 40) throw Error("CONTRIBUTION_REVIEW_INVALID");
  for (const item of p.allocations) if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join(",") !== "cents,id,kind" || !["expense", "wage"].includes(item.kind) || !id.test(item.id) || !Number.isSafeInteger(item.cents) || item.cents <= 0 || item.cents > 100000000) throw Error("CONTRIBUTION_ALLOCATION_INVALID");
  return Response.json(await saveServiceContribution(context, body.request_id, p), { headers });
 } catch (error) {
  const code = String((error as { message?: string })?.message || "");
  const status = /Unauthorized/.test(code) ? 401 : /ACCESS_DENIED|OWNER_REQUIRED|PLAN_REQUIRED|Forbidden/.test(code) ? 403 : /SOURCE_CHANGED|REVIEW_CONFLICT|REQUEST_CONFLICT|EXCEEDS_SOURCE|SERVICE_UNAVAILABLE|READBACK_FAILED/.test(code) ? 409 : error instanceof RateLimitError ? 429 : error instanceof SyntaxError || /INVALID_PERIOD|REVIEW_INVALID|ALLOCATION_INVALID/.test(code) ? 400 : 503;
  const reference = await capturePlatformError({ request, admin: context?.admin, error, feature: "service-contribution", action: request.method === "GET" ? "read" : "review", actorRole: "salon", actorId: context?.user.id, salonId: context?.salon.id, safeMessage: "Service cost evidence could not be verified. Refresh saved records before continuing." });
  return safeFailure("Service cost evidence could not be verified. Refresh saved records before continuing.", reference, status, { code: /^CONTRIBUTION_[A-Z_]+$/.test(code) ? code : "CONTRIBUTION_UNAVAILABLE" });
 }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/service-contribution", "GET"), handler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/service-contribution", "POST"), handler);
