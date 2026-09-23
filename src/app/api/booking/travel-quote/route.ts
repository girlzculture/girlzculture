import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {geocodeCustomerServiceAddress} from "@/lib/geocodingServer";
import {travelAddress,TravelBookingError} from "@/lib/mobileBooking";
import {travelEmailHash} from "@/lib/mobileBookingServer";
import {cleanEmail,enforceRateLimit,RateLimitError} from "@/lib/requestSecurity";
import {capturePlatformError} from "@/lib/platformErrors";
import {routeMonitoringProfile,withOperationalMonitoring} from "@/lib/operationalMonitoring";
const headers={"Cache-Control":"private, no-store"};
async function handle(request:Request){
 let admin:ReturnType<typeof getSupabaseAdmin>|undefined;
 try{
  enforceRateLimit(request,"booking-travel-quote",6,10*60_000);
  const raw=await request.text();if(raw.length>2000)throw new TravelBookingError("TRAVEL_ADDRESS_INVALID");
  const body=JSON.parse(raw);
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!["salon_id","guest_email","address"].includes(k))||typeof body.salon_id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.salon_id))throw new TravelBookingError("TRAVEL_ADDRESS_INVALID");
  const address=travelAddress(body.address);let email:string;
  try{email=cleanEmail(body.guest_email);}catch{throw new TravelBookingError("TRAVEL_ADDRESS_INVALID");}
  admin=getSupabaseAdmin();
  const bearer=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");let customerId:string|null=null;
  if(bearer){const auth=await admin.auth.getUser(bearer);if(auth.error||!auth.data.user)throw new TravelBookingError("TRAVEL_CUSTOMER_REQUIRED",401);customerId=auth.data.user.id;}
  const business=await admin.from("salons").select("id,is_demo,service_location_type,offers_mobile,status,is_discoverable,accepting_bookings").eq("id",body.salon_id).maybeSingle();
  if(business.error)throw business.error;
  if(!business.data||business.data.is_demo||business.data.status!=="Active"||!business.data.is_discoverable||!business.data.accepting_bookings||!(business.data.service_location_type==="mobile"||business.data.offers_mobile))throw new TravelBookingError("TRAVEL_NOT_AVAILABLE",409);
  const point=await geocodeCustomerServiceAddress(address);
  const result=await admin.rpc("create_business_travel_quote",{p_salon:business.data.id,p_customer:customerId,p_email_hash:travelEmailHash(email),p_address:address,p_lat:point.lat,p_lng:point.lng});
  if(result.error)throw result.error;
  return Response.json({quote:result.data},{headers});
 }catch(error){
  const message=error&&typeof error==="object"&&"message"in error?String(error.message):"";
  const code=error instanceof RateLimitError?"TRAVEL_RATE_LIMIT":/^TRAVEL_(?:ADDRESS_INVALID|NOT_AVAILABLE|CUSTOMER_REQUIRED|OUTSIDE_RADIUS)$/.test(message)?message:"TRAVEL_CHECK_UNAVAILABLE";
  const status=error instanceof RateLimitError?429:error instanceof SyntaxError?400:error instanceof TravelBookingError?error.status:code==="TRAVEL_CHECK_UNAVAILABLE"?503:409;
  const reference=await capturePlatformError({request,admin,error:new Error(code),feature:"booking-location",action:"travel-quote",safeMessage:"The appointment address could not be checked.",severity:status>=500?"high":"low"});
  return Response.json({code,request_id:reference},{status,headers:{...headers,"X-Request-ID":reference}});
 }
}
export const POST=withOperationalMonitoring(routeMonitoringProfile("/api/booking/travel-quote","POST"),handle);
