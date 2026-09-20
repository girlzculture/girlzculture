import { bookingAvailability } from "@/lib/bookingAvailabilityServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { capturePlatformError } from "@/lib/platformErrors";

export const WAITLIST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const copy: Record<string, {title:string;body:string}> = {
 en:{title:"An appointment opened up",body:"A time matches your waitlist request. Review the offer in your account before it expires. Availability and deposit terms are checked again at checkout; you have not been booked or charged."},
 fr:{title:"Un créneau s’est libéré",body:"Un horaire correspond à votre demande. Consultez l’offre dans votre compte avant son expiration. La disponibilité et l’acompte seront revérifiés au paiement ; aucune réservation ni aucun prélèvement n’a été effectué."},
 es:{title:"Se ha liberado una cita",body:"Un horario coincide con tu solicitud. Revisa la oferta en tu cuenta antes de que caduque. La disponibilidad y el depósito se comprobarán al reservar; no se ha confirmado ninguna cita ni realizado ningún cargo."},
 "zh-CN":{title:"有新的可预约时段",body:"有时段符合您的候补要求。请在到期前到账户中查看。结账时将再次核实时段和订金条款；目前尚未预约或扣款。"},
};
type Candidate = {request_id:string;source_booking_id:string;salon_id:string;customer_id:string;style_id:string;stylist_id:string|null;appointment_at:string;time_zone:string;locale:string};

/** Existing protected scheduler; at most three checks, no model calls or payment calls. */
export async function processAppointmentWaitlist() {
 const admin=getSupabaseAdmin();
 const due=await admin.rpc("due_appointment_waitlist");
 if(due.error)throw due.error;
 let offered=0,unavailable=0,failed=0;
 for(const item of (due.data||[]) as Candidate[]) {
  try {
   const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:item.time_zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(item.appointment_at)).map(part=>[part.type,part.value]));
   const date=`${parts.year}-${parts.month}-${parts.day}`,time=`${parts.hour}:${parts.minute}`;
   const availability=await bookingAvailability({salonId:item.salon_id,styleId:item.style_id,stylistId:item.stylist_id,customerId:item.customer_id,date});
   const slot=availability.slots.find(slot=>slot.value===time);
   if(!slot){unavailable++;continue;}
   const result=await admin.rpc("offer_appointment_waitlist",{p_request:item.request_id,p_source:item.source_booking_id,p_stylist:slot.stylistId||null,p_copy:copy[item.locale]||copy.en});
   if(result.error)throw result.error;
   if(result.data)offered++;
  }catch {
   failed++;
   await capturePlatformError({admin,error:Error("WAITLIST_OFFER_FAILED"),feature:"appointment-waitlist",action:"offer",actorRole:"system",salonId:item.salon_id,safeMessage:"A waitlist opening could not be checked."});
  }
 }
 return {checked:(due.data||[]).length,offered,unavailable,failed};
}

export async function waitlistFailure(request:Request,error:unknown,admin?:ReturnType<typeof getSupabaseAdmin>) {
 const message=error&&typeof error==="object"&&"message" in error?String(error.message):"";
 const allowed=new Set(["WAITLIST_AUTH_REQUIRED","WAITLIST_ACCESS_DENIED","WAITLIST_BUSINESS_UNAVAILABLE","WAITLIST_SERVICE_UNAVAILABLE","WAITLIST_INVALID_INPUT","WAITLIST_REQUEST_CONFLICT","WAITLIST_LIMIT"]);
 const code=allowed.has(message)?message:message.startsWith("Unauthorized")?"WAITLIST_AUTH_REQUIRED":message.startsWith("Forbidden")?"WAITLIST_ACCESS_DENIED":error instanceof SyntaxError?"WAITLIST_INVALID_INPUT":"WAITLIST_UNAVAILABLE";
 const status=code==="WAITLIST_AUTH_REQUIRED"?401:code==="WAITLIST_ACCESS_DENIED"||message.startsWith("Forbidden")?403:code==="WAITLIST_REQUEST_CONFLICT"?409:code==="WAITLIST_UNAVAILABLE"?500:400;
 const reference=await capturePlatformError({request,admin,error:Error(code),feature:"appointment-waitlist",action:request.method,actorRole:"customer",safeMessage:"The appointment waitlist could not be updated.",severity:status>=500?"high":"low"});
 return Response.json({code,request_id:reference},{status,headers:{"Cache-Control":"private, no-store","X-Request-ID":reference}});
}
