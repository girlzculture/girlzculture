import 'server-only';
import type {requireSalonOwner} from '@/lib/supabaseAdmin';
import {AssistantError} from '@/lib/gcAssistantCore';
import {matchProfessionalNames} from '@/lib/businessCatalogSearch';
type Context=Awaited<ReturnType<typeof requireSalonOwner>>;
type Row=Record<string,unknown>;
const unavailable=()=>new AssistantError('ASSISTANT_SERVICE_UNAVAILABLE',503);
const fields='id,salon_id,name,bio,specialties,years_experience,is_active,is_draft,availability';
export async function readAssistantProfessionals(context:Context,args:Row){
 const {admin,salon,user}=context;
 async function permission(name:string){
  const r=await admin.rpc('p0_actor_has_permission',{p_salon:salon.id,p_user:user.id,p_permission:name});
  if(r.error)throw unavailable();return r.data===true;
 }
 if(!await permission('stylists'))throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);
 if(typeof args.query!=='string'||args.query.length>120)throw new AssistantError('ASSISTANT_INVALID_INPUT');
 const query=args.query.trim(),canReadAssignments=await permission('styles');
 const scoped=()=>admin.from('stylists').select(fields+(canReadAssignments?',assigned_service_ids':''),{count:'exact'}).eq('salon_id',salon.id).is('archived_at',null);
 const [inventory,literal]=await Promise.all([scoped().order('name').order('id').limit(1000),query?scoped().ilike('name',`%${query.replace(/[\\%_]/g,c=>'\\'+c)}%`).order('name').order('id').limit(100):Promise.resolve({data:[],count:0,error:null})]);
 function ownRows(read:{data:unknown;count:number|null;error:unknown},cap:number){
  if(read.error||!Array.isArray(read.data)||!Number.isSafeInteger(read.count)||read.count!<read.data.length||read.data.length>cap)throw unavailable();
  const rows=read.data as Row[];
  if(rows.some(row=>!row||row.salon_id!==salon.id||typeof row.id!=='string'||!row.id)||new Set(rows.map(row=>row.id)).size!==rows.length)throw unavailable();
  return rows;
 }
 const catalog=ownRows(inventory,1000),direct=ownRows(literal,100);
 const records=new Map([...catalog,...direct].map(row=>[row.id,row]));
 const matches=matchProfessionalNames([...records.values()],query),complete=inventory.count===catalog.length;
 const selected=matches.slice(0,100).map(({record})=>Object.fromEntries(fields.split(',').filter(key=>key!=='salon_id').map(key=>[key,record[key]??null])));
 let serviceFacts={};
 if(canReadAssignments){
  const read=await admin.from('styles').select('id,salon_id,name,is_draft',{count:'exact'}).eq('salon_id',salon.id).is('archived_at',null).order('name').order('id').limit(1000);
  const services=ownRows(read,1000),ids=new Set(services.map(row=>row.id));
  if(!await permission('styles'))throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);
  selected.forEach((row,index)=>{const assignments=matches[index].record.assigned_service_ids;row.assigned_service_ids=assignments==null?null:Array.isArray(assignments)?assignments.filter(id=>ids.has(id)):[];});
  serviceFacts={service_dictionary:services.map(({id,name,is_draft})=>({id,name,is_draft})),services_total:read.count,services_capped_at:1000,
   assignment_definition:'Null assignments offer all current and future services; an empty array offers none. IDs are filtered to this business’s service dictionary. A capped dictionary does not prove absence. Draft services are not bookable.'};
 }
 if(!await permission('stylists'))throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);
 return {professionals:selected,total:query?matches.length:inventory.count,inventory_total:inventory.count,matching_total:query?matches.length:inventory.count,query,search_complete:complete,
  match_status:inventory.count===0?'empty_inventory':!query?'inventory':matches.length?'candidates':complete?'no_match':'incomplete_search',capped_at:100,
  matching_definition:'Original own-business names and IDs. Multiple candidates require clarification; a capped search can be incomplete. No record was changed.',...serviceFacts};
}
