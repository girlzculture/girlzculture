export function assistantWaitlistCopy(locale:string){
 const i=locale==='fr'?1:locale==='es'?2:locale==='zh-CN'?3:0;
 return {
  title:['Review waitlist offer','Vérifier l’offre de liste d’attente','Revisar oferta de lista de espera','审核候补邀请'][i],
  read:['Showing {count} waitlist requests.','{count} demandes sur liste d’attente affichées.','Mostrando {count} solicitudes en lista de espera.','显示 {count} 条候补请求。'][i],
  notice:['Confirmation queues this offer notification. The customer must accept and complete checkout; no appointment or charge is created here.','La confirmation programme cette notification. Le client doit accepter et terminer sa réservation ; aucun rendez-vous ni prélèvement n’est créé ici.','La confirmación programa esta notificación. El cliente debe aceptar y finalizar la reserva; aquí no se crea una cita ni se realiza un cargo.','确认后将排队发送此邀请通知。客户须接受并完成预约流程；此处不会创建预约或扣款。'][i],
  customer:['Customer','Client','Cliente','客户'][i],service:['Service','Service','Servicio','服务'][i],professional:['Professional','Professionnel','Profesional','专业人员'][i],time:['Appointment time','Horaire du rendez-vous','Hora de la cita','预约时间'][i],notification:['Notification in the customer’s language','Notification dans la langue du client','Notificación en el idioma del cliente','以客户语言发送的通知'][i],
 };
}
