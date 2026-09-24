import type {ApplicationFields} from '@/lib/applicationProgress';
import {isValidEmail,isValidUsPhone} from '@/lib/validation';
import {isValidUsZip,normalizeUsState} from '@/lib/usStates';
import {PLAN_ORDER,isSoloPlan,type SubscriptionPlan} from '@/lib/plans';
export type InterviewKey=keyof ApplicationFields|'documents'|'plan';
export type InterviewTurn={role:'user'|'assistant';text:string};
export type ApplicationInterview={answered:InterviewKey[];turns:InterviewTurn[];failed_message?:string};
export const emptyInterview=():ApplicationInterview=>({answered:[],turns:[]});
type Question={key:InterviewKey;label:string;optional?:boolean;choices?:[string,string][]};
export function applicationQuestions(f:ApplicationFields):Question[]{
 const solo=f.operator_type==='solo',mobile=f.location_type==='mobile'||f.offers_mobile==='true';
 const yesNo:[string,string][]=[['true','Yes'],['false','No']];
 return [
  {key:'operator_type',label:'How do you work?',choices:[['solo','I work on my own'],['team','I run a business with a team'],['multi','I manage multiple locations']]},
  {key:'owner_name',label:'Your full name'},{key:'business_name',label:'Business Name'},
  {key:'business_email',label:'Business Email'},{key:'phone',label:'Phone Number'},
  ...(!solo?[{key:'stylist_count',label:'Number of professionals'} as Question]:[{key:'years_in_operation',label:'Years of experience'} as Question]),
  ...(f.operator_type==='multi'?[{key:'location_count',label:'Number of locations'} as Question]:[]),
  {key:'location_type',label:'Where do you work?',choices:[['storefront','Storefront'],['chair_suite','Rented chair or suite'],['home','Home studio'],['mobile','Mobile / at the client’s location']]},
  ...(f.location_type==='chair_suite'?[{key:'host_business_name',label:'Host business name'} as Question]:[]),
  {key:'street_address',label:'Verification street address'},{key:'address_line2',label:'Apartment, suite or floor',optional:true},
  {key:'city',label:'City'},{key:'state',label:'State'},{key:'zip_code',label:'ZIP Code'},
  ...(f.location_type==='home'?[{key:'home_address_public',label:'Show my home street address publicly',choices:yesNo},{key:'public_neighborhood',label:'Public neighborhood'}] as Question[]:[]),
  ...(f.location_type!=='mobile'?[{key:'offers_mobile',label:'I also travel to clients',choices:yesNo} as Question]:[]),
  ...(mobile?[{key:'travel_radius_miles',label:'Travel radius (miles)'},{key:'travel_fee',label:'Travel fee ($)'}] as Question[]:[]),
  {key:'services_offered',label:'Services you offer'},{key:'price_range',label:'Usual price range'},
  ...(!solo?[{key:'hours_later',label:'Set up business hours later',choices:yesNo},...(f.hours_later==='false'?[{key:'working_hours',label:'Business hours'} as Question]:[])] as Question[]:[]),
  {key:'insurance',label:'Do you currently have insurance?',choices:[['yes','Yes'],['no','No']]},
  {key:'documents',label:'Licenses & supporting documents',optional:true},
  {key:'website_url',label:'Website',optional:true},{key:'instagram_url',label:'Instagram',optional:true},
  {key:'plan',label:'Your plan',choices:PLAN_ORDER.filter(p=>isSoloPlan(p)===solo).map(p=>[p,p])},
 ];
}
export function currentApplicationQuestion(f:ApplicationFields,state:ApplicationInterview){return applicationQuestions(f).find(q=>!state.answered.includes(q.key))||null;}
export function validateInterviewAnswer(q:Question,raw:string):string {
 const value=raw.trim();if(value.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))throw new Error('Keep your answer under 2,000 characters.');
 if(!value&&!q.optional)throw new Error('Add an answer before continuing.');
 if(q.choices&&!q.choices.some(([key])=>key===value))throw new Error('Choose one of the available answers.');
 if(q.key==='business_email'&&!isValidEmail(value))throw new Error('Enter a valid email address.');
 if(q.key==='phone'&&!isValidUsPhone(value))throw new Error('Enter a valid US phone number.');
 if(q.key==='zip_code'&&!isValidUsZip(value))throw new Error('Enter a valid ZIP code.');
 if(q.key==='state')return normalizeUsState(value);
 if(['stylist_count','location_count','years_in_operation','travel_radius_miles','travel_fee'].includes(q.key)){
  const n=Number(value),min=q.key==='location_count'?2:['stylist_count','travel_radius_miles'].includes(q.key)?1:0,max=q.key==='travel_fee'?1000:q.key==='stylist_count'||q.key==='location_count'?500:q.key==='years_in_operation'?150:100;
  if(!value||!Number.isFinite(n)||n<min||n>max||(['stylist_count','location_count'].includes(q.key)&&!Number.isInteger(n)))throw new Error('Enter a valid number for this question.');
 }
 if(value&&['website_url','instagram_url'].includes(q.key)){try{const url=new URL(value);if(url.protocol!=='https:')throw new Error();}catch{throw new Error('Enter a full https:// link or skip this question.');}}
 return value;
}
export function capturedInterviewValue(fields:ApplicationFields,plan:SubscriptionPlan|null,key:InterviewKey,documents:string[]){return key==='plan'?plan||'':key==='documents'?String(documents.length):fields[key];}
export const APPLICATION_HELP_TOPICS=['address','privacy','pricing','documents','verification','platform','unclear','off_topic','capture'] as const;
export type ApplicationHelpTopic=typeof APPLICATION_HELP_TOPICS[number];
export const APPLICATION_HELP:Record<Exclude<ApplicationHelpTopic,'capture'>,string>={
 address:'We need a real address to verify where you work. A private home address is shared only with confirmed customers; a mobile verification address is never public.',
 privacy:'Your application and documents are private. You choose whether your home street address is public. You can review every answer before submitting.',
 pricing:'Solo is $69/month and Solo Pro is $99/month. Team plans are Starter $99, Growth $149 and Premium $199/month. No payment is taken with the application. Billing availability is confirmed before activation.',
 documents:'Upload a clear JPG, PNG or PDF of your license or supporting document, up to 10 MB each. Our team checks the requirements for your services and location. You can ask support if you are unsure.',
 verification:'Our team reviews identity, licensing and business details. Independent professionals also need an in-person location visit before approval. The application does not guarantee approval.',
 platform:'Girlz Culture helps beauty businesses manage bookings, services, products and clients. Hair & Braiding applications are open; other categories have a waitlist. Each plan includes the GC AI Assistant.',
 unclear:'I do not want to guess. You can edit this answer in the form or ask our team for help.',
 off_topic:'I can help with your Girlz Culture application and questions about joining. For other requests, please contact the right service directly.',
};
