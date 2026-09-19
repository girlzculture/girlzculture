import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{}});
const core=load('src/lib/gcAssistantCore.ts');
const protocol=load('src/lib/gcAssistantPlannerProtocol.ts');
const business='17700000-0000-4000-8000-000000000001',actor='17700000-0000-4000-8000-000000000002',service='17700000-0000-4000-8000-000000000003',stylist='17700000-0000-4000-8000-000000000004',foreign='17700000-0000-4000-8000-000000000099';
const args={service_id:service,stylist_id:stylist,amount_cents:12000,method:'cash',source:'walk_in',date:'2026-09-18',time:'12:30',client_name:null,payment_received:true};
test('received manual sale is a reviewed risk4 finance action, never an appointment or provider charge',()=>{
  const checked=core.validateTool('prepare_manual_service_sale',args);
  assert.equal(checked.permission,'finance_log');assert.equal(checked.risk,4);
  const decisions=protocol.ownerPlannerSchema(new Set(['finance_log']),false).properties.decision.anyOf;
  assert(decisions.some(row=>row.properties.tool?.enum[0]==='get_manual_sale_options'));
  assert(decisions.some(row=>row.properties.tool?.enum[0]==='prepare_manual_service_sale'));
  assert(!protocol.ownerPlannerSchema(new Set(['bookings']),false).properties.decision.anyOf.some(row=>row.properties.tool?.enum[0]==='prepare_manual_service_sale'));
});
test('manual sale rejects missing or invented receipt state, fractions and caller business scope',()=>{
  for(const patch of [{payment_received:false},{method:'unknown'},{amount_cents:12000.5},{amount_cents:0},{salon_id:foreign},{stylist_id:null}])assert.throws(()=>core.validateTool('prepare_manual_service_sale',{...args,...patch}),/ASSISTANT_INVALID_INPUT/);
});
function fixture({assigned=null,denied=false,unscoped=false,malformed=false}={}){
  const calls=[];const services=[{id:service,salon_id:business,name:'Silk Press',archived_at:null,is_draft:false,is_active:true},{id:foreign,salon_id:foreign,name:'PRIVATE OTHER BUSINESS',archived_at:null,is_draft:false,is_active:true}];
  const admin={async rpc(name,payload){calls.push({name,payload});assert.equal(name,'business_finance_entry_options');return denied?{error:{message:'FINANCE_ACCESS_DENIED'}}:{data:{stylists:[{id:stylist,salon_id:business,name:'Aisha'},{id:foreign,salon_id:business,name:'Different professional'}],products:[{name:'OMIT PRODUCT PRICE'}]}};},from(table){assert.equal(table,'styles');const filters=[];const q={select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},is(k,v){filters.push(row=>(row[k]??null)===v);return q;},order(){return q;},limit(){return q;},then(resolve){return Promise.resolve({data:malformed?null:unscoped?services:services.filter(row=>filters.every(f=>f(row)))}).then(resolve);}};return q;}};
  return {calls,context:{admin,user:{id:actor},salon:{id:business,time_zone:'America/New_York'},isOwner:!assigned,teamMember:assigned?{stylist_id:assigned}:null}};
}
test('finance selection facts exclude other businesses, product prices and unassigned professionals before model input',async()=>{
  const helper=load('src/lib/assistantManualSaleServer.ts'),f=fixture({assigned:stylist});
  const result=await helper.readManualSaleOptions(f.context);
  assert.deepEqual(JSON.parse(JSON.stringify(result.services)),[{id:service,name:'Silk Press'}]);assert.deepEqual(JSON.parse(JSON.stringify(result.professionals)),[{id:stylist,name:'Aisha'}]);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|OMIT|Different professional|salon_id/);
});
test('manual sale preview keeps exact received amount, anonymous client and canonical own service/professional',async()=>{
  const helper=load('src/lib/assistantManualSaleServer.ts'),f=fixture();
  const result=await helper.prepareManualSale(f.context,args);
  assert.equal(result.payload.amount_cents,12000);assert.equal(result.payload.service_name,'Silk Press');assert.equal(result.payload.professional_name,'Aisha');
  assert.equal(result.payload.occurred_at,'2026-09-18T16:30:00.000Z');assert.equal(result.payload.finance_payload.client_name,null);assert.equal(result.payload.finance_payload.cost_cents,null);assert.equal(result.payload.finance_payload.list_cents,12000);assert.equal(result.payload.finance_payload.discount_cents,0);assert.equal(result.payload.finance_payload.kind,'service');
  assert.deepEqual([...result.notices],['MANUAL_RECEIPT_NO_PROVIDER_CHARGE']);
});
test('foreign sources and assignment changes cannot create a manual sale preview',async()=>{
  const helper=load('src/lib/assistantManualSaleServer.ts');
  await assert.rejects(helper.prepareManualSale(fixture().context,{...args,service_id:foreign}),/ASSISTANT_RECORD_NOT_FOUND/);
  await assert.rejects(helper.prepareManualSale(fixture({assigned:stylist}).context,{...args,stylist_id:foreign}),/ASSISTANT_ACCESS_DENIED/);
  await assert.rejects(helper.readManualSaleOptions(fixture({denied:true}).context),/ASSISTANT_ACCESS_DENIED/);
});

test('malformed or mixed-business service responses fail closed before answer input',async()=>{
 const helper=load('src/lib/assistantManualSaleServer.ts');
 for(const options of [{unscoped:true},{malformed:true}])await assert.rejects(helper.readManualSaleOptions(fixture(options).context),/ASSISTANT_ACCESS_DENIED/);
});
