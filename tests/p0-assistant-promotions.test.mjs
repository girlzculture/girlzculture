import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const business='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', actor='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const service='dddddddd-dddd-4ddd-8ddd-dddddddddddd', foreign='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', product='ffffffff-ffff-4fff-8fff-ffffffffffff';
const now='2026-09-19T16:00:00.000Z';
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return Date.parse(now);} }
const promotion=(id='11111111-1111-4111-8111-111111111111',change={})=>({id,salon_id:business,title:'Own selected service offer',description:'Owner saved description',promotion_type:'percentage',discount_value:20,status:'Active',is_active:true,target_scope:'services',target_ids:[service],restrictions:{minimum_subtotal:100,new_customers_only:true},starts_at:'2026-09-01T00:00:00Z',ends_at:'2026-09-30T23:59:59Z',archived_at:null,created_at:'2026-09-18T10:00:00Z',...change});

function fixture(options={}) {
 const calls=[];
 const tables={salon_promotions:[promotion()],styles:[{id:service,salon_id:business,name:'Own Silk Press',category:'Own Hair',service_group_id:'hair',master_style_id:'press',addons:[{value:'trim',label:'Own Trim',price_add:15}],archived_at:null,is_draft:false},{id:foreign,salon_id:other,name:'PRIVATE OTHER BUSINESS SERVICE',category:'PRIVATE OTHER GROUP',service_group_id:'foreign-group',master_style_id:'foreign-master',addons:[{value:'foreign-addon',label:'PRIVATE OTHER ADDON'}],archived_at:null,is_draft:false}],salon_products:[{id:product,salon_id:business,name:'Own Hair Oil',archived_at:null,product_status:'Published'}],...options.tables};
 const admin={
  async rpc(name,args){calls.push({rpc:name,args});assert.equal(name,'p0_actor_has_permission');assert.equal(args.p_salon,business);assert.equal(args.p_user,actor);return {data:options.permission?options.permission(args.p_permission,calls):!options.denied?.includes(args.p_permission)};},
  from(table){const filters=[];let fields=[],cap=Infinity,single=false;const orders=[];
   const q={select(value){fields=value.split(',');return q;},eq(key,value){filters.push({key,value,fn:row=>row[key]===value});return q;},is(key,value){filters.push({key,value,fn:row=>(row[key]??null)===value});return q;},in(key,values){filters.push({key,value:values,fn:row=>values.includes(row[key])});return q;},order(key,options){orders.push({key,ascending:options?.ascending!==false});return q;},limit(value){cap=value;return q;},maybeSingle(){single=true;return q;},
    then(resolve,reject){return Promise.resolve().then(()=>{calls.push({table,fields,filters:filters.map(({key,value})=>({key,value}))});if(options.errorTable===table)return {error:{message:'synthetic unavailable'}};assert.ok(tables[table],`Unexpected table ${table}`);const rows=tables[table].filter(row=>filters.every(filter=>filter.fn(row))).sort((a,b)=>{for(const order of orders){const n=String(a[order.key]).localeCompare(String(b[order.key]));if(n)return order.ascending?n:-n;}return 0;});const projected=rows.slice(0,cap).map(row=>fields.includes('*')?{...row}:Object.fromEntries(fields.map(key=>[key,row[key]??null])));return {data:single?projected[0]??null:projected,count:options.noCount?null:rows.length};}).then(resolve,reject);}};return q;}
 };
 const load=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/bookingAvailabilityServer':{},'@/lib/contentModerationServer':{}},{Date:Clock});
 const server=load('src/lib/gcAssistantServer.ts');
 const context={admin,salon:{id:business,time_zone:'America/New_York'},user:{id:actor},isOwner:!options.staff,teamMember:options.staff?{permissions:{promotions:true}}:null};
 return {calls,tables,server,context,read:()=>server.readAssistantData(context,'get_promotions',{})};
}

