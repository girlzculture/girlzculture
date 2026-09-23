import {timingSafeEqual} from 'node:crypto';
import {processBusinessRebookingReminders} from '@/lib/businessRebookingRemindersServer';
import {capturePlatformError} from '@/lib/platformErrors';
export const runtime='nodejs';
export async function POST(request:Request){
 const wanted=process.env.INTERNAL_API_SECRET,actual=request.headers.get('x-internal-secret');
 if(!wanted||!actual||Buffer.byteLength(wanted)!==Buffer.byteLength(actual)||!timingSafeEqual(Buffer.from(wanted),Buffer.from(actual)))return Response.json({code:'AUTH_REQUIRED'},{status:401});
 try{return Response.json(await processBusinessRebookingReminders(),{headers:{'Cache-Control':'private, no-store'}});}
 catch{const id=await capturePlatformError({request,error:Error('REBOOKING_WORKER_UNAVAILABLE'),feature:'rebooking-reminders',action:'scheduled',actorRole:'system',safeMessage:'Rebooking reminders need review.'});return Response.json({code:'REBOOKING_UNAVAILABLE',request_id:id},{status:500,headers:{'X-Request-ID':id,'Cache-Control':'private, no-store'}});}
}
