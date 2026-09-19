import {assertOperatingBooksScope, type OperatingBooks} from "@/lib/businessFinanceCore";

export type BriefAppointment={id:string;salon_id:string;appointment_datetime:string;blocked_until:string|null;duration_hours:number|null;status:string;guest_name:string|null;stylist_id:string|null;manual_service_name:string|null;style_id:string|null;payment_mode:string|null};
export type BriefMoney={expected_cents:number;deposit_cents:number;received_cents:number;balance_cents:number};
export type BriefSection<T>={status:"ok";value:T}|{status:"unavailable";request_id:string};
export type MorningBrief={date:string;time_zone:string;generated_at:string;appointments:BriefSection<{items:Array<{id:string;at:string;client:string|null;service:string|null;professional:string|null;status:string}>;cancelled:number;no_shows:number;overlaps:number;unassigned:number;overdue:number}>;money:BriefSection<BriefMoney>;availability:BriefSection<{gaps:Array<{start:string;end:string;professional_name:string|null}>;waitlist_opportunities:number}>;inventory:BriefSection<Array<{name:string;quantity:number|null}>>;followups:BriefSection<Array<{booking_id:string;client:string|null}>>};
export const briefInactive=(status:string)=>/^(cancelled|canceled|noshow)$/.test(status.toLowerCase().replace(/[ _-]/g,""));
export function morningSchedule(rows:BriefAppointment[],now:number){
 const active=rows.filter(row=>!briefInactive(row.status)&&!/^completed$/i.test(row.status));
 let overlaps=0;
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
  const a=active[i],b=active[j];
  if(!a.stylist_id||a.stylist_id!==b.stylist_id)continue;
  const end=(row:BriefAppointment)=>row.blocked_until?Date.parse(row.blocked_until):Date.parse(row.appointment_datetime)+Number(row.duration_hours||0)*3600000;
  if(Date.parse(a.appointment_datetime)<end(b)&&Date.parse(b.appointment_datetime)<end(a))overlaps++;
 }
 return {cancelled:rows.filter(row=>/^cancel[le]+d$/i.test(row.status)).length,no_shows:rows.filter(row=>row.status.toLowerCase().replace(/[ _-]/g,"")==="noshow").length,overlaps,unassigned:active.filter(row=>!row.stylist_id).length,overdue:active.filter(row=>Date.parse(row.appointment_datetime)<now).length};
}
/** Same canonical receipts as Finances; a deposit is part of the payment,
 * never extra revenue. Refunds reduce received money. Estimates stay separate. */
export function morningMoney(salonId:string,rows:BriefAppointment[],books:OperatingBooks,now:number):BriefMoney{
 assertOperatingBooksScope(salonId,books);
 const selected=rows.filter(row=>!briefInactive(row.status));
 const total={expected_cents:0,deposit_cents:0,received_cents:0,balance_cents:0};
 for(const row of selected){
  if(row.salon_id!==salonId)throw Error("BRIEF_SCOPE_INVALID");
  const sale=books.sales.find(sale=>sale.id===`booking:${row.id}`);
  if(!sale)throw Error("BRIEF_MONEY_INCOMPLETE");
  const receipts=books.payments.filter(payment=>payment.sale_id===sale.id&&Date.parse(payment.occurred_at)<=now);
  const received=receipts.reduce((sum,p)=>sum+(p.stage==="refund"?-p.amount_cents:p.amount_cents),0);
  total.expected_cents+=sale.agreed_cents;
  total.deposit_cents+=receipts.filter(p=>p.stage==="deposit").reduce((sum,p)=>sum+p.amount_cents,0);
  total.received_cents+=received;
  total.balance_cents+=Math.max(0,sale.agreed_cents-received);
 }
 return total;
}
