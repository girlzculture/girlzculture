import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{}}),core=load('src/lib/gcAssistantCore.ts'),protocol=load('src/lib/gcAssistantPlannerProtocol.ts');
const business='20000000-0000-4000-8000-000000000001',actor='20000000-0000-4000-8000-000000000002',record='20000000-0000-4000-8000-000000000003';
const args={action:'expense',record_id:null,record_kind:null,amount_cents:2500,date:'2026-09-22',time:'12:30',method:null,category:'Supplies',treatment:'operating',note:'Already paid for towels',money_already_moved:true};
test('finance manager alone receives reviewed financial record tools; booking/logger roles do not',()=>{
 for(const action of ['expense','receipt','refund']){const input=action==='expense'?args:{...args,action,record_id:record,record_kind:action==='receipt'?'sale':'receipt',method:action==='receipt'?'cash':null,category:null,treatment:null};const result=core.validateTool('prepare_finance_record',input);assert.equal(result.risk,4);assert.equal(result.permission,'finance_manage');}
 for(const permissions of [['bookings'],['finance_log'],['earnings']])assert(!protocol.ownerPlannerSchema(new Set(permissions),false).properties.decision.anyOf.some(row=>row.properties?.tool?.enum[0]==='prepare_finance_record'));
 assert(JSON.stringify(protocol.ownerPlannerSchema(new Set(['finance_manage']),false)).includes('prepare_finance_record'));
});
test('finance arguments cannot invent consent, a scope, a fractional amount, extra record fields or ambiguous treatment',()=>{
 for(const patch of [{money_already_moved:false},{amount_cents:0},{amount_cents:2.5},{salon_id:business},{category:null},{treatment:null},{record_id:record},{method:'cash'},{date:'2026-02-30'}])assert.throws(()=>core.validateTool('prepare_finance_record',{...args,...patch}),/ASSISTANT_INVALID/);
 for(const patch of [{action:'refund',record_id:record,record_kind:'sale',category:null,treatment:null},{action:'receipt',record_id:record,record_kind:'sale',category:null,treatment:null}])assert.throws(()=>core.validateTool('prepare_finance_record',{...args,...patch}),/ASSISTANT_INVALID/);
});
function context(result){return {salon:{id:business},user:{id:actor},admin:{async rpc(name,payload){assert.equal(payload.p_salon,business);assert.equal(payload.p_actor,actor);assert(!('salon_id' in payload));return result;}}};}
test('finance draft comes from fresh scoped database projection and performs no write RPC',async()=>{
 const helper=load('src/lib/assistantFinanceRecordsServer.ts');let calls=0;const ctx=context({data:{salon_id:business,before:{},payload:{amount_cents:2500,provider_action:false}}});const rpc=ctx.admin.rpc;ctx.admin.rpc=(name,payload)=>{assert.equal(name,'preview_gc_finance_record');assert.deepEqual(JSON.parse(JSON.stringify(payload.p_args)),args);calls++;return rpc(name,payload);};
 const result=await helper.prepareAssistantFinanceRecord(ctx,args);assert.equal(result.payload.amount_cents,2500);assert.equal(calls,1);assert.deepEqual([...result.notices],['FINANCE_RECORD_ONLY_NO_PROVIDER_ACTION']);
});
test('malformed and cross-business database results fail closed before model input',async()=>{
 const helper=load('src/lib/assistantFinanceRecordsServer.ts');for(const data of [null,{}, {salon_id:record,records:[{note:'foreign'}]}])await assert.rejects(helper.readAssistantFinanceRecords(context({data}),{start:'2026-09-01',end:'2026-09-02'}),/ASSISTANT_ACCESS_DENIED/);
 await assert.rejects(helper.prepareAssistantFinanceRecord(context({error:{message:'ASSISTANT_RECORD_NOT_FOUND'}}),args),/ASSISTANT_RECORD_NOT_FOUND/);
});
test('finance task continues authorized reads and cannot switch silently into a booking write',()=>{
 const {continuesActiveTask}=load('src/lib/assistantActiveTask.ts');const active={tool:'prepare_finance_record'};
 assert(continuesActiveTask(active,{task_tool:active.tool,plan:{tool:'get_finance_records'}}));assert(!continuesActiveTask(active,{task_tool:'prepare_manual_appointment',plan:{tool:'prepare_manual_appointment'}}));
});
test('all four deterministic fallback summaries disclose recorded-only finance counts',()=>{
 const {presentAssistantResult}=load('src/lib/gcAssistantPresentation.ts');for(const locale of ['en','fr','es','zh-CN'])assert.match(presentAssistantResult('get_finance_records',{totals:{receipt:3,expense:2}},locale).message,/5/);
});
