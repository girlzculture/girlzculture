/** Reserved sample contacts are never sent to an external delivery provider. */
export function isSampleEmail(value:string){return /@[a-z0-9.-]+\.invalid$/i.test(value.trim());}
export function isSamplePhone(value:string){return /^1?[2-9]\d{2}55501\d{2}$/.test(value.replace(/\D/g,''));}
export function demoExternalActionResponse(business:{is_demo?:unknown}){
 return business.is_demo===true?Response.json({code:'DEMO_EXTERNAL_ACTION_DISABLED',error:'This is a private sample business. Real payments, invitations and external connections are disabled.'},{status:409,headers:{'Cache-Control':'private, no-store'}}):null;
}
