const COPY = {
  en: {subject:"Thank you for visiting {{salon}}",body:"Thank you for choosing {{salon}} for {{service}}. We hope to welcome you again.",book:"View services and book again",preferences:"Stop optional messages"},
  fr: {subject:"Merci de votre visite chez {{salon}}",body:"Merci d’avoir choisi {{salon}} pour {{service}}. Au plaisir de vous accueillir à nouveau.",book:"Voir les prestations et réserver à nouveau",preferences:"Arrêter les messages facultatifs"},
  es: {subject:"Gracias por visitar {{salon}}",body:"Gracias por elegir {{salon}} para {{service}}. Esperamos volver a recibirte.",book:"Ver servicios y reservar de nuevo",preferences:"Dejar de recibir mensajes opcionales"},
  "zh-CN": {subject:"感谢您光临{{salon}}",body:"感谢您选择{{salon}}的{{service}}服务。期待再次为您服务。",book:"查看服务并再次预约",preferences:"停止接收可选消息"},
} as const;

export function bookingFollowupCopy(locale:string,salon:string,service:string){
  const copy=COPY[locale as keyof typeof COPY]||COPY.en;
  const substitute=(text:string)=>text.replace(/\{\{(salon|service)\}\}/g,(_,key:string)=>key==="salon"?salon:service);
  return {subject:substitute(copy.subject),body:substitute(copy.body),subjectTemplate:copy.subject,bodyTemplate:copy.body,book:copy.book,preferences:copy.preferences};
}
