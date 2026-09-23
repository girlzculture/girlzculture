import "server-only";
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {TravelBookingError,type TravelQuote} from "@/lib/mobileBooking";

export function travelEmailHash(email:string){return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");}
export async function readCheckoutTravelQuote(admin:SupabaseClient,business:Record<string,unknown>,body:Record<string,unknown>,customerId:string|null,email:string):Promise<TravelQuote|null>{
  const mobile=body.service_visit_mode==="mobile";
  if(business.service_location_type==="mobile"&&!mobile)throw new TravelBookingError("TRAVEL_ADDRESS_REQUIRED");
  if(!mobile){
    if(body.travel_quote_id!=null)throw new TravelBookingError("TRAVEL_NOT_AVAILABLE");
    return null;
  }
  if(business.is_demo===true||!(business.service_location_type==="mobile"||business.offers_mobile===true))throw new TravelBookingError("TRAVEL_NOT_AVAILABLE");
  if(typeof body.travel_quote_id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.travel_quote_id))throw new TravelBookingError("TRAVEL_ADDRESS_REQUIRED");
  const {data:q,error}=await admin.from("business_travel_quotes").select("id,salon_id,customer_id,email_hash,address,fee_cents,expires_at,location_revision,intent_id")
    .eq("id",body.travel_quote_id).eq("salon_id",business.id).maybeSingle();
  if(error)throw error;
  if(!q||q.customer_id!==customerId||q.email_hash!==travelEmailHash(email))throw new TravelBookingError("TRAVEL_QUOTE_FORBIDDEN",403);
  if(q.intent_id||Date.parse(q.expires_at)<=Date.now())throw new TravelBookingError("TRAVEL_QUOTE_EXPIRED",409);
  if(q.location_revision!==business.location_settings_revision||q.fee_cents!==business.travel_fee_cents)throw new TravelBookingError("TRAVEL_TERMS_CHANGED",409);
  return {id:q.id,address:q.address,fee_cents:q.fee_cents,expires_at:q.expires_at};
}
