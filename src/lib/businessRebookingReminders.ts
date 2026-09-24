import {REBOOKING_REMINDER_COPY} from '@/i18n/business-rebooking-reminder-copy';
export type RebookingSettings={salon_id:string;revision:number;enabled:boolean;effective_enabled:boolean;absence_days:number;minimum_visits:number;service_ids:string[];plan:string|null;automatic:boolean;segmented:boolean;is_demo:boolean;email_available:boolean;services:{id:string;name:string}[];attempts:{status:'processing'|'accepted'|'uncertain';attempted_at:string;support_reference:string|null}[]};
export const REBOOKING_COPY=REBOOKING_REMINDER_COPY;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function rebookingSettingsInput(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('REBOOKING_INVALID');const v=input as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='absence_days,enabled,minimum_visits,reviewed,revision,service_ids'||typeof v.enabled!=='boolean'||typeof v.reviewed!=='boolean'
  ||!Number.isSafeInteger(v.revision)||Number(v.revision)<0||!Number.isInteger(v.absence_days)||Number(v.absence_days)<30||Number(v.absence_days)>180
  ||!Number.isInteger(v.minimum_visits)||Number(v.minimum_visits)<1||Number(v.minimum_visits)>20||!Array.isArray(v.service_ids)||v.service_ids.length>100
  ||v.service_ids.some(id=>typeof id!=='string'||!uuid.test(id))||new Set(v.service_ids).size!==v.service_ids.length)throw Error('REBOOKING_INVALID');
 return v as unknown as Pick<RebookingSettings,'revision'|'enabled'|'absence_days'|'minimum_visits'|'service_ids'>&{reviewed:boolean};
}
