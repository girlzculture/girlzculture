import {professionalOffersService} from "@/lib/professionalServices";
import {AssistantError} from "@/lib/gcAssistantCore";
import type {AppointmentAlternative} from "@/lib/assistantAppointmentAlternatives";
type Row=Record<string,unknown>;
type Candidate={service:Row|null;duration:number;buffer:number};
type Gap={start:string;end:string;stylist_id:string|null};
export class AssistantAvailabilityConflict extends AssistantError {
  constructor(public alternatives:AppointmentAlternative[]){super("ASSISTANT_AVAILABILITY_CONFLICT",409);}
}

/** Inputs come from fresh, own-business catalog/roster/calendar reads. This
 * chooses a service only when explicitly permitted and never moves the time. */
export function selectAssistantAppointment(input:{start:number;candidates:Candidate[];roster:Row[];professional:string|null;gaps:Gap[];timeZone:string;customServiceName:string}){
  const resources=input.roster.length?input.roster:[{id:null,name:null}];
  const alternatives:AppointmentAlternative[]=[];
  const compare=(a:AppointmentAlternative,b:AppointmentAlternative)=>Math.abs(Date.parse(a.start)-input.start)-Math.abs(Date.parse(b.start)-input.start)||a.start.localeCompare(b.start)||String(a.professional_name).localeCompare(String(b.professional_name));
  for(const candidate of input.candidates){
    if(!Number.isInteger(candidate.duration)||candidate.duration<15||candidate.duration>1440||!Number.isInteger(candidate.buffer)||candidate.buffer<0||candidate.buffer>180)continue;
    const durationMs=(candidate.duration+candidate.buffer)*60000;
    for(const resource of resources){
      const professional=resource.id?String(resource.id):null;
      if(input.professional&&professional!==input.professional)continue;
      if(candidate.service?.id&&!professionalOffersService(resource,String(candidate.service.id)))continue;
      for(const gap of input.gaps){
        if(gap.stylist_id!==professional)continue;
        const left=Date.parse(gap.start),right=Date.parse(gap.end)-durationMs;
        if(!Number.isFinite(left)||!Number.isFinite(right)||right<left)continue;
        if(left<=input.start&&input.start<=right)return {candidate,professional,professionalName:resource.name||null};
        // Offer the nearest whole-minute start inside the genuine free range.
        // These are suggestions only; nothing is prepared or saved at them.
        const earliest=Math.ceil(left/60000)*60000,latest=Math.floor(right/60000)*60000;
        if(latest<earliest)continue;
        const start=Math.max(earliest,Math.min(input.start,latest));
        const option={start:new Date(start).toISOString(),time_zone:input.timeZone,professional_name:typeof resource.name==='string'?resource.name:null,service_name:String(candidate.service?.name||input.customServiceName),duration_minutes:candidate.duration,buffer_minutes:candidate.buffer};
        if(!alternatives.some(row=>JSON.stringify(row)===JSON.stringify(option))){alternatives.push(option);alternatives.sort(compare);if(alternatives.length>3)alternatives.pop();}
      }
    }
  }
  throw new AssistantAvailabilityConflict(alternatives);
}
