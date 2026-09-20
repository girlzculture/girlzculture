import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const {summarizeOperatingBooks}=loadNodeTypescript(process.cwd())('src/lib/businessFinanceCore.ts');
const id=n=>`18300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const args={start:'2026-08-01T04:00:00Z',end:'2026-08-29T04:00:00Z'};
function fixture({denied=[],failure=null,own=false}={}){
 const calls=[];
 const row={service_id:id(2),name:'Own service',completed_count:1,previous_count:2,contribution_cents:5000,review_status:'owner_reviewed',review:{note:'PRIVATE_OWNER_REVIEW',allocations:[{id:id(3),cents:3000}]},href:'/salon/dashboard/services/'+id(2)};
 const value={period:{from:'2026-08-01',to:'2026-08-28',timeZone:'America/New_York'},previous_period:{from:'2026-07-04',to:'2026-07-31',timeZone:'America/New_York'},as_of:'2026-09-19T12:00:00Z',rows:[row],recommendations:[row],cost_sources:[{label:'PRIVATE_EXPENSE',id:id(3)}],can_review:true,net_profit_verified:false,definition:'Owner-recorded contribution, not net profit.'};
 const context={salon:{id:id(1),time_zone:'America/New_York'},user:{id:id(9)},isOwner:true,admin:{async rpc(name,p){calls.push([name,p]);if(name==='p0_actor_has_permission')return {data:!denied.includes(p.p_permission)&&['earnings','bookings','styles'].includes(p.p_permission),error:null};throw Error(name);},from(){const q={select(){return q;},eq(){return q;},gte(){return q;},lt(){return q;},order(){return q;},range:async()=>({data:[],error:null})};return q;}}};
 const load=loadNodeTypescript(process.cwd(),{'@/lib/supabaseAdmin':{requireSalonOwner:async()=>context},'@/lib/businessFinanceServer':{readBusinessFinances:async(c,period)=>({scope:{kind:own?'own':'business',stylist_id:null},summary:summarizeOperatingBooks(c.salon.id,{sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]},period),stylists:[],evidence:{},insights:null})},'@/lib/businessServiceContributionServer':{readServiceContribution:async(c,from,to)=>{assert.equal(c,context);calls.push(['contribution',{from,to}]);if(failure)throw Error(failure);return value;}}});
 return {calls,load,context,value,read:tool=>load('src/lib/ownerReadServer.ts').readOwnerOperation(context,tool,args)};
}
for(const tool of ['get_business_summary','get_earnings_summary'])test('actual '+tool+' includes bounded own-service contribution evidence for the exact requested completed period',async()=>{
 const f=fixture(),out=await f.read(tool);assert.equal(out.service_contribution.recommendations[0].service_name,'Own service');assert.equal(out.service_contribution.recommendations[0].contribution_cents,5000);assert.equal(out.service_contribution.recommendations[0].href,'/salon/dashboard/services/'+id(2));assert.equal(out.service_contribution.recommendation_count,1);assert.deepEqual(f.calls.find(([name])=>name==='contribution')[1],{from:'2026-08-01',to:'2026-08-28'});assert.doesNotMatch(JSON.stringify(out.service_contribution),/PRIVATE_OWNER_REVIEW|PRIVATE_EXPENSE|allocations|cost_sources/);
});
test('assistant contribution requires all three fresh grants and preserves scope-loss versus unavailable evidence',async()=>{
 for(const permission of ['earnings','bookings','styles']){const f=fixture({denied:[permission]});const out=await f.read('get_business_summary');assert.equal(out.service_contribution,null);assert.equal(f.calls.some(([name])=>name==='contribution'),false);}
 const denied=fixture({failure:'CONTRIBUTION_ACCESS_DENIED'});await assert.rejects(denied.read('get_business_summary'),/ASSISTANT_ACCESS_DENIED/);
 const unavailable=fixture({failure:'CONTRIBUTION_EVIDENCE_INCOMPLETE'}),out=await unavailable.read('get_earnings_summary');assert.equal(out.service_contribution.available,false);assert.equal(out.service_contribution.reason,'incomplete_evidence');assert.equal(out.service_contribution.recommendation_count,null);assert.deepEqual(out.service_contribution.recommendations,[]);
 const staff=fixture({own:true});assert.equal((await staff.read('get_earnings_summary')).service_contribution,null);assert.equal(staff.calls.some(([name])=>name==='contribution'),false);
});
test('partial-day requests never silently widen the cost review period and recommendations are explicit excerpts',async()=>{
 const f=fixture();const partial=await f.load('src/lib/assistantServiceContribution.ts').readAssistantServiceContribution(f.context,{...args,start:'2026-08-01T12:00:00Z'});assert.equal(partial.available,false);assert.equal(partial.reason,'completed_calendar_period_required');assert.equal(f.calls.some(([name])=>name==='contribution'),false);
 f.value.rows=Array.from({length:4},(_,i)=>({...f.value.rows[0],service_id:id(i+20),name:'Own service '+i,href:'/salon/dashboard/services/'+id(i+20)}));f.value.recommendations=f.value.rows;
 const out=await f.read('get_earnings_summary');assert.equal(out.service_contribution.recommendation_count,4);assert.equal(out.service_contribution.recommendations.length,2);assert.equal(out.service_contribution.is_excerpt,true);assert.equal(out.service_contribution.reviewed_service_count,4);
});
test('changed business timezone or returned date window cannot silently rebind the requested contribution interval',async()=>{
 for(const patch of [{timeZone:'UTC'},{from:'2026-07-31'},{to:'2026-08-27'}]){const f=fixture();Object.assign(f.value.period,patch);const out=await f.read('get_earnings_summary');assert.equal(out.service_contribution.available,false);assert.equal(out.service_contribution.reason,'source_changed');assert.deepEqual(out.service_contribution.recommendations,[]);assert.doesNotMatch(JSON.stringify(out.service_contribution),/Own service|5000/);}
});