test('promotion read retains the saved restrictions, activation and targets needed to explain an offer',async()=>{
 const result=await fixture().read(), row=result.promotions[0];
 assert.deepEqual(plain(row.restrictions),{minimum_subtotal:100,new_customers_only:true});
 assert.equal(row.is_active,true);assert.equal(row.active_now,true);assert.equal(result.as_of,now);assert.equal(result.time_zone,'America/New_York');
 assert.deepEqual(plain(row.targets),[{id:service,name:'Own Silk Press'}]);
 assert.equal(row.target_count,1);assert.equal(row.target_resolution,'complete');
 assert.equal(result.monetary_quote_available,false,'a list cannot invent customer-specific pricing');
});

test('promotion activity uses saved state and current time, without calling record activity customer eligibility',async()=>{
 const rows=[promotion('live'),promotion('paused',{status:'Paused'}),promotion('off',{is_active:false}),promotion('expired',{ends_at:'2026-09-19T15:59:59Z'}),promotion('future',{starts_at:'2026-09-19T16:00:01Z'}),promotion('bad-date',{ends_at:'not-a-date'}),promotion('archived',{archived_at:now}),promotion('other',{salon_id:other,title:'PRIVATE OTHER OFFER'})];
 const result=await fixture({tables:{salon_promotions:rows}}).read();
 const active=Object.fromEntries(result.promotions.map(row=>[row.id,row.active_now]));
 assert.deepEqual(active,{live:true,paused:false,off:false,expired:false,future:false,'bad-date':false});
 assert.equal(result.total,6);assert.doesNotMatch(JSON.stringify(result),/PRIVATE OTHER OFFER/);
});

test('promotion target resolution cannot retrieve or reveal foreign service/product records',async()=>{
 const f=fixture({tables:{salon_promotions:[promotion('mixed',{target_ids:[service,foreign]})]}}), result=await f.read(), row=result.promotions[0];
 assert.deepEqual(plain(row.targets),[{id:service,name:'Own Silk Press'}]);
 assert.equal(row.target_count,2);assert.equal(row.unresolved_target_count,1);assert.equal(row.target_resolution,'unresolved');
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE OTHER|eeeeeeee/);
 for(const call of f.calls.filter(call=>call.table))assert.ok(call.filters.some(filter=>filter.key==='salon_id'&&filter.value===business),`${call.table} must be scoped before retrieval`);
});

test('promotion-only staff receive offer facts but no unauthorized target catalog records',async()=>{
 const f=fixture({staff:true,denied:['styles','products']}), result=await f.read();
 assert.equal(result.promotions[0].targets,null);assert.equal(result.promotions[0].target_resolution,'not_authorized');
 assert.doesNotMatch(JSON.stringify(result),/Own Silk Press|dddddddd/);
 assert.equal(f.calls.some(call=>['styles','salon_products'].includes(call.table)),false);
});

test('revoked promotion access discards the read before its facts can reach the model',async()=>{
 const f=fixture({permission:(permission,calls)=>permission!=='promotions'||calls.filter(call=>call.rpc&&call.args.p_permission==='promotions').length<2});
 await assert.rejects(f.read(),/ASSISTANT_ACCESS_DENIED/);
});

test('promotion list reads preserve exact counts and mark a bounded excerpt',async()=>{
 const f=fixture({tables:{salon_promotions:Array.from({length:103},(_,index)=>promotion(`offer-${index}`,{target_scope:'salon',target_ids:[]}))}}), result=await f.read();
 assert.equal(result.total,103);assert.equal(result.promotions.length,100);assert.equal(result.shown_count,100);assert.equal(result.is_excerpt,true);
});

test('promotion query errors and missing count evidence never become an empty inventory',async()=>{
 await assert.rejects(fixture({errorTable:'salon_promotions'}).read());
 await assert.rejects(fixture({noCount:true}).read(),/ASSISTANT_SERVICE_UNAVAILABLE/);
 const result=await fixture({tables:{salon_promotions:[]}}).read();assert.equal(result.total,0);assert.deepEqual(JSON.parse(JSON.stringify(result.promotions)),[]);assert.equal(result.is_excerpt,false);
});

