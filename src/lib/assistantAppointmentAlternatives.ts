export type AppointmentAlternative={start:string;time_zone:string;professional_name:string|null;service_name:string;duration_minutes:number;buffer_minutes:number};
/** Only this bounded data shape may accompany an availability error. Provider
 * bodies and arbitrary error details never become interface content. */
export function parseAppointmentAlternatives(value:unknown):AppointmentAlternative[]{
 if(!Array.isArray(value)||value.length>3)return [];
 const result:AppointmentAlternative[]=[];
 for(const item of value){
  if(!item||typeof item!=='object'||Array.isArray(item))return [];
  const row=item as Record<string,unknown>;
  if(Object.keys(row).some(k=>!['start','time_zone','professional_name','service_name','duration_minutes','buffer_minutes'].includes(k)))return [];
  if(typeof row.start!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.start)||!Number.isFinite(Date.parse(row.start)))return [];
  if(typeof row.time_zone!=='string'||row.time_zone.length>80)return [];
  try{new Intl.DateTimeFormat('en',{timeZone:row.time_zone});}catch{return [];}
  if(row.professional_name!==null&&(typeof row.professional_name!=='string'||row.professional_name.length>160))return [];
  if(typeof row.service_name!=='string'||row.service_name.length>160)return [];
  if(!Number.isInteger(row.duration_minutes)||Number(row.duration_minutes)<15||Number(row.duration_minutes)>1440||!Number.isInteger(row.buffer_minutes)||Number(row.buffer_minutes)<0||Number(row.buffer_minutes)>180)return [];
  result.push(row as AppointmentAlternative);
 }
 return result;
}
