import "server-only";
import type {requireSalonOwner} from "@/lib/supabaseAdmin";
import {businessDay} from "@/lib/businessOverview";
import {salonTimeZone,zonedLocalToUtc} from "@/lib/dateTime";
import {readBusinessFinances} from "@/lib/businessFinanceServer";
import {calendarAvailability} from "@/lib/bookingAvailabilityServer";
import {productStock} from "@/lib/businessProductInventory";
import {capturePlatformError} from "@/lib/platformErrors";
import {morningMoney,morningSchedule,type BriefAppointment,type BriefSection,type MorningBrief} from "@/lib/businessMorningBrief";
type Row=Record<string,unknown>;
type Context=Awaited<ReturnType<typeof requireSalonOwner>>;
const cap=1000;
function bounded<T>(result:{data:T[]|null;error:unknown},salonId?:string):T[]{
 if(result.error)throw result.error;
 if(!Array.isArray(result.data)||result.data.length>cap)throw Error("BRIEF_RANGE_LIMIT");
 if(salonId&&result.data.some(row=>(row as Row).salon_id!==salonId))throw Error("BRIEF_SCOPE_INVALID");
 return result.data;
}
export async function readMorningBrief(request:Request,context:Context,now=Date.now()):Promise<MorningBrief>{
 // This owner's operating summary includes finance and customer activity.
 // Team members continue using their individually permitted workspace views.
 if(!context.isOwner)throw Error("Forbidden");
 const {admin,salon}=context,timeZone=salonTimeZone(salon.time_zone),date=businessDay(now,timeZone)!;
 const tomorrow=new Date(`${date}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 const from=zonedLocalToUtc(`${date}T00:00`,timeZone).toISOString(),to=zonedLocalToUtc(`${tomorrow.toISOString().slice(0,10)}T00:00`,timeZone).toISOString();
 async function section<T>(name:string,read:()=>Promise<T>):Promise<BriefSection<T>>{
  try{return {status:"ok",value:await read()};}
  catch{
   const reference=await capturePlatformError({request,admin,error:new Error("BRIEF_SECTION_UNAVAILABLE"),feature:"business-morning-brief",action:name,actorRole:"salon",actorId:context.user.id,salonId:salon.id,safeMessage:"Part of the morning brief could not be loaded.",severity:"low"});
   return {status:"unavailable",request_id:reference};
  }
 }
 // Read each table only inside this authenticated business. Never consult
 // discovery, public profiles, another business's history, or an AI provider.
 let records:BriefAppointment[]=[];
 const appointments=await section("appointments",async()=>{
  const [bookings,stylists,styles]=await Promise.all([
   admin.from("bookings").select("id,salon_id,appointment_datetime,blocked_until,duration_hours,status,guest_name,stylist_id,manual_service_name,style_id,payment_mode").eq("salon_id",salon.id).gte("appointment_datetime",from).lt("appointment_datetime",to).order("appointment_datetime").limit(cap+1),
   admin.from("stylists").select("id,salon_id,name").eq("salon_id",salon.id).limit(cap+1),
   admin.from("styles").select("id,salon_id,name").eq("salon_id",salon.id).limit(cap+1),
  ]);
  records=bounded<BriefAppointment>(bookings,salon.id).filter(row=>row.payment_mode!=="test");
  const people=bounded<Row>(stylists,salon.id),services=bounded<Row>(styles,salon.id);
  return {...morningSchedule(records,now),items:records.map(row=>({id:row.id,at:row.appointment_datetime,client:row.guest_name,service:row.manual_service_name||String(services.find(s=>s.id===row.style_id)?.name||"")||null,professional:String(people.find(p=>p.id===row.stylist_id)?.name||"")||null,status:row.status}))};
 });
 const [money,availability,inventory,followups]=await Promise.all([
  section("money",async()=>{
   if(appointments.status!=="ok")throw Error("BRIEF_APPOINTMENTS_UNAVAILABLE");
   const finance=await readBusinessFinances(context,{from:date,to:date,timeZone});
   return morningMoney(salon.id,records,finance.books,now);
  }),
  section("availability",async()=>{
   const [calendar,waiting]=await Promise.all([
    calendarAvailability({salonId:salon.id,date}),
    admin.from("appointment_waitlist").select("id,salon_id,stylist_id,starts_after,starts_before").eq("salon_id",salon.id).eq("status","waiting").gt("starts_before",new Date(now).toISOString()).lt("starts_after",to).limit(cap+1),
   ]);
   const requests=bounded<Row>(waiting,salon.id);
   return {gaps:calendar.gaps.map(g=>({start:g.start,end:g.end,professional_name:g.professional_name})),waitlist_opportunities:requests.filter(w=>calendar.gaps.some(g=>(!w.stylist_id||w.stylist_id===g.stylist_id)&&Date.parse(String(w.starts_after))<Date.parse(g.end)&&Date.parse(String(w.starts_before))>Date.parse(g.start))).length};
  }),
  section("inventory",async()=>{
   const stock=await admin.rpc("read_business_stock",{p_salon:salon.id,p_user:context.user.id});
   if(stock.error)throw stock.error;
   if(!Array.isArray(stock.data?.products)||!Array.isArray(stock.data?.supplies))throw Error("BRIEF_STOCK_INVALID");
   return [...stock.data.products,...stock.data.supplies].flatMap((row:Row)=>{const state=productStock(row);return ["low","out","unknown"].includes(state.state)?[{name:String(row.name),quantity:state.quantity}]:[];});
  }),
  section("followups",async()=>{
   const result=await admin.from("booking_followup_queue").select("booking_id,schedule_revision,bookings!inner(salon_id,guest_name,status,schedule_revision,payment_mode)").eq("bookings.salon_id",salon.id).eq("status","pending").lte("due_at",new Date(now).toISOString()).gt("expires_at",new Date(now).toISOString()).lt("attempts",3).limit(cap+1);
   const queued=bounded<Row>(result as unknown as {data:Row[]|null;error:unknown});
   return queued.flatMap(row=>{
    const booking=row.bookings as Row;
    if(!booking||booking.salon_id!==salon.id)throw Error("BRIEF_SCOPE_INVALID");
    if(booking.status!=="Completed"||booking.payment_mode==="test"||booking.schedule_revision!==row.schedule_revision)return [];
    return [{booking_id:String(row.booking_id),client:booking.guest_name?String(booking.guest_name):null}];
   });
  }),
 ]);
 return {date,time_zone:timeZone,generated_at:new Date(now).toISOString(),appointments,money,availability,inventory,followups};
}
