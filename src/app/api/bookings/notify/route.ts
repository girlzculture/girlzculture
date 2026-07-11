import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { deliverBookingNotifications } from "@/lib/supabaseAdmin";

export async function POST(request:Request){try{enforceRateLimit(request,"booking-notify",20,60_000);const secret=request.headers.get("x-internal-secret");if(!process.env.INTERNAL_API_SECRET||secret!==process.env.INTERNAL_API_SECRET)return Response.json({error:"Unauthorized"},{status:401});const body=await request.json() as Record<string,unknown>;const bookingId=cleanText(body.bookingId,50);if(!bookingId)throw new Error("bookingId is required");return Response.json({ok:true,...await deliverBookingNotifications(bookingId)});}catch(error){console.error("Booking notification failed",error);return errorResponse(error,"Notification failed");}}
