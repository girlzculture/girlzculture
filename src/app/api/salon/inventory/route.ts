import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { capturePlatformError } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";

const fields = new Set(["product_id","supply_id","name","unit","quantity","expected_revision","low_stock_threshold","track_inventory","note","cost_cents"]);
const codes = new Set(["STOCK_INVALID_RECORD","STOCK_SCOPE_INVALID","STOCK_ACCESS_DENIED","STOCK_PLAN_REQUIRED","STOCK_FINANCE_PERMISSION_REQUIRED","STOCK_REQUEST_CONFLICT","STOCK_REVISION_CONFLICT","STOCK_RECORD_NOT_FOUND","STOCK_NOT_TRACKED","STOCK_INSUFFICIENT","STOCK_RANGE_TOO_LARGE"]);
async function handle(request: Request) {
 let context: Awaited<ReturnType<typeof requireSalonPermission>> | undefined;
 try {
  context=await requireSalonPermission(request,"products");
  enforceRateLimit(request,`inventory:${context.user.id}`,90,60_000);
  if(new URL(request.url).searchParams.size) throw Error("STOCK_INVALID_RECORD");
  let result;
  if(request.method==="GET") result=await context.admin.rpc("read_business_stock",{p_salon:context.salon.id,p_user:context.user.id});
  else {
   const body=await request.json();
   if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(key=>!["action","request_id","payload"].includes(key))||!new Set(["create_supply","restock","correction","consumption","settings","archive_supply"]).has(body.action)||typeof body.request_id!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id)||!body.payload||typeof body.payload!=="object"||Array.isArray(body.payload)||JSON.stringify(body.payload).length>4000||Object.keys(body.payload).some(key=>!fields.has(key)))throw Error("STOCK_INVALID_RECORD");
   for(const [key,value] of Object.entries(body.payload))if(["quantity","expected_revision","low_stock_threshold","cost_cents"].includes(key)&&value!==null&&(!Number.isSafeInteger(value)||Number(value)<0))throw Error("STOCK_INVALID_RECORD");
   result=await context.admin.rpc("record_business_stock",{p_salon:context.salon.id,p_user:context.user.id,p_request:body.request_id,p_action:body.action,p_payload:body.payload});
  }
  if(result.error)throw result.error;
  return Response.json(result.data,{headers:{"Cache-Control":"private, no-store"}});
 } catch(error) {
  const message=error&&typeof error==="object"&&"message" in error?String(error.message):"";
  const code=codes.has(message)?message:"STOCK_UNAVAILABLE";
  const status=/Unauthorized/.test(message)?401:/ACCESS_DENIED|PLAN_REQUIRED|PERMISSION_REQUIRED|Forbidden/.test(message)?403:code==="STOCK_RECORD_NOT_FOUND"?404:/CONFLICT|INSUFFICIENT|NOT_TRACKED|RANGE_TOO_LARGE/.test(code)?409:code!=="STOCK_UNAVAILABLE"||error instanceof SyntaxError?400:500;
  const safeError=new Error(code);
  const reference=await capturePlatformError({request,admin:context?.admin,error:safeError,feature:"business-inventory",action:request.method==="GET"?"read":"record",actorRole:"salon",actorId:context?.user.id,salonId:context?.salon.id,safeMessage:"Business stock could not be accessed.",severity:status>=500?"high":"low"});
  return Response.json({code,request_id:reference},{status,headers:{"Cache-Control":"private, no-store","X-Request-ID":reference}});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile("/api/salon/inventory","GET"),handle);
export const POST=withOperationalMonitoring(routeMonitoringProfile("/api/salon/inventory","POST"),handle);
