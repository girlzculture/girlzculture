import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd()),{ASSISTANT_CATALOG}=load('src/lib/assistantCatalog.ts'),{validateTool}=load('src/lib/gcAssistantCore.ts');
const id='11000000-0000-4000-8000-000000000001',foreign='11000000-0000-4000-8000-000000000002';
const args=(changes,record_id=id)=>({record_id,changes_json:JSON.stringify(changes)});
test('each catalog action has the actual scoped permission and rejects internal or other-business fields',()=>{
 for(const [tool,{permission}]of Object.entries(ASSISTANT_CATALOG)){
  const values=tool==='prepare_promotion_change'?{title:'Sample'}:{name:'Sample'};
  assert.equal(validateTool(tool,args(values)).permission,permission);
  assert.equal(validateTool(tool,args(values)).risk,4);
  for(const patch of [{salon_id:foreign},{user_id:foreign},{stripe_price_id:'invented'},{inventory_quantity:10},{permissions:{all:true}},{table:'salons'},{confirmed:true}])assert.throws(()=>validateTool(tool,args({...values,...patch})),/ASSISTANT_INVALID_INPUT/);
 }
});
test('catalog types and limits reject malformed changes without weakening the old tool schemas',()=>{
 for(const changes of [{price:-1},{price:'10'},{price:null},{is_visible:'true'},{product_status:'Published'},{pickup_prep_minutes:1.5},{name:'a'.repeat(121)},{}])assert.throws(()=>validateTool('prepare_product_change',args(changes)),/ASSISTANT_INVALID_INPUT/);
 assert.throws(()=>validateTool('prepare_product_change',{record_id:id,changes_json:'{'}),/ASSISTANT_INVALID_INPUT/);
 assert.throws(()=>validateTool('prepare_professional_change',args({assigned_service_ids:['not-id']})),/ASSISTANT_INVALID_INPUT/);
 assert.throws(()=>validateTool('prepare_promotion_change',args({target_scope:'another-business'})),/ASSISTANT_INVALID_INPUT/);
});
test('permissions filter all four catalog tools and active tasks permit only their own reads',()=>{
 const protocol=load('src/lib/gcAssistantPlannerProtocol.ts'),{continuesActiveTask}=load('src/lib/assistantActiveTask.ts');
 for(const [tool,{permission}] of Object.entries(ASSISTANT_CATALOG)){
  assert.match(JSON.stringify(protocol.ownerPlannerSchema(new Set([permission]),false)),new RegExp(tool));
  assert.doesNotMatch(JSON.stringify(protocol.ownerPlannerSchema(new Set(['bookings']),false)),new RegExp(tool));
  assert.equal(continuesActiveTask({tool},{task_tool:tool,plan:{tool}}),true);
  assert.equal(continuesActiveTask({tool},{task_tool:'prepare_manual_cancellation',plan:{tool:'prepare_manual_cancellation'}}),false);
 }
});
function fixture({tool='prepare_product_change',salon=id,error=null,moderation='allow',values={name:'Own product',description:'Reviewed',price:25}}={}){
 const calls=[];const ctx={salon:{id},user:{id:'actor'},admin:{async rpc(name,input){calls.push(name);assert.equal(input.p_salon,id);assert.equal(input.p_actor,'actor');return {error,data:{salon_id:salon,before:{record:{price:20},fingerprint:'old'},payload:{tool,values,materials:values.style_materials,changes:{price:25}}}};}}};
 const helper=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/contentModerationServer':{async moderatePublicContent(_admin,content){calls.push('moderation');Object.defineProperty(calls,'moderated',{value:content});return {outcome:moderation};}}})('src/lib/assistantCatalogServer.ts');
 return {calls,run:()=>helper.prepareAssistantCatalog(ctx,tool,args(tool==='prepare_promotion_change'?{public_headline:'Headline'}:tool==='prepare_professional_change'?{specialties:['Specialty']}:tool==='prepare_service_change'?{base_price:25}:{price:25}))};
}
test('current scoped record and canonical validation precede moderation; preparation has no write',async()=>{
 const f=fixture(),r=await f.run();assert.deepEqual(r.payload.changes,{price:25});assert.deepEqual(f.calls,['preview_gc_catalog_change','moderation']);
});
test('another business or denied database access cannot reach moderation',async()=>{
 for(const input of [{salon:foreign},{error:{message:'ASSISTANT_ACCESS_DENIED'}}]){const f=fixture(input);await assert.rejects(f.run(),/ASSISTANT_ACCESS_DENIED/);assert.deepEqual(f.calls,['preview_gc_catalog_change']);}
});
test('canonical invalid full state and unavailable content moderation fail before publication',async()=>{
 const f=fixture({values:{name:'Product',price:-1}});await assert.rejects(f.run(),/ASSISTANT_INVALID_INPUT/);assert.deepEqual(f.calls,['preview_gc_catalog_change']);
 const m=fixture({moderation:'review'});await assert.rejects(m.run(),/ASSISTANT_CONTENT_REVIEW_REQUIRED/);assert.deepEqual(m.calls,['preview_gc_catalog_change','moderation']);
});

test('moderation includes public offer labels and professional specialties before storing a review',async()=>{
 const offer=fixture({tool:'prepare_promotion_change',values:{title:'Offer',description:'Body',public_headline:'Headline',discount_label:'Discount'}});await offer.run();assert.equal(offer.calls.moderated.body,'Body\nHeadline\nDiscount');
 const person=fixture({tool:'prepare_professional_change',values:{name:'Professional',bio:'Biography',specialties:['Specialty']}});await person.run();assert.equal(person.calls.moderated.body,'Biography\nSpecialty');
});

test('service options and materials accept the manual editor shape and reject nested foreign or unsafe fields',()=>{
 const valid={size_options:[{label:'Small original',price_add:20}],length_options:[{label:'Waist original',price_add:30}],addons:[{label:'Scalp care original',price_add:15}],included_items:['Wash original'],style_materials:[{name:'Original fiber',price:25,longevity_weeks:4,quality_grade:'Good'}]};
 assert.equal(validateTool('prepare_service_change',args(valid)).permission,'styles');
 for(const invalid of [{size_options:[{label:'',price_add:20}]},{size_options:[{label:'A',price_add:-1}]},{addons:[{label:'A',price_add:3,salon_id:foreign}]},{style_materials:[{name:'A',price:5,longevity_weeks:13,quality_grade:'Good'}]},{style_materials:[{name:'A',price:5,longevity_weeks:4,quality_grade:'Good',id:foreign}]},{included_items:['a'.repeat(121)]}])assert.throws(()=>validateTool('prepare_service_change',args(invalid)),/ASSISTANT_INVALID_INPUT/);
});

test('public material and option prose is moderated without translating original strings',async()=>{
 const f=fixture({tool:'prepare_service_change',values:{name:'Original service',base_price:40,duration_min_hours:1,duration_max_hours:1,size_options:[{label:'Original taille',price_add:20}],length_options:[{label:'Original length',price_add:10}],addons:[{label:'Original addon',price_add:5}],included_items:['Original inclusion'],style_materials:[{name:'Original fiber',price:25,longevity_weeks:6,quality_grade:'Original grade'}]}});await f.run();assert.equal(f.calls.moderated.body,'Original taille\nOriginal length\nOriginal addon\nOriginal inclusion\nOriginal fiber\nOriginal grade');
});
