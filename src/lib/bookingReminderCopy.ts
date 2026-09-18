import { salonTimeZone } from "@/lib/dateTime";

// Published Engine translations take priority; these built-in transactional
// defaults keep a missing translation from changing the customer's language.
const copy = {
  en: {title:"Appointment reminder",body:"Appointment reminder.\n\n{{summary}}\n\nView your booking: {{account_url}}",teamBody:"Appointment reminder.\n\n{{summary}}\n\nOpen booking: {{dashboard_url}}",customer:"Reminder: {{service}} at {{salon}} is scheduled for {{when}}{{stylist_clause}}.",team:"Reminder: {{customer}} — {{service}} is scheduled for {{when}}{{stylist_clause}}.",with:" with "},
  fr: {title:"Rappel de rendez-vous",body:"Rappel de rendez-vous.\n\n{{summary}}\n\nConsulter votre réservation : {{account_url}}",teamBody:"Rappel de rendez-vous.\n\n{{summary}}\n\nOuvrir la réservation : {{dashboard_url}}",customer:"Rappel : {{service}} chez {{salon}} est prévu le {{when}}{{stylist_clause}}.",team:"Rappel : {{customer}} — {{service}} est prévu le {{when}}{{stylist_clause}}.",with:" avec "},
  es: {title:"Recordatorio de cita",body:"Recordatorio de cita.\n\n{{summary}}\n\nVer tu reserva: {{account_url}}",teamBody:"Recordatorio de cita.\n\n{{summary}}\n\nAbrir la reserva: {{dashboard_url}}",customer:"Recordatorio: {{service}} en {{salon}} está programado para el {{when}}{{stylist_clause}}.",team:"Recordatorio: {{customer}} — {{service}} está programado para el {{when}}{{stylist_clause}}.",with:" con "},
  "zh-CN": {title:"预约提醒",body:"预约提醒。\n\n{{summary}}\n\n查看您的预约：{{account_url}}",teamBody:"预约提醒。\n\n{{summary}}\n\n打开预约：{{dashboard_url}}",customer:"提醒：您在 {{salon}} 的 {{service}} 预约时间为 {{when}}{{stylist_clause}}。",team:"提醒：{{customer}} 的 {{service}} 预约时间为 {{when}}{{stylist_clause}}。",with:"，服务人员："},
};
function reminderLocale(locale:string):keyof typeof copy {return locale==="fr"||locale==="es"?locale:locale==="zh"||locale==="zh-CN"?"zh-CN":"en";}
export function reminderStylistClause(locale:string,name?:string){return name?`${copy[reminderLocale(locale)].with}${name}`:"";}
export function reminderDate(value:string,timeZone:unknown,locale:string){return new Intl.DateTimeFormat(reminderLocale(locale),{timeZone:salonTimeZone(timeZone),dateStyle:"full",timeStyle:"short"}).format(new Date(value));}
export function reminderTranslation(locale:string,key:string):string|undefined {
  const match=/^notification\.booking\.(customer|salon|stylist)_reminder\.(subject|body|summary|sms|push_title)$/.exec(key);
  if(!match)return undefined;
  const c=copy[reminderLocale(locale)];
  switch(match[2]){
    case "subject": case "push_title": return c.title;
    case "summary": return match[1]==="customer"?c.customer:c.team;
    case "body": return match[1]==="customer"?c.body:match[1]==="salon"?c.teamBody:"{{summary}}";
    case "sms": return "Girlz Culture: {{summary}}";
  }
}
