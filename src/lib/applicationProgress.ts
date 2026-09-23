import { parseApplicationPlan, isSoloPlan } from "@/lib/plans";
import { SUPPORTED_LOCALES } from "@/i18n/catalog";
import type {ApplicationInterview,InterviewKey} from '@/lib/applicationInterview';

export const APPLICATION_TOPICS = ["How you work", "About you", "Location", "Services", "Licenses & documents", "Your plan", "Review & submit"] as const;
export const INITIAL_APPLICATION_FIELDS = {
 business_name:"", owner_name:"", business_email:"", phone:"", street_address:"", address_line2:"", city:"", state:"NY", zip_code:"", business_type:"Hair Salon", business_setup_type:"", years_in_operation:"", stylist_count:"", website_url:"", instagram_url:"", business_license_number:"", cosmetology_license_number:"", referral_source:"",
 operator_type:"", location_type:"", home_address_public:"false", offers_mobile:"false", host_business_name:"", public_neighborhood:"", travel_radius_miles:"", travel_fee:"", services_offered:"", price_range:"", insurance:"", location_count:"1", hours_later:"true", working_hours:"",
};
export type ApplicationFields = typeof INITIAL_APPLICATION_FIELDS;
export class ApplicationProgressError extends Error {
 constructor(public code: string, message: string) { super(message); }
}
const invalid = (message: string): never => { throw new ApplicationProgressError("APPLICATION_INVALID", message); };
export function applicationProgressInput(input: unknown) {
 if (!input || typeof input !== "object" || Array.isArray(input)) return invalid("The application draft is invalid.");
 const body=input as Record<string,unknown>;
 if (Object.keys(body).some(key=>!["fields","documents","plan","locale","step","revision","entry_mode","assistant"].includes(key))) return invalid("Unexpected application draft fields.");
 if (!body.fields || typeof body.fields!=="object" || Array.isArray(body.fields)) return invalid("Application fields are required.");
 const fields={...INITIAL_APPLICATION_FIELDS};
 for (const [key,value] of Object.entries(body.fields)) {
  if (!Object.hasOwn(fields,key) || typeof value!=="string" || value.length>2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return invalid("A draft field is invalid or too long.");
  fields[key as keyof ApplicationFields]=value;
 }
 if (JSON.stringify(fields).length>18000) return invalid("The application draft is too large.");
 if (!Array.isArray(body.documents) || body.documents.length>5 || body.documents.some(path=>typeof path!=="string" || path.length>500 || path.includes(".."))) return invalid("Supporting documents are invalid.");
 const plan=body.plan===null?null:parseApplicationPlan(body.plan);
 if (body.plan!==null && !plan) return invalid("Choose an available plan.");
 if (!SUPPORTED_LOCALES.some(locale=>locale===body.locale)) return invalid("Choose an available language.");
 if (!Number.isInteger(body.step) || Number(body.step)<0 || Number(body.step)>=APPLICATION_TOPICS.length) return invalid("Application topic is invalid.");
 if (body.revision!==null && (!Number.isSafeInteger(body.revision)||Number(body.revision)<1)) return invalid("Draft revision is invalid.");
 if (!["form","conversation"].includes(String(body.entry_mode))) return invalid("Application entry mode is invalid.");
 let assistant:ApplicationInterview|undefined;
 if(body.assistant!==undefined){
  if(!body.assistant||typeof body.assistant!=='object'||Array.isArray(body.assistant))return invalid('Application conversation is invalid.');
  const a=body.assistant as Record<string,unknown>;
  if(Object.keys(a).some(k=>!['answered','turns','failed_message'].includes(k))||!Array.isArray(a.answered)||a.answered.length>50||a.answered.some(k=>typeof k!=='string'||![...Object.keys(fields),'documents','plan'].includes(k))||!Array.isArray(a.turns)||a.turns.length>256)return invalid('Application conversation is invalid.');
  if(a.failed_message!==undefined&&(typeof a.failed_message!=='string'||a.failed_message.length>2000))return invalid('Application conversation is invalid.');
  const turns=a.turns.map(raw=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))return invalid('Application conversation is invalid.');const item=raw as Record<string,unknown>;if(Object.keys(item).some(k=>!['role','text'].includes(k))||!['user','assistant'].includes(String(item.role))||typeof item.text!=='string'||item.text.length>2000)return invalid('Application conversation is invalid.');return {role:item.role as 'user'|'assistant',text:item.text};});
  assistant={answered:[...new Set(a.answered)] as InterviewKey[],turns,...(typeof a.failed_message==='string'?{failed_message:a.failed_message}:{})};
 }
 const payload={fields, documents:body.documents as string[], plan, locale:String(body.locale), step:Number(body.step), revision:body.revision as number|null, entry_mode:body.entry_mode as "form"|"conversation",...(assistant?{assistant}:{})};
 if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>60000)return invalid('The application draft is too large.');
 return payload;
}
export function applicationSetup(fields: ApplicationFields) {
 if(fields.operator_type==='multi')return 'multi_location';
 if(fields.operator_type==='team')return 'single_location_staffed';
 if(fields.operator_type==='solo')return fields.location_type==='chair_suite'?'shared_suite_booth':fields.location_type==='mobile'?'mobile_on_location':'solo_professional';
 return '';
}
export function validateApplicationDetails(fields: ApplicationFields, plan: unknown) {
 if(!['solo','team','multi'].includes(fields.operator_type))return invalid('Choose how you work.');
 if(!parseApplicationPlan(plan) || isSoloPlan(plan)!==(fields.operator_type==='solo'))return invalid('Choose a plan for your business setup.');
 if(!['storefront','chair_suite','home','mobile'].includes(fields.location_type))return invalid('Choose where you work.');
 if(!fields.services_offered.trim()||!fields.price_range.trim())return invalid('Add your services and usual price range.');
 if(!['yes','no'].includes(fields.insurance))return invalid('Tell us whether you currently have insurance.');
 if(fields.location_type==='chair_suite'&&!fields.host_business_name.trim())return invalid('Enter the host business name.');
 const mobile=fields.location_type==='mobile'||fields.offers_mobile==='true';
 const radius=Number(fields.travel_radius_miles),fee=Number(fields.travel_fee);
 if(mobile&&(!fields.travel_radius_miles||!Number.isFinite(radius)||radius<1||radius>100||!fields.travel_fee||!Number.isFinite(fee)||fee<0||fee>1000))return invalid('Enter a travel radius from 1 to 100 miles and a travel fee from $0 to $1,000.');
 if(fields.location_type==='home'&&fields.home_address_public!=='true'&&!fields.public_neighborhood.trim())return invalid('Enter your public neighborhood. Your street address stays private.');
 if(!['true','false'].includes(fields.home_address_public)||!['true','false'].includes(fields.offers_mobile))return invalid('Choose your address privacy and travel settings.');
 if(fields.operator_type==='multi'&&(!Number.isInteger(Number(fields.location_count))||Number(fields.location_count)<2||Number(fields.location_count)>500))return invalid('Enter a location count from 2 to 500.');
 if(!['true','false'].includes(fields.hours_later)||(fields.hours_later==='false'&&!fields.working_hours.trim()))return invalid('Add your business hours or choose to set them up later.');
 return { operator_type:fields.operator_type, location_type:fields.location_type, home_address_public:fields.home_address_public==='true', offers_mobile:mobile, host_business_name:fields.host_business_name.trim(), public_neighborhood:fields.public_neighborhood.trim(), travel_radius_miles:mobile?radius:null, travel_fee_cents:mobile?Math.round(fee*100):0, services_offered:fields.services_offered.trim(), price_range:fields.price_range.trim(), insurance:fields.insurance, location_count:fields.operator_type==='multi'?Number(fields.location_count):1, working_hours:fields.hours_later==='true'?null:fields.working_hours.trim() };
}
