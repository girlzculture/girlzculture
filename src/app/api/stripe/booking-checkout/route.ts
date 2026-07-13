import { cleanEmail, cleanText, cleanUsPhone, enforceRateLimit, errorResponse, rejectBot } from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { siteUrl, stripeRequest } from "@/lib/stripeServer";

type PriceOption = { value?:string; label?:string; price_add?:number|string };
const options = (value: unknown): PriceOption[] => Array.isArray(value) ? value as PriceOption[] : [];

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "booking-checkout", 8, 10 * 60_000);
    const body = await request.json() as Record<string, unknown>;
    rejectBot(body);
    const admin = getSupabaseAdmin();
    const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
    const {data:authData}=token?await admin.auth.getUser(token):{data:{user:null}};
    const customerId=authData.user?.id||null;
    const salonId = cleanText(body.salon_id, 50); const styleId = cleanText(body.style_id, 50);
    if (!salonId || !styleId) throw new Error("The salon or style selection is missing. Please return to the salon page and try again.");
    const { data: salon, error: salonError } = await admin.from("salons").select("id,slug,name,status,subscription_status,capacity").eq("id",salonId).single();
    if (salonError) throw new Error(`Unable to verify the salon: ${salonError.message}`);
    if (!salon || salon.status !== "Active" || !["active","trialing"].includes(String(salon.subscription_status).toLowerCase())) throw new Error("This salon is not currently accepting marketplace bookings.");
    const { data: style, error: styleError } = await admin.from("styles").select("*").eq("id",styleId).eq("salon_id",salonId).single();
    if (styleError) throw new Error(`Unable to verify the selected style: ${styleError.message}`);
    if (!style) throw new Error("The selected style is not available.");
    const selectedSize=cleanText(body.selected_size,80), selectedLength=cleanText(body.selected_length,80);
    const selectedAddons=Array.isArray(body.selected_addons)?body.selected_addons.map((item)=>cleanText(item,80)).slice(0,20):[];
    const add = (rows:PriceOption[], value:string) => Number(rows.find((item)=>item.value===value||item.label===value)?.price_add||0);
    let total = Number(style.base_price || style.price_display_min || 0) + add(options(style.size_options),selectedSize) + add(options(style.length_options),selectedLength);
    total += selectedAddons.reduce((sum:number,value:string)=>sum+add(options(style.addons),value),0);
    const materialId:string|null = cleanText(body.selected_material_id,50) || null;
    if (materialId) { const {data:material}=await admin.from("style_materials").select("price").eq("id",materialId).eq("style_id",styleId).single(); if(!material) throw new Error("The selected material is not available."); total += Number(material.price||0); }
    total=Math.round(total*100)/100;
    if (!(total>0) || total>5000) throw new Error("The booking total could not be verified.");
    const deposit=Math.round(total*10)/100;
    const appointment=new Date(cleanText(body.appointment_datetime,60));
    if (!Number.isFinite(appointment.getTime()) || appointment.getTime()<Date.now()+30*60_000) throw new Error("Choose a future appointment time.");
    const stylistId=cleanText(body.stylist_id,50)||null;
    if(stylistId){const {data:stylist}=await admin.from("stylists").select("id").eq("id",stylistId).eq("salon_id",salonId).single();if(!stylist)throw new Error("The selected stylist is not available at this salon.");}
    let conflictQuery=admin.from("bookings").select("id",{count:"exact",head:true}).eq("salon_id",salonId).eq("appointment_datetime",appointment.toISOString()).neq("status","Cancelled");
    if(stylistId)conflictQuery=conflictQuery.eq("stylist_id",stylistId);
    const {count:conflicts}=await conflictQuery;
    if((conflicts||0)>=Number(stylistId?1:salon.capacity||1))throw new Error("That appointment time was just booked. Please choose another time.");
    const guestName=cleanText(body.guest_name,120), guestEmail=cleanEmail(body.guest_email), guestPhone=cleanUsPhone(body.guest_phone,false);
    if (!guestName) throw new Error("Enter your name.");
    const payload={ customer_id:customerId,salon_id:salonId,style_id:styleId,stylist_id:stylistId,selected_size:selectedSize||null,selected_length:selectedLength||null,selected_material_id:materialId,selected_addons:selectedAddons,appointment_datetime:appointment.toISOString(),duration_hours:Number(style.duration_min_hours||0),estimated_total:total,deposit_amount:deposit,balance_due:Math.round((total-deposit)*100)/100,confirmation_code:`GC-${crypto.randomUUID().slice(0,8).toUpperCase()}`,status:"Requested",deposit_status:"Paid",guest_name:guestName,guest_email:guestEmail,guest_phone:guestPhone,source:"Website"};
    const {data:intent,error:intentError}=await admin.from("booking_checkout_intents").insert({salon_id:salonId,style_id:styleId,payload,total_amount:total,deposit_amount:deposit}).select("id").single();
    if(intentError)throw intentError;
    if (!intent?.id) throw new Error("The secure booking record could not be created. No payment was started.");
    const session=await stripeRequest<{id:string;url:string}>("/checkout/sessions",{mode:"payment","line_items[0][price_data][currency]":"usd","line_items[0][price_data][unit_amount]":Math.round(deposit*100),"line_items[0][price_data][product_data][name]":`${salon.name} reservation deposit`,"line_items[0][quantity]":1,customer_email:guestEmail,success_url:`${siteUrl(request)}/salon/${salon.slug}/book?booking_session={CHECKOUT_SESSION_ID}`,cancel_url:`${siteUrl(request)}/salon/${salon.slug}/book?payment=cancelled`,"metadata[booking_intent_id]":intent.id,"metadata[type]":"booking_deposit","payment_intent_data[description]":`10% reservation deposit for ${style.name}`});
    if (!session?.id || !session?.url) throw new Error("Stripe did not return a checkout session. No payment was taken.");
    await admin.from("booking_checkout_intents").update({stripe_checkout_session_id:session.id}).eq("id",intent.id);
    return Response.json({url:session.url,deposit,total,testMode:true});
  } catch(error){console.error("Booking checkout failed",error);return errorResponse(error,"Unable to start secure checkout.");}
}
