export const SERVICE_CAPACITY_COPY_ROWS = [
 ["Check openings for this service", "Vérifier les créneaux de cette prestation", "Comprobar horarios para este servicio", "查看此服务的可用时段"],
 ["Service openings", "Créneaux de la prestation", "Horarios del servicio", "服务可用时段"],
 ["First date", "Première date", "Fecha inicial", "开始日期"],
 ["Check next seven days", "Vérifier les sept prochains jours", "Comprobar los próximos siete días", "查看后续七天"],
 ["Checking openings…", "Vérification des créneaux…", "Comprobando horarios…", "正在检查可用时段…"],
 ["Choose the required service options, then check again.", "Choisissez les options obligatoires, puis relancez la vérification.", "Elige las opciones obligatorias y vuelve a comprobar.", "请选择必需的服务选项，然后重新检查。"],
 ["Service choices changed. Review the saved service before continuing.", "Les options ont changé. Consultez la prestation enregistrée avant de continuer.", "Las opciones han cambiado. Revisa el servicio guardado antes de continuar.", "服务选项已变更。请先查看已保存的服务。"],
 ["Choose an option", "Choisir une option", "Elige una opción", "选择选项"],
 ["Required", "Obligatoire", "Obligatorio", "必选"],
 ["Service openings could not be verified. Refresh the current records and try again.", "Les créneaux n’ont pas pu être vérifiés. Actualisez les données et réessayez.", "No se pudieron verificar los horarios. Actualiza los registros e inténtalo de nuevo.", "无法验证可用时段。请刷新当前记录后重试。"],
 ["Cost evidence changed. Refresh the contribution review first.", "Les coûts ont changé. Actualisez d’abord la contribution.", "Los costes cambiaron. Actualiza primero la revisión de contribución.", "成本记录已变更。请先刷新贡献额审核。"],
 ["Support reference", "Référence d’assistance", "Referencia de soporte", "客服参考编号"],
 ["{from} to {to} · {zone}", "Du {from} au {to} · {zone}", "{from} a {to} · {zone}", "{from}至{to} · {zone}"],
 ["{duration} minutes plus {buffer} minutes of buffer.", "{duration} minutes et {buffer} minutes de marge.", "{duration} minutos más {buffer} minutos de margen.", "服务{duration}分钟，另加{buffer}分钟缓冲。"],
 ["Uses the longest saved duration for this service range.", "Utilise la durée maximale enregistrée pour cette prestation.", "Usa la duración máxima guardada de este servicio.", "使用此服务已保存时长范围中的最长时长。"],
 ["{total} start-time alternatives; showing {shown}.", "{total} possibilités de départ ; {shown} affichées.", "{total} opciones de inicio; se muestran {shown}.", "共{total}个可选开始时间，显示{shown}个。"],
 ["Start times overlap; this is not a count of extra appointments. No time is reserved. Booking checks customer eligibility and availability again.", "Les créneaux se chevauchent ; ce n’est pas un nombre de rendez-vous supplémentaires. Rien n’est réservé. La réservation vérifie à nouveau l’éligibilité et la disponibilité.", "Los horarios se solapan; no representan citas adicionales. No hay ninguna reserva. Al reservar se vuelven a comprobar la disponibilidad y los requisitos del cliente.", "这些开始时间可能重叠，不代表可增加的预约数量。尚未预留时段。预约时会再次检查顾客资格和可用性。"],
 ["No current bookable starts were found for this selection.", "Aucun départ réservable trouvé pour cette sélection.", "No se encontraron horarios reservables para esta selección.", "此选择目前没有可预约的开始时间。"],
 ["This future calendar check is separate from the historical contribution period. Positive recorded contribution does not prove demand or net profit.", "Cette vérification future est distincte de la période de contribution passée. Une contribution positive ne prouve ni la demande ni le bénéfice net.", "Esta consulta del calendario futuro es independiente del periodo histórico de contribución. La contribución positiva no demuestra demanda ni beneficio neto.", "此次未来日历查询与历史贡献额期间分开。记录贡献额为正并不能证明需求或净利润。"],
 ["Review calendar", "Consulter le calendrier", "Revisar calendario", "查看日历"],
 ["Any available professional", "Professionnel disponible", "Profesional disponible", "任一可用专业人员"],
 ["Close openings", "Fermer les créneaux", "Cerrar horarios", "关闭可用时段"],
] as const;
export function serviceCapacityCopy(locale: string, source: string, values: Record<string, string> = {}) {
 const row = SERVICE_CAPACITY_COPY_ROWS.find(item => item[0] === source), index = locale === "fr" ? 1 : locale === "es" ? 2 : locale === "zh-CN" ? 3 : 0;
 return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), row?.[index] || source);
}
