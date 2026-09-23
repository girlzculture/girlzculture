export type BusinessGrowthSettings = {
 revision:number;plan:string|null;reminder_hours:number[]|null;effective_reminder_hours:number[];reminder_limit:number;
 waitlist_mode:"manual"|"automated"|"targeted";waitlist_service_ids:string[];waitlist_professional_ids:string[];
 services:{id:string;name:string}[];professionals:{id:string;name:string}[];
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function growthSettingsInput(value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("GROWTH_INVALID");
 const row=value as Record<string,unknown>;
 if(Object.keys(row).sort().join(',')!=="reminder_hours,revision,waitlist_professional_ids,waitlist_service_ids" || !Number.isSafeInteger(row.revision) || Number(row.revision)<0)throw Error("GROWTH_INVALID");
 const ids=(value:unknown)=>{if(!Array.isArray(value)||value.length>100||value.some(id=>typeof id!=="string"||!uuid.test(id))||new Set(value).size!==value.length)throw Error("GROWTH_INVALID");return value as string[];};
 const hours=row.reminder_hours;
 if(hours!==null&&(!Array.isArray(hours)||hours.length<1||hours.length>6||hours.some(hour=>!Number.isInteger(hour)||hour<1||hour>336)||new Set(hours).size!==hours.length))throw Error("GROWTH_INVALID");
 return {revision:row.revision as number,settings:{reminder_hours:hours===null?null:[...(hours as number[])].sort((a,b)=>b-a),waitlist_service_ids:ids(row.waitlist_service_ids),waitlist_professional_ids:ids(row.waitlist_professional_ids)}};
}
