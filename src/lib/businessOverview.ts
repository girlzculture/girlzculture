type Row = Record<string, unknown>;
export type OverviewPeriod = "today" | "week" | "month";
export function businessDay(value: string | number | Date, timeZone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(date);
  return ["year","month","day"].map(key=>parts.find(part=>part.type===key)?.value).join("-");
}
export function businessOverview(bookings: Row[], period: OverviewPeriod, timeZone: string, now = Date.now()) {
  const today = businessDay(now,timeZone)!;
  const anchor = new Date(`${today}T12:00:00Z`);
  const start = new Date(anchor);
  if(period==="week") start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));
  if(period==="month") start.setUTCDate(1);
  const from = start.toISOString().slice(0,10);
  const real = bookings.filter(row=>row.payment_mode!=="test");
  const dated = real.map(row=>({row,day:businessDay(String(row.appointment_datetime||""),timeZone)})).filter(item=>item.day!==null);
  const selected = dated.filter(item=>item.day!>=from&&item.day!<=today).map(item=>item.row);
  const market = selected.filter(row=>row.booking_origin!=="business_added");
  const terminal = market.filter(row=>/^(completed|cancelled|canceled|no show)$/i.test(String(row.status)));
  const cancelled = terminal.filter(row=>/^(salon|business)$/i.test(String(row.cancellation_initiated_by||row.cancelled_by||""))&&/^cancel[le]+d$/i.test(String(row.status)));
  const completedValue = (rows:Row[])=>rows.filter(row=>row.booking_origin!=="business_added"&&/^completed$/i.test(String(row.status))).reduce((sum,row)=>sum+(row.estimated_total!=null&&Number.isFinite(Number(row.estimated_total))?Math.round(Number(row.estimated_total)*100):0),0);
  const trend = Array.from({length:6},(_,index)=>{
    const key=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()-5+index,1,12)).toISOString().slice(0,7);
    const rows=dated.filter(item=>item.day!.startsWith(key)&&item.day!<=today).map(item=>item.row);
    return {month:key,appointments:rows.length,completed_value_cents:completedValue(rows)};
  });
  const isScheduled=(row:Row)=>!/^(cancelled|canceled|declined|refunded|no show)$/i.test(String(row.status));
  const sorted=dated.filter(({row})=>isScheduled(row)).sort((a,b)=>Date.parse(String(a.row.appointment_datetime))-Date.parse(String(b.row.appointment_datetime)));
  return {from,to:today,appointments:selected.length,marketplace:market.length,business_added:selected.length-market.length,
    identified_clients:new Set(selected.map(row=>row.customer_id||String(row.guest_email||"").trim().toLowerCase()).filter(Boolean)).size,
    completed_value_cents:completedValue(market),missing_completed_prices:market.filter(row=>/^completed$/i.test(String(row.status))&&(row.estimated_total==null||!Number.isFinite(Number(row.estimated_total)))).length,
    cancellation_rate:terminal.length?cancelled.length/terminal.length:null,cancellation_denominator:terminal.length,
    today:sorted.filter(item=>item.day===today).map(item=>item.row),upcoming:sorted.filter(item=>Date.parse(String(item.row.appointment_datetime))>now).slice(0,5).map(item=>item.row),trend};
}
