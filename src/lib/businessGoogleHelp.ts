export type GoogleHelp={salon_id:string;level:'guide'|'assisted'|'review';is_demo:boolean;fingerprint:string;fields:{name:string;phone:string|null;description:string|null;address:string|null;location_type:string|null;mobile:boolean;area:string|null;radius_miles:number|null;hours:Record<string,unknown>|null;page:string}|null;review:Record<'name'|'phone'|'description'|'hours'|'public_page'|'privacy_review_required',boolean>|null;requests:{id:string;kind:'assisted_setup'|'profile_review';status:string;created_at:string}[]};
export const GOOGLE_HELP_GUIDES=[
 {label:'Start or claim your own Google Business Profile',href:'https://support.google.com/business/answer/7039811'},
 {label:'Check eligibility, your real business name and categories',href:'https://support.google.com/business/answer/3038177'},
 {label:'Review public address and service-area rules',href:'https://support.google.com/business/answer/9157481'},
] as const;
