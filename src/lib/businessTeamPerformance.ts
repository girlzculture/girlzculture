import {businessDay} from "./businessOverview";
type Row=Record<string,unknown>;
export const teamDays=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
export function professionalHours(value: unknown) {
 const source=value&&typeof value==="object"?value as Row:{};
 return teamDays.map(day=>{
  const entry=source[day];
  if(typeof entry==="string") {
   const match=entry.match(/^(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*[-–]\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)$/i);
   return {day,open:match?.[1]||"",close:match?.[2]||"",closed:!match,configured:Boolean(match)||/^(closed|off)$/i.test(entry)};
  }
  const hours=entry&&typeof entry==="object"?entry as Row:{};
  return {day,open:String(hours.open||""),close:String(hours.close||""),closed:hours.closed===true||!hours.open||!hours.close,configured:hours.closed===true||Boolean(hours.open&&hours.close)};
 });
}
export function professionalPerformance(rows: Row[],salonId:string,stylistId:string,timeZone:string,now=Date.now()) {
 const today=businessDay(now,timeZone)!,start=today.slice(0,8)+"01",seen=new Set<string>();
 const appointments=rows.filter(row=>{
  const day=businessDay(String(row.appointment_datetime||""),timeZone),id=String(row.id||"");
  if(!id||seen.has(id)||row.salon_id!==salonId||row.stylist_id!==stylistId||row.payment_mode==="test"||!day||day<start||day>today)return false;
  seen.add(id);return true;
 });
 const completed=appointments.filter(row=>/^completed$/i.test(String(row.status)));
 const marketplace=completed.filter(row=>row.booking_origin!=="business_added");
 const priced=marketplace.filter(row=>row.estimated_total!=null&&Number.isFinite(Number(row.estimated_total))&&Number(row.estimated_total)>=0);
 const cancellations=appointments.filter(row=>/^(cancelled|canceled)$/i.test(String(row.status)));
 return {from:start,to:today,appointments:appointments.length,completed:completed.length,cancellations:cancellations.length,completed_value_cents:priced.reduce((sum,row)=>sum+Math.round(Number(row.estimated_total)*100),0),missing_prices:marketplace.length-priced.length};
}
