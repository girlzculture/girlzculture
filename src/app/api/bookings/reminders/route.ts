import { processBookingReminders } from "@/lib/supabaseAdmin";

export const runtime="nodejs";
export async function POST(request:Request){
  const secret=request.headers.get("x-internal-secret");
  if(!process.env.INTERNAL_API_SECRET||secret!==process.env.INTERNAL_API_SECRET)return Response.json({error:"Unauthorized"},{status:401});
  try{return Response.json({ok:true,...await processBookingReminders()});}
  catch(error){console.error("Scheduled booking reminders failed",error);return Response.json({error:"Reminder processing failed."},{status:500});}
}