test('promotion execution already rejects a user without promotion permission',async()=>{
 const f=fixture({denied:['promotions']});
 await assert.rejects(f.server.executeAssistantTool(f.context,{requestId:service,locale:'en',tool:'get_promotions',args:{}}),/ASSISTANT_ACCESS_DENIED/);
 assert.equal(f.calls.some(call=>call.table),false);
});

test('promotion group, style, add-on and product targets resolve only from the authorized own catalog',async()=>{
 const f=fixture({tables:{salon_promotions:[promotion('group',{target_scope:'service_groups',target_ids:['hair','foreign-group']}),promotion('master',{target_scope:'master_styles',target_ids:['press','foreign-master']}),promotion('addon',{target_scope:'addons',target_ids:['trim','foreign-addon']}),promotion('product',{target_scope:'products',target_ids:[product]})]}});
 const result=await f.read(), rows=Object.fromEntries(result.promotions.map(row=>[row.id,row]));
 for(const [id,name] of [['group','Own Hair'],['master','Own Silk Press'],['addon','Own Trim'],['product','Own Hair Oil']])assert.equal(rows[id].targets[0].name,name);
 for(const id of ['group','master','addon'])assert.equal(rows[id].unresolved_target_count,1);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE OTHER|foreign-group|foreign-master|foreign-addon/);
});

test('promotion targets use canonical case and whitespace normalization without resolving another business',async()=>{
 const f=fixture({tables:{salon_promotions:[promotion('service',{target_ids:[service.toUpperCase(),` ${foreign} `]}),promotion('addon',{target_scope:'addons',target_ids:[' TRIM ','trim',' FOREIGN-ADDON ']})]}}), result=await f.read();
 const rows=Object.fromEntries(result.promotions.map(row=>[row.id,row]));
 assert.equal(rows.service.targets[0]?.name,'Own Silk Press');assert.equal(rows.addon.targets[0]?.name,'Own Trim');
 assert.equal(rows.addon.target_count,2,'duplicate normalized targets count once as in canonical matching');
 assert.equal(rows.addon.unresolved_target_count,1);assert.doesNotMatch(JSON.stringify(result),/PRIVATE OTHER|FOREIGN-ADDON|foreign-addon|eeeeeeee/);
});

test('long saved promotion conditions explicitly disclose the retained excerpt',async()=>{
 const terms='Owner condition. '.repeat(40)+'Excluded final condition';
 const result=await fixture({tables:{salon_promotions:[promotion('terms',{restrictions:{terms,new_customers_only:true}})]}}).read();
 assert.equal(result.promotions[0].terms_are_excerpt,true);assert.equal(result.promotions[0].restrictions.terms,terms.slice(0,500));
 assert.equal(result.monetary_quote_available,false);assert.match(result.definition,/excerpt/i);
});

test('a target-catalog permission revoked during retrieval prevents returned facts',async()=>{
 const f=fixture({permission:(permission,calls)=>permission!=='styles'||!calls.some(call=>call.table==='styles')});
 await assert.rejects(f.read(),/ASSISTANT_ACCESS_DENIED/);
});

test('bounded catalog and target excerpts never claim that omitted targets are absent',async()=>{
 const styles=Array.from({length:1003},(_,index)=>({id:`service-${index}`,salon_id:business,name:`Own service ${String(index).padStart(4,'0')}`,archived_at:null}));
 const f=fixture({tables:{styles,salon_promotions:[promotion('many',{target_ids:styles.slice(0,20).map(row=>row.id)}),promotion('beyond',{target_ids:['service-1002']})]}}), result=await f.read();
 const many=result.promotions.find(row=>row.id==='many'),beyond=result.promotions.find(row=>row.id==='beyond');
 assert.equal(many.target_count,20);assert.equal(many.targets.length,12);assert.equal(many.shown_target_count,12);assert.equal(many.targets_are_excerpt,true);
 assert.equal(beyond.target_resolution,'incomplete_catalog');assert.equal(beyond.unresolved_target_count,null);
});
