import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const id='20000000-0000-4000-8000-000000000001',foreign='20000000-0000-4000-8000-000000000002';
const load=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{}}),core=load('src/lib/gcAssistantCore.ts'),protocol=load('src/lib/gcAssistantPlannerProtocol.ts');
const {operationTool}=load('src/lib/assistantOperations.ts');
const validate=input=>core.validateTool(operationTool(input.operation)||'prepare_stock_change',input);
const args=(operation,changes,record_id=id)=>({operation,record_id,changes_json:JSON.stringify(changes)});
test('fulfillment accepts reviewed status transitions only and cannot request payment or notification effects',async()=>{
 const changes={fulfillment_status:'Shipped',carrier:'Local carrier',tracking_number:'TEST-123',note:null};
 assert.equal(validate(args('product_fulfillment',changes)).permission,'products');
 for(const key of ['refund','charge','send_email','salon_id','payment_status'])assert.throws(()=>validate(args('product_fulfillment',{...changes,[key]:true})),/ASSISTANT_INVALID/);
 for(const fulfillment_status of ['Cancelled','Canceled','Refunded','Paid'])assert.throws(()=>validate(args('product_fulfillment',{...changes,fulfillment_status})),/ASSISTANT_INVALID/);
 assert.throws(()=>validate(args('product_fulfillment',changes,null)),/ASSISTANT_INVALID/);
 const calls=[],ctx={salon:{id},user:{id:'actor'},admin:{async rpc(name,input){calls.push(name);assert.equal(input.p_salon,id);return {data:{salon_id:id,before:{revision:1},payload:{operation:'product_fulfillment',changes,provider_action:false,notification_sent:false}}};}}};
 const helper=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/contentModerationServer':{async moderatePublicContent(){throw Error('No public prose or provider call');}}})('src/lib/assistantOperationsServer.ts');
 const result=await helper.prepareAssistantOperation(ctx,args('product_fulfillment',changes));assert.equal(result.payload.provider_action,false);assert.deepEqual(calls,['preview_gc_business_operation']);
});
test('operations use their real permission and strict payload schema, with no caller-selected business',()=>{
 const cases=[['stock_restock',{kind:'product',quantity:2,cost_cents:0,note:'Counted'},'products',id],['photo_cover',{url:'https://example.test/own.jpg'},'photos',null],['client_card',{locale:'fr',patch:{formula:{technique:'Boho'}}},'client_history',id],['review_reply',{reply:'Thank you'},'reviews',id]];
 for(const [operation,changes,permission,record]of cases){const input=args(operation,changes,record);assert.equal(validate(input).permission,permission);for(const extra of ['salon_id','user_id','function_name','confirmed'])assert.throws(()=>validate(args(operation,{...changes,[extra]:foreign},record)),/ASSISTANT_INVALID/);}
});
test('invalid quantities, missing explicit notes, invalid locale and invented operation fail before a query',()=>{
 for(const changes of [{kind:'product',quantity:-1,note:'Bad'},{kind:'product',quantity:1.5,note:'Bad'},{kind:'product',quantity:1,note:''},{kind:'product',quantity:1}])assert.throws(()=>validate(args('stock_correction',changes)),/ASSISTANT_INVALID/);
 for(const changes of [{locale:'wo',patch:{notes:'test'}},{locale:'en',patch:{}},{locale:'en',patch:{permissions:{all:true}}},{locale:'en',patch:{formula:{duration_minutes:0}}}])assert.throws(()=>validate(args('client_card',changes)),/ASSISTANT_INVALID/);
 assert.throws(()=>validate(args('execute_sql',{})),/ASSISTANT_INVALID/);
 assert.throws(()=>validate({...args('review_reply',{reply:'test'}),changes_json:'{'}),/ASSISTANT_INVALID/);
});
test('staff without overview can access their permitted operation, while unrelated roles cannot receive it',()=>{
 for(const [tool,permission] of Object.entries(load('src/lib/assistantOperations.ts').OPERATION_TOOLS))assert.match(JSON.stringify(protocol.ownerPlannerSchema(new Set([permission]),false)),new RegExp(tool));
 assert.doesNotMatch(JSON.stringify(protocol.ownerPlannerSchema(new Set(['bookings']),false)),/prepare_stock_change|prepare_photo_change|prepare_client_card_change|prepare_review_reply/);
 const payload={language_switch:null,task_tool:'prepare_review_reply',decision:{tool:'prepare_review_reply',args:args('review_reply',{reply:'Saved reply'})}};
 assert.equal(protocol.parseOwnerPlannerResponse(JSON.stringify(payload),new Set(['reviews']),false,true).plan.tool,'prepare_review_reply');
 assert.throws(()=>protocol.parseOwnerPlannerResponse(JSON.stringify(payload),new Set(['products']),false,true),/ASSISTANT_ACCESS_DENIED/);
});
test('server scope is resolved before moderation and draft preparation calls no write',async()=>{
 const calls=[],ctx={salon:{id},user:{id:'actor'},admin:{async rpc(name,input){calls.push(name);assert.equal(input.p_salon,id);assert.equal(input.p_actor,'actor');return {data:{salon_id:id,before:{revision:1},payload:{operation:'review_reply',changes:{reply:'Thank you'}}}};}}};
 const helper=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/contentModerationServer':{async moderatePublicContent(){calls.push('moderation');return {outcome:'allow'};}}})('src/lib/assistantOperationsServer.ts');
 const result=await helper.prepareAssistantOperation(ctx,args('review_reply',{reply:'Thank you'}));assert.equal(result.payload.operation,'review_reply');assert.deepEqual(calls,['preview_gc_business_operation','moderation']);
});
test('cross-business results and unavailable moderation fail closed without a public mutation',async()=>{
 let moderation=0;const ctx={salon:{id},user:{id:'actor'},admin:{async rpc(){return {data:{salon_id:foreign,before:{},payload:{}}};}}};
 const helper=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/contentModerationServer':{async moderatePublicContent(){moderation++;return {outcome:'review'};}}})('src/lib/assistantOperationsServer.ts');
 await assert.rejects(helper.prepareAssistantOperation(ctx,args('review_reply',{reply:'Test'})),/ASSISTANT_ACCESS_DENIED/);assert.equal(moderation,0);
 ctx.admin.rpc=async()=>({data:{salon_id:id,before:{},payload:{}}});await assert.rejects(helper.prepareAssistantOperation(ctx,args('review_reply',{reply:'Test'})),/ASSISTANT_CONTENT_REVIEW_REQUIRED/);assert.equal(moderation,1);
});
test('all four stock summaries reflect recorded counts without calling a provider',()=>{
 const {presentAssistantResult}=load('src/lib/gcAssistantPresentation.ts');for(const locale of ['en','fr','es','zh-CN'])assert.match(presentAssistantResult('get_business_stock',{products:[{id}],supplies:[]},locale).message,/1/);
});
