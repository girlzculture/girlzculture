import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { readBusinessDepositRule,depositRuleFromRow } from "@/lib/businessDepositServer";
import { validateDepositRule,type BusinessDepositRule } from "@/lib/businessDepositRules";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { capturePlatformError } from "@/lib/platformErrors";
import { routeMonitoringProfile,withOperationalMonitoring } from "@/lib/operationalMonitoring";
const headers={"Cache-Control":"private, no-store"};
const fields=["rate","threshold_amount","threshold_rate","repeat_incident_count","repeat_incident_rate","incident_window_days"];
async function handle(request:Request){
  let context:Awaited<ReturnType<typeof requireSalonOwner>>|undefined;
  try{
    context=await requireSalonOwner(request);
    if(!context.isOwner)throw Error("DEPOSIT_OWNER_REQUIRED");
    enforceRateLimit(request,`deposit-rules:${context.user.id}`,30,60_000);
    if(new URL(request.url).searchParams.size)throw Error("DEPOSIT_RULE_INVALID");
    if(request.method==="GET")return Response.json({rule:await readBusinessDepositRule(context.admin,context.salon.id)},{headers});
    const body=await request.json();
    if(!body || typeof body!=="object" || Array.isArray(body) || Object.keys(body).some(key=>!["request_id","expected_version","rule"].includes(key)) || typeof body.request_id!=="string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.request_id) || (body.expected_version!==null && (typeof body.expected_version!=="string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.expected_version))) || !body.rule || typeof body.rule!=="object" || Array.isArray(body.rule) || Object.keys(body.rule).length!==fields.length || Object.keys(body.rule).some(key=>!fields.includes(key)))throw Error("DEPOSIT_RULE_INVALID");
    validateDepositRule({...body.rule,version:body.expected_version} as BusinessDepositRule);
    const result=await context.admin.rpc("save_business_deposit_rule",{p_salon:context.salon.id,p_user:context.user.id,p_request:body.request_id,p_expected:body.expected_version,p_rule:body.rule});
    if(result.error)throw result.error;
    if(!result.data || result.data.salon_id!==context.salon.id)throw Error("DEPOSIT_SCOPE_MISMATCH");
    return Response.json({rule:depositRuleFromRow(result.data),verified:true},{headers});
  }catch(error){
    const message=error && typeof error==="object" && "message" in error ? String(error.message):"";
    const status=/Unauthorized/.test(message)?401:/OWNER_REQUIRED|ACCESS_DENIED|Forbidden/.test(message)?403:/CHANGED|CONFLICT/.test(message)?409:/INVALID/.test(message)||error instanceof SyntaxError?400:500;
    const reference=await capturePlatformError({request,admin:context?.admin,error,feature:"business-deposit-rules",action:request.method==="GET"?"read":"save",actorRole:"salon",actorId:context?.user.id,salonId:context?.salon.id,safeMessage:"Booking deposit settings could not be accessed.",severity:status>=500?"high":"low"});
    return Response.json({code:/^DEPOSIT_[A-Z_]+$/.test(message)?message:"DEPOSIT_UNAVAILABLE",request_id:reference},{status,headers:{...headers,"X-Request-ID":reference}});
  }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile("/api/salon/deposit-rules","GET"),handle);
export const POST=withOperationalMonitoring(routeMonitoringProfile("/api/salon/deposit-rules","POST"),handle);
