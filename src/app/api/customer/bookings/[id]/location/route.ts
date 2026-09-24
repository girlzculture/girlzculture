import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {verifyGuestBookingToken} from "@/lib/guestBookingAccess";
import {communicationUuid} from "@/lib/businessCommunicationCore";
import {enforceRateLimit,RateLimitError} from "@/lib/requestSecurity";
import {capturePlatformError} from "@/lib/platformErrors";
import {routeMonitoringProfile,withOperationalMonitoring} from "@/lib/operationalMonitoring";
const headers={"Cache-Control":"private, no-store"};
async function handle(request:Request,context:{params:Promise<{id:string}>}){
 let admin:ReturnType<typeof getSupabaseAdmin>|undefined;
 try{
  enforceRateLimit(request,"customer-booking-location",30,60_000);
  const {id}=await context.params;if(!communicationUuid.test(id))throw Error("BOOKING_LOCATION_INVALID");
  admin=getSupabaseAdmin();const guestToken=request.headers.get("x-guest-booking-token");
  const guest=guestToken?await verifyGuestBookingToken(admin,guestToken):null;
  const bearer=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  let customerId:string|null=null;
  if(guestToken){if(!guest||guest.bookingId!==id)throw Error("BOOKING_LOCATION_UNAUTHORIZED");}
  else{
   if(!bearer)throw Error("BOOKING_LOCATION_UNAUTHORIZED");
   const auth=await admin.auth.getUser(bearer);if(auth.error||!auth.data.user)throw Error("BOOKING_LOCATION_UNAUTHORIZED");
   const user=auth.data.user;const identity=await admin.from("platform_identities").select("primary_role,status,email_normalized").eq("user_id",user.id).maybeSingle();
   if(identity.error)throw identity.error;
   if(identity.data?.primary_role!=="customer"||identity.data.status!=="Active"||identity.data.email_normalized!==user.email?.trim().toLowerCase())throw Error("BOOKING_LOCATION_FORBIDDEN");
   customerId=user.id;
  }
  const result=await admin.rpc("confirmed_business_booking_location",{p_booking:id,p_customer:customerId,p_guest_token:guest?.tokenId||null});
  if(result.error)throw result.error;
  return Response.json({location:result.data},{headers});
 }catch(error){
  const message=error&&typeof error==="object"&&"message" in error?String(error.message):"";
  const status=error instanceof RateLimitError?429:/UNAUTHORIZED/.test(message)?401:/FORBIDDEN/.test(message)?403:/STALE|REQUEST_REUSED/.test(message)?409:/INVALID/.test(message)||error instanceof SyntaxError?400:500;
  const reference=await capturePlatformError({request,admin,error,feature:"business-location",action:request.method,safeMessage:"Your booking location could not be loaded.",severity:status>=500?"high":"low"});
  return Response.json({code:error instanceof RateLimitError?"BOOKING_LOCATION_RATE_LIMIT":/^BOOKING_LOCATION_[A-Z_]+$/.test(message)?message:"BOOKING_LOCATION_UNAVAILABLE",request_id:reference},{status,headers:{...headers,"X-Request-ID":reference,...(error instanceof RateLimitError?{"Retry-After":String(error.retryAfter)}:{})}});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile("/api/customer/bookings/[id]/location","GET"),handle);
