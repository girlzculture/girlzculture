import { normalizePlan, planRank } from "@/lib/plans";
import { deliverBookingNotifications, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { stripeGet, verifyStripeEvent } from "@/lib/stripeServer";

type StripeObject = Record<string, unknown> & { id?:string; metadata?:Record<string,string>; status?:string; customer?:string; subscription?:string; mode?:string; payment_status?:string; payment_intent?:string; current_period_start?:number; current_period_end?:number; cancel_at_period_end?:boolean; schedule?:string|{id?:string}|null; latest_invoice?:string|{id?:string}|null; items?:{data?:Array<{price?:{id?:string}}>}; discounts?:Array<{coupon?:{id?:string}|string;promotion_code?:{id?:string}|string}>; };

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
  const {data:existing}=await admin.from("subscriptions").select("*").eq("salon_id",salonId).maybeSingle();
  const plan=planFromObject(object);
  const status=String(object.status||"inactive");
  const periodStart=object.current_period_start?new Date(object.current_period_start*1000).toISOString():existing?.current_period_start||null;
  const periodEnd=object.current_period_end?new Date(object.current_period_end*1000).toISOString():null;
  const scheduleId=typeof object.schedule==="string"?object.schedule:object.schedule?.id||existing?.stripe_schedule_id||null;
  const scheduledBecameEffective=Boolean(existing?.scheduled_tier&&normalizePlan(existing.scheduled_tier)===plan);
  const cancellationRequestedAt=object.cancel_at_period_end?(existing?.cancellation_requested_at||new Date().toISOString()):null;
  const endedAt=["canceled","incomplete_expired"].includes(status.toLowerCase())?(existing?.ended_at||new Date().toISOString()):null;
  const latestInvoiceId=typeof object.latest_invoice==="string"?object.latest_invoice:object.latest_invoice?.id||existing?.last_invoice_id||null;
  const {error:subscriptionError}=await admin.from("subscriptions").upsert({
    salon_id:salonId,
    tier:plan,
    status,
    stripe_subscription_id:object.id,
    stripe_customer_id:object.customer||null,
    price_id:object.items?.data?.[0]?.price?.id||null,
    current_period_start:periodStart,
    current_period_end:periodEnd,
    cancel_at_period_end:Boolean(object.cancel_at_period_end),
    cancellation_requested_at:cancellationRequestedAt,
    ended_at:endedAt,
    stripe_schedule_id:scheduleId,
    scheduled_tier:scheduledBecameEffective?null:existing?.scheduled_tier||null,
    scheduled_price_id:scheduledBecameEffective?null:existing?.scheduled_price_id||null,
    scheduled_change_effective_at:scheduledBecameEffective?null:existing?.scheduled_change_effective_at||null,
    last_invoice_id:latestInvoiceId,
    updated_at:new Date().toISOString(),
  },{onConflict:"salon_id"});
  if(subscriptionError)throw subscriptionError;
  const active=["active","trialing"].includes(status.toLowerCase());
  const {error:salonError}=await admin.from("salons").update({subscription_tier:plan,subscription_status:active?status:"inactive",featured_weight:active?(planRank(plan)===3?100:planRank(plan)===2?40:0):0}).eq("id",salonId);
  if(salonError)throw salonError;
}

async function syncScheduleState(object: StripeObject, eventType: string) {
  if(!object.id)return;
  if(!["subscription_schedule.completed","subscription_schedule.released","subscription_schedule.canceled"].includes(eventType))return;
  const admin=getSupabaseAdmin();
  const {error}=await admin.from("subscriptions").update({
    stripe_schedule_id:null,
    scheduled_tier:null,
    scheduled_price_id:null,
    scheduled_change_effective_at:null,
    updated_at:new Date().toISOString(),
  }).eq("stripe_schedule_id",object.id);
  if(error)throw error;
}

async function completeBookingCheckout(session: StripeObject) {
  if(session.metadata?.type!=="booking_deposit"||!["paid","no_payment_required"].includes(String(session.payment_status)))return;
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

async function trackPromoRedemption(session: StripeObject) {
  if (!session.id) return;
  const admin = getSupabaseAdmin();
  if (session.metadata?.promo_redemption_id) {
    await admin.rpc("redeem_promo_code", { p_redemption_id: session.metadata.promo_redemption_id, p_checkout_session_id: session.id });
    return;
  }
  let details = session;
  if (!details.discounts?.length) details = await stripeGet<StripeObject>(`/checkout/sessions/${session.id}?expand[]=discounts.coupon&expand[]=discounts.promotion_code`);
  const discount = details.discounts?.[0];
  const promotionId = typeof discount?.promotion_code === "string" ? discount.promotion_code : discount?.promotion_code?.id;
  const couponId = typeof discount?.coupon === "string" ? discount.coupon : discount?.coupon?.id;
  if (!promotionId && !couponId) return;
  let query = admin.from("promo_codes").select("id");
  query = promotionId ? query.eq("stripe_promotion_code_id", promotionId) : query.eq("stripe_coupon_id", couponId as string);
  const { data: promo } = await query.maybeSingle();
  if (!promo) return;
  const purpose = session.mode === "subscription" ? "subscription" : "booking";
  let userId: string | null = null;
  if (purpose === "booking" && session.metadata?.booking_intent_id) {
    const { data: intent } = await admin.from("booking_checkout_intents").select("customer_id").eq("id", session.metadata.booking_intent_id).maybeSingle();
    userId = intent?.customer_id || null;
  }
  await admin.rpc("record_stripe_promo_redemption", { p_promo_code_id: promo.id, p_purpose: purpose, p_user_id: userId, p_salon_id: session.metadata?.salon_id || null, p_checkout_session_id: session.id });
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
      await trackPromoRedemption(object);
      await completeBookingCheckout(object);
      if(object.mode==="subscription"&&object.subscription){const subscription=await stripeGet<StripeObject>(`/subscriptions/${object.subscription}`);await syncSubscription(subscription);}
    }
    if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type))await syncSubscription(object);
    if(event.type.startsWith("subscription_schedule."))await syncScheduleState(object,event.type);
    return Response.json({received:true});
  } catch(error){
    await admin.from("stripe_webhook_events").delete().eq("id",event.id);
    console.error("Stripe webhook processing failed",{eventId:event.id,type:event.type,error});
    return Response.json({error:"Webhook processing failed"},{status:500});
  }
}
