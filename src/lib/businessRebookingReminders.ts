export type RebookingSettings={salon_id:string;revision:number;enabled:boolean;effective_enabled:boolean;absence_days:number;minimum_visits:number;service_ids:string[];plan:string|null;automatic:boolean;segmented:boolean;is_demo:boolean;email_available:boolean;services:{id:string;name:string}[];attempts:{status:'processing'|'accepted'|'uncertain';attempted_at:string;support_reference:string|null}[]};
export const REBOOKING_COPY={
 en:{title:'Ready for your next visit?',body:'When you are ready, see the available appointments and book your next visit.',book:'View appointments',unsubscribe:'Unsubscribe from business updates',reason:'You chose to receive updates from this business.'},
 fr:{title:'Prêt pour votre prochaine visite ?',body:'Quand vous le souhaitez, consultez les disponibilités et réservez votre prochaine visite.',book:'Voir les rendez-vous',unsubscribe:'Ne plus recevoir les actualités de cet établissement',reason:'Vous avez choisi de recevoir les actualités de cet établissement.'},
 es:{title:'¿Listo para tu próxima visita?',body:'Cuando quieras, consulta los horarios disponibles y reserva tu próxima visita.',book:'Ver citas',unsubscribe:'Dejar de recibir novedades de este negocio',reason:'Elegiste recibir novedades de este negocio.'},
 'zh-CN':{title:'准备好再次到店了吗？',body:'欢迎在方便的时候查看可预约时间并安排下次到店。',book:'查看预约时间',unsubscribe:'取消订阅这家商户的消息',reason:'您选择了接收这家商户的消息。'},
} as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function rebookingSettingsInput(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('REBOOKING_INVALID');const v=input as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='absence_days,enabled,minimum_visits,reviewed,revision,service_ids'||typeof v.enabled!=='boolean'||typeof v.reviewed!=='boolean'
  ||!Number.isSafeInteger(v.revision)||Number(v.revision)<0||!Number.isInteger(v.absence_days)||Number(v.absence_days)<30||Number(v.absence_days)>180
  ||!Number.isInteger(v.minimum_visits)||Number(v.minimum_visits)<1||Number(v.minimum_visits)>20||!Array.isArray(v.service_ids)||v.service_ids.length>100
  ||v.service_ids.some(id=>typeof id!=='string'||!uuid.test(id))||new Set(v.service_ids).size!==v.service_ids.length)throw Error('REBOOKING_INVALID');
 return v as unknown as Pick<RebookingSettings,'revision'|'enabled'|'absence_days'|'minimum_visits'|'service_ids'>&{reviewed:boolean};
}
