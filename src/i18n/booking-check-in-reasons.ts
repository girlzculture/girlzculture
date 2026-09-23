const reasons:Record<string,readonly [string,string,string,string]>={
 customer_arrived_early:['Customer arrived early','Le client est arrivé en avance','El cliente llegó temprano','客户提前到店'],
 customer_requested_earlier_by_phone:['Earlier time requested by phone','Horaire avancé demandé par téléphone','Horario anterior solicitado por teléfono','客户通过电话要求提前'],
 customer_requested_earlier_by_message:['Earlier time requested by message','Horaire avancé demandé par message','Horario anterior solicitado por mensaje','客户通过消息要求提前'],
 salon_and_customer_agreed_earlier:['Business and client agreed to start earlier','L’entreprise et le client ont convenu de commencer plus tôt','El negocio y el cliente acordaron empezar antes','商家与客户同意提前开始'],
 customer_arrived_as_walk_in:['Client arrived without an appointment','Le client est venu sans rendez-vous','El cliente llegó sin cita','客户未预约到店'],
 appointment_changed_outside_platform:['Appointment changed outside the platform','Rendez-vous modifié hors plateforme','Cita modificada fuera de la plataforma','预约在平台外更改'],
 customer_arrived_late:['Customer arrived late','Le client est arrivé en retard','El cliente llegó tarde','客户迟到'],
 salon_running_behind:['Business running behind schedule','L’entreprise a pris du retard','El negocio lleva retraso','商家服务延误'],
 salon_and_customer_agreed_later:['Business and client agreed to start later','L’entreprise et le client ont convenu de commencer plus tard','El negocio y el cliente acordaron empezar más tarde','商家与客户同意推迟开始'],
 service_completed_check_in_not_recorded:['Service completed; arrival was not recorded','Prestation terminée ; arrivée non enregistrée','Servicio completado; llegada no registrada','服务已完成，未记录签到'],
 technical_problem:['Technical problem','Problème technique','Problema técnico','技术问题'],
 staff_forgot_check_in:['Team forgot to record arrival','L’équipe a oublié d’enregistrer l’arrivée','El equipo olvidó registrar la llegada','团队忘记记录签到'],
 other:['Other','Autre','Otro','其他'],
};
export function bookingCheckInReason(code:string,locale:string){return reasons[code]?.[locale==='fr'?1:locale==='es'?2:locale==='zh-CN'?3:0]||code;}
