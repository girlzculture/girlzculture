import { dateKeyInTimeZone } from "@/lib/dateTime";

type SalonStatusRow = { is_closed_override?: unknown; closed_override_date?: unknown; time_zone?: unknown; hours?: unknown };
type HoursRange = { open: number; close: number; closed: boolean };
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export function isSalonClosedOn(salon: SalonStatusRow, date: string) {
  return Boolean(salon.is_closed_override) && String(salon.closed_override_date || "") === date;
}
export function isSalonClosedToday(salon: SalonStatusRow, now = new Date()) {
  return isSalonClosedOn(salon, dateKeyInTimeZone(now, String(salon.time_zone || "America/New_York")));
}

function minutes(value: unknown) {
  const normalized=String(value||"").trim().toUpperCase();
  const twelveHour=normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if(twelveHour){let hour=Number(twelveHour[1])%12;if(twelveHour[3]==="PM")hour+=12;return hour*60+Number(twelveHour[2]);}
  const twentyFour=normalized.match(/^(\d{1,2}):(\d{2})$/);
  return twentyFour?Number(twentyFour[1])*60+Number(twentyFour[2]):null;
}

function range(value: unknown): HoursRange | null {
  if(!value)return null;
  if(typeof value==="object"){
    const row=value as Record<string,unknown>;
    if(row.closed===true||row.enabled===false)return {open:0,close:0,closed:true};
    const open=minutes(row.open);const close=minutes(row.close);
    return open==null||close==null?null:{open,close,closed:false};
  }
  const text=String(value).trim();
  if(/^closed$/i.test(text))return {open:0,close:0,closed:true};
  const [openText,closeText]=text.split(/\s*(?:-|–|—|to)\s*/i);
  const open=minutes(openText);const close=minutes(closeText);
  return open==null||close==null?null:{open,close,closed:false};
}

function formatTime(totalMinutes:number){
  const hour=Math.floor(totalMinutes/60);const minute=totalMinutes%60;const suffix=hour>=12?"PM":"AM";const twelve=hour%12||12;
  return `${twelve}${minute?`:${String(minute).padStart(2,"0")}`:""} ${suffix}`;
}

export function getSalonStatusLabel(salon: SalonStatusRow, now=new Date()) {
  if(isSalonClosedToday(salon,now))return "Closed today";
  const hours=salon.hours&&typeof salon.hours==="object"?salon.hours as Record<string,unknown>:null;
  if(!hours)return "Hours not posted";
  const timeZone=String(salon.time_zone||"America/New_York");
  const parts=new Intl.DateTimeFormat("en-US",{timeZone,weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const weekday=parts.find(part=>part.type==="weekday")?.value||"Sun";
  const dayIndex=Math.max(0,DAYS.indexOf(weekday));
  const hour=Number(parts.find(part=>part.type==="hour")?.value||0);
  const minute=Number(parts.find(part=>part.type==="minute")?.value||0);
  const current=hour*60+minute;
  const today=range(hours[weekday]);
  if(today&&!today.closed){
    if(current<today.open)return `Opens ${formatTime(today.open)}`;
    if(current<today.close)return `Open · closes ${formatTime(today.close)}`;
  }
  for(let offset=1;offset<=7;offset+=1){
    const day=DAYS[(dayIndex+offset)%7];const next=range(hours[day]);
    if(next&&!next.closed)return `Closed today · opens ${offset===1?"tomorrow":day} ${formatTime(next.open)}`;
  }
  return today?.closed?"Closed today":"Hours not posted";
}
