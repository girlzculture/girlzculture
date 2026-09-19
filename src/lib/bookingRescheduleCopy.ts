/** Transactional appointment facts keep their original business names and values. */
const copy = {
 en: {title:"Your business proposed an appointment change",current:"Current appointment:",originalMessage:"Original business message",unchanged:"Your appointment stays unchanged until you accept. Price and deposit stay the same. You can decline this proposal.",expires:"Reply before:",review:"Review appointment options"},
 fr: {title:"Votre établissement propose de modifier votre rendez-vous",current:"Rendez-vous actuel :",originalMessage:"Message original de l’établissement",unchanged:"Votre rendez-vous reste inchangé jusqu’à votre acceptation. Le prix et l’acompte restent identiques. Vous pouvez refuser cette proposition.",expires:"Répondez avant le :",review:"Examiner les options du rendez-vous"},
 es: {title:"Tu negocio propone un cambio en tu cita",current:"Cita actual:",originalMessage:"Mensaje original del negocio",unchanged:"Tu cita no cambia hasta que aceptes. El precio y el depósito no cambian. Puedes rechazar esta propuesta.",expires:"Responde antes de:",review:"Revisar las opciones de la cita"},
 'zh-CN': {title:"商家提出预约变更建议",current:"当前预约：",originalMessage:"商家原始留言",unchanged:"在您接受前，预约保持不变。价格和定金保持不变。您可以拒绝此建议。",expires:"请在此时间前回复：",review:"查看预约选项"},
};
export function rescheduleCopy(requested: string) {
 const locale = requested === 'zh' || requested === 'zh-CN' ? 'zh-CN' : requested === 'fr' || requested === 'es' ? requested : 'en';
 return {locale,...copy[locale]};
}
