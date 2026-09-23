import 'server-only';
import {getSupabaseAdmin,sendEmail} from '@/lib/supabaseAdmin';
import {campaignEmailAvailable} from '@/lib/businessCustomerCampaignServer';
import {communicationUnsubscribeToken} from '@/lib/businessCommunicationServer';
import {campaignHtml} from '@/lib/businessCustomerCampaignEmail';
import {REBOOKING_COPY} from '@/lib/businessRebookingReminders';
import {capturePlatformError} from '@/lib/platformErrors';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** A permanent database latch prevents re-sending after response loss or timeout.
 * Only the published scheduler calls this path; no model or billing operation. */
export async function processBusinessRebookingReminders(){
 const admin=getSupabaseAdmin();if(!await campaignEmailAvailable(admin))return {available:false,checked:0,accepted:0,uncertain:0};
 communicationUnsubscribeToken('00000000-0000-4000-8000-000000000000');
 const due=await admin.rpc('due_business_rebooking_reminders');if(due.error||!Array.isArray(due.data)||due.data.length>3)throw Error('REBOOKING_QUEUE_UNAVAILABLE');
 let accepted=0,uncertain=0;
 for(const item of due.data){
  if(![item.salon_id,item.customer_id,item.booking_id].every(id=>typeof id==='string'&&uuid.test(id)))throw Error('REBOOKING_QUEUE_INVALID');
  const claim=await admin.rpc('claim_business_rebooking_reminder',{p_salon:item.salon_id,p_customer:item.customer_id,p_booking:item.booking_id});if(claim.error)throw Error('REBOOKING_CLAIM_FAILED');if(!claim.data)continue;
  const c=claim.data;let status:'accepted'|'uncertain'='uncertain';
  // Validate the immutable attempt identity before any provider operation.
  if(c.salon_id!==item.salon_id||!uuid.test(c.attempt_id))throw Error('REBOOKING_CLAIM_INVALID');
  try{
   if(!Object.hasOwn(REBOOKING_COPY,c.locale)||!uuid.test(c.preference_id)||typeof c.destination!=='string'||/[\r\n]/.test(c.destination)||!c.destination.includes('@')
    ||typeof c.business_name!=='string'||/[\r\n]/.test(c.business_name)||!/^\/salon\/[a-z0-9-]+\/book$/.test(c.booking_path))throw Error('REBOOKING_CLAIM_INVALID');
   const copy=REBOOKING_COPY[c.locale as keyof typeof REBOOKING_COPY],unsubscribe=new URL('/communications/unsubscribe','https://girlzculture.com');unsubscribe.searchParams.set('token',communicationUnsubscribeToken(c.preference_id));
   const html=campaignHtml(copy,new URL(c.booking_path,'https://girlzculture.com').href,unsubscribe.href,copy);
   const response=await sendEmail(c.destination,copy.title,html,'account',{fromName:c.business_name,idempotencyKey:`business-rebooking:${c.attempt_id}`,signal:AbortSignal.timeout(10_000)});
   if(typeof response?.id==='string'&&response.id&&!response.skipped)status='accepted';
  }catch{status='uncertain';}
  const reference=status==='uncertain'?await capturePlatformError({admin,error:Error('REBOOKING_OUTCOME_UNCERTAIN_NO_RETRY'),feature:'rebooking-reminders',action:'email-outcome',actorRole:'system',salonId:item.salon_id,safeMessage:'A rebooking email needs review. It will not be sent again automatically.'}):null;
  const finish=await admin.rpc('finish_business_rebooking_reminder',{p_salon:item.salon_id,p_attempt:c.attempt_id,p_status:status,p_reference:reference});if(finish.error)throw Error('REBOOKING_OUTCOME_NOT_RECORDED');
  if(status==='accepted')accepted++;else uncertain++;
 }
 return {available:true,checked:due.data.length,accepted,uncertain};
}
