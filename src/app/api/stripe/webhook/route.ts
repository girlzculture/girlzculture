import { normalizePlan, planRank } from "@/lib/plans";
import { deliverBookingNotifications, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { stripeGet, verifyStripeEvent } from "@/lib/stripeServer";

type StripeObject = Record<string, unknown> & { id?:string; metadata?:Record<string,string>; status?:string; customer?:string; subscription?:string; mode?:string; payment_status?:string; payment_intent?:string; current_period_end?:number; cancel_at_period_end?:boolean; items?:{data?:Array<{price?:{id?:string}}>}; };

function planFromObject(object: StripeObject) {
  const priceId=object.items?.data?.[0]?.price?.id;
  if(priceId===process.env.STRIPE_PREMIUM_PRICE_ID)return "Premium";
  if(priceId===process.env.STRIPE_GROWTH_PRICE_ID)return "Growth";
  if(priceId===process.env.STRIPE_BASIC_PRICE_ID)return "Basic";
  return normalizePlan(object.metadata?.plan);
}

async function syncSubscription(object: StripeObject) {
  const admin=getSupabaseAdmin();
  const salonId=object.metadata?.salon_id;
  if(!salonId||!object.id)return;
  const plan=planFromObject(object);
  const status=String(object.status||"inactive");
  const periodEnd=object.current_period_end?new Date(object.current_period_end*1000).toISOString():null;
  await admin.from("subscriptions").upsert({salon_id:salonId,tier:plan,status,stripe_subscription_id:object.id,stripe_customer_id:object.customer||null,price_id:object.items?.data?.[0]?.price?.id||null,current_period_end:periodEnd,cancel_at_period_end:Boolean(object.cancel_at_period_end),updated_at:new Date().toISOString()},{onConflict:"salon_id"});
  const active=["active","trialing"].includes(status.toLowerCase());
  await admin.from("salons").update({subscription_tier:plan,subscription_status:active?status:"inactive",featured_weight:active?(planRank(plan)===3?100:planRank(plan)===2?40:0):0}).eq("id",salonId);
}

async function completeBookingCheckout(session: StripeObject) {
  if(session.metadata?.type!=="booking_deposit"||session.payment_status!=="paid")return;
  const admin=getSupabaseAdmin();
  const intentId=session.metadata.booking_intent_id;
  if(!intentId)return;
  const {data:intent}=await admin.from("booking_checkout_intents").select("*").eq("id",intentId).single();
  if(!intent||intent.status==="Paid")return;
  const payload={...(intent.payload as Record<string,unknown>),stripe_payment_id:session.payment_intent||session.id,deposit_status:"Paid"};
  const {data:booking,error}=await admin.from("bookings").insert(payload).select("id").single();
  if(error)throw error;
  await admin.from("booking_checkout_intents").update({status:"Paid",booking_id:booking.id}).eq("id",intent.id);
  await deliverBookingNotifications(booking.id).catch((error)=>console.error("Paid booking notification delivery failed",{bookingId:booking.id,error}));
}

export async function POST(request: Request) {
  const rawBody=await request.text();
  let event;
  try { event=verifyStripeEvent(rawBody,request.headers.get("stripe-signature")); }
  catch(error){console.error("Stripe webhook signature failed",error);return Response.json({error:"Invalid signature"},{status:400});}
  const admin=getSupabaseAdmin();
  const {error:dedupeError}=await admin.from("stripe_webhook_events").insert({id:event.id,event_type:event.type});
  if(dedupeError?.code==="23505")return Response.json({received:true,duplicate:true});
  if(dedupeError){console.error("Stripe webhook dedupe failed",dedupeError);return Response.json({error:"Webhook storage failed"},{status:500});}
  try {
    const object=event.data.object as StripeObject;
    if(event.type==="checkout.session.completed"){
      await completeBookingCheckout(object);
      if(object.mode==="subscription"&&object.subscription){const subscription=await stripeGet<StripeObject>(`/subscriptions/${object.subscription}`);await syncSubscription(subscription);}
    }
    if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type))await syncSubscription(object);
    return Response.json({received:true});
  } catch(error){
    await admin.from("stripe_webhook_events").delete().eq("id",event.id);
    console.error("Stripe webhook processing failed",{eventId:event.id,type:event.type,error});
    return Response.json({error:"Webhook processing failed"},{status:500});
  }
}
