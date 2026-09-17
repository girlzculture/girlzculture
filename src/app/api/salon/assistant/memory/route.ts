import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/gcAssistantCore";
import { readAssistantMemory, saveAssistantMemory, deleteAssistantMemory } from "@/lib/assistantMemoryServer";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { capturePlatformError } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";

const headers = {"Cache-Control":"private, no-store"};
async function handle(request: Request) {
  let context;
  try {
    context = await requireSalonOwner(request);
    enforceRateLimit(request,`gc-assistant-memory:${context.user.id}`,20,60_000);
    if (request.method === "GET") return Response.json({memory:await readAssistantMemory(context)},{headers});
    if (request.method === "DELETE") {
      await deleteAssistantMemory(context);
      return Response.json({deleted:true},{headers});
    }
    const raw = await request.text();
    if (raw.length > 1000) throw new AssistantError("ASSISTANT_INVALID_INPUT",413);
    return Response.json({memory:await saveAssistantMemory(context,JSON.parse(raw))},{headers});
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({code:"ASSISTANT_INVALID_INPUT"},{status:400,headers});
    if (error instanceof RateLimitError) return Response.json({code:"ASSISTANT_RATE_LIMIT"},{status:429,headers:{...headers,"Retry-After":String(error.retryAfter)}});
    if (error instanceof Error && /Unauthorized|Forbidden/.test(error.message)) return Response.json({code:/Unauthorized/.test(error.message)?"AUTH_REQUIRED":"ASSISTANT_ACCESS_DENIED"},{status:/Unauthorized/.test(error.message)?401:403,headers});
    if (error instanceof AssistantError) return Response.json({code:error.code},{status:error.status,headers});
    const reference = await capturePlatformError({request,admin:context?.admin,error,feature:"gc-assistant",action:"conversation-memory",actorRole:"salon",actorId:context?.user.id,salonId:context?.salon.id,safeMessage:"Saved conversation context is temporarily unavailable."});
    return Response.json({code:"ASSISTANT_MEMORY_UNAVAILABLE",request_id:reference},{status:503,headers:{...headers,"X-Request-ID":reference}});
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/assistant/memory","GET"),handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/assistant/memory","POST"),handle);
export const DELETE = withOperationalMonitoring(routeMonitoringProfile("/api/salon/assistant/memory","DELETE"),handle);
