import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const business='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', actor='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const product='dddddddd-dddd-4ddd-8ddd-dddddddddddd', order='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', foreignOrder='ffffffff-ffff-4fff-8fff-ffffffffffff';
const now='2026-09-19T16:00:00.000Z';
class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));}static now(){return Date.parse(now);} }
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const productRow={id:product,salon_id:business,name:'Own Hair Oil',description:'Own retail product',price:25,sale_price:null,inventory_quantity:4,track_inventory:true,low_stock_threshold:5,product_status:'Active',is_visible:true,archived_at:null,pickup_enabled:true,pickup_prep_minutes:45,shipping_enabled:true,in_person_only:false,created_at:'2026-09-01T10:00:00Z'};
const orderRow={id:order,salon_id:business,public_reference:'GC-ORDER-A',fulfillment_method:'Pickup',fulfillment_status:'Ready for pickup',reservation_status:'Ready for pickup',payment_status:'Deposit paid',payment_mode:'live',created_at:'2026-09-18T12:00:00Z',updated_at:'2026-09-19T15:00:00Z',pickup_deadline:'2026-09-20T16:00:00Z',fulfilled_at:null,guest_name:'PRIVATE CUSTOMER',guest_email:'private@example.test',guest_phone:'PRIVATE_PHONE',customer_id:actor,shipping_address:{street:'PRIVATE_ADDRESS'},management_token_hash:'PRIVATE_MANAGEMENT_TOKEN',stripe_payment_intent_id:'pi_PRIVATE',stripe_charge_id:'ch_PRIVATE',tracking_number:'PRIVATE_TRACKING',internal_reason:'PRIVATE_REASON',total_amount:25,deposit_amount:5,remaining_balance:20};

function fixture(options={}) {
 const calls=[];
 const tables={salon_products:[productRow,{...productRow,id:actor,salon_id:other,name:'FOREIGN PRODUCT'}],product_orders:[orderRow,{...orderRow,id:foreignOrder,salon_id:other,public_reference:'FOREIGN ORDER'}],product_order_items:[{id:'own-item',order_id:order,product_id:product,product_name:'Own order snapshot name',quantity:2,unit_price:25,line_total:50,fulfillment_snapshot:{private:'PRIVATE_SNAPSHOT'}},{id:'foreign-item',order_id:foreignOrder,product_name:'FOREIGN ITEM',quantity:999}],...options.tables};
 const admin={async rpc(name,args){calls.push({rpc:name,args});assert.equal(args.p_salon,business);assert.equal(args.p_user,actor);if(name==='p0_actor_has_permission')return {data:options.permission?options.permission(args.p_permission,calls):!(options.denied||[]).includes(args.p_permission)};if(name==='read_business_stock')return {data:{products:tables.salon_products.filter(row=>row.salon_id===business),supplies:[]}};throw Error(`Unexpected RPC ${name}`);},
  from(table){const filters=[];let fields=[],cap=Infinity,countMode=false;const orders=[];const q={select(value,settings){fields=value.split(',');countMode=settings?.head===true;return q;},eq(key,value){filters.push({key,value,fn:row=>row[key]===value});return q;},is(key,value){filters.push({key,value,fn:row=>(row[key]??null)===value});return q;},in(key,values){filters.push({key,value:values,fn:row=>values.includes(row[key])});return q;},ilike(key,pattern){const needle=pattern.slice(1,-1).replace(/\\([\\%_])/g,'$1').toLowerCase();filters.push({key,value:pattern,fn:row=>String(row[key]).toLowerCase().includes(needle)});return q;},order(key,settings){orders.push({key,ascending:settings?.ascending!==false});return q;},limit(value){cap=value;return q;},
   then(resolve,reject){return Promise.resolve().then(()=>{calls.push({table,fields,filters:filters.map(({key,value})=>({key,value}))});assert.ok(tables[table],`Unexpected table ${table}`);if(options.errorTable===table)return {error:{message:'synthetic read failure'}};const rows=tables[table].filter(row=>filters.every(filter=>filter.fn(row))).sort((a,b)=>{for(const sort of orders){const n=String(a[sort.key]).localeCompare(String(b[sort.key]));if(n)return sort.ascending?n:-n;}return 0;});return {data:countMode?null:rows.slice(0,cap).map(row=>Object.fromEntries(fields.map(key=>[key,row[key]??null]))),count:options.noCountTable===table?null:rows.length};}).then(resolve,reject);}};return q;}
 };
 const load=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/bookingAvailabilityServer':{},'@/lib/contentModerationServer':{}},{Date:Clock});
 const server=load('src/lib/gcAssistantServer.ts'),context={admin,salon:{id:business,time_zone:'America/New_York'},user:{id:actor},isOwner:!options.staff,teamMember:options.staff?{permissions:{products:true}}:null};
 return {calls,tables,server,context,read:(query='')=>server.readAssistantData(context,'get_products',{query})};
}

test('product read includes saved fulfillment availability without inferring stock or checkout eligibility',async()=>{
 const result=await fixture().read(), own=result.products[0];
 assert.equal(own.pickup_enabled,true);assert.equal(own.pickup_prep_minutes,45);assert.equal(own.shipping_enabled,true);assert.equal(own.in_person_only,false);
 assert.equal(result.total,1);assert.equal(result.stock_alerts_total,1);assert.equal(result.stock_alerts[0].quantity,4);
});

test('product read reports own recorded orders and pickups with date status references and bounded item snapshots',async()=>{
 const f=fixture(),result=await f.read(), operations=result.order_operations;
 assert.ok(operations,'operational knowledge must come from canonical product orders');
 assert.equal(operations.total,1);assert.equal(operations.as_of,now);assert.equal(operations.time_zone,'America/New_York');assert.equal(operations.period,'all_time');
 assert.equal(operations.orders[0].public_reference,'GC-ORDER-A');assert.equal(operations.orders[0].reservation_status,'Ready for pickup');assert.equal(operations.orders[0].pickup_deadline,orderRow.pickup_deadline);
 assert.deepEqual(plain(operations.orders[0].items),[{product_name:'Own order snapshot name',quantity:2}]);
 assert.equal(operations.href,'/salon/dashboard/products#product-orders');assert.equal(operations.actions_performed,false);
 assert.doesNotMatch(JSON.stringify(result),/FOREIGN|PRIVATE|pi_|ch_/);
 for(const call of f.calls.filter(call=>call.table==='product_orders'))assert.ok(call.filters.some(filter=>filter.key==='salon_id'&&filter.value===business));
 const items=f.calls.find(call=>call.table==='product_order_items');assert.ok(items.filters.some(filter=>filter.key==='order_id'&&JSON.stringify(filter.value)===JSON.stringify([order])));
});

test('products-only staff cannot gain customer, finance or provider detail through operational reads',async()=>{
 const f=fixture({staff:true,denied:['client_history','earnings','finance_manage','bookings']}),result=await f.read();
 assert.equal(result.order_operations?.total,1);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|customer_id|guest_email|guest_name|shipping_address|management_token|stripe_|total_amount|remaining_balance/);
 for(const call of f.calls.filter(call=>call.table==='product_orders'||call.table==='product_order_items'))assert.ok(call.fields.every(field=>!['*','guest_name','guest_email','guest_phone','customer_id','shipping_address','management_token_hash','stripe_payment_intent_id','stripe_charge_id','tracking_number','internal_reason','total_amount','unit_price','line_total','deposit_amount','remaining_balance','fulfillment_snapshot'].includes(field)),`forbidden source column ${call.fields}`);
});

test('product order query failures remain unavailable rather than claiming no orders',async()=>{
 await assert.rejects(fixture({errorTable:'product_orders'}).read());
 await assert.rejects(fixture({errorTable:'product_order_items'}).read());
 await assert.rejects(fixture({noCountTable:'product_orders'}).read(),/ASSISTANT_SERVICE_UNAVAILABLE/);
});

test('products permission revocation discards the operational result before disclosure',async()=>{
 const f=fixture({permission:(permission,calls)=>permission!=='products'||calls.filter(call=>call.rpc==='p0_actor_has_permission'&&call.args.p_permission==='products').length<2});
 await assert.rejects(f.read(),/ASSISTANT_ACCESS_DENIED/);
});

test('bounded product-order lists distinguish a current excerpt from an exact inventory total',async()=>{
 const rows=Array.from({length:103},(_,index)=>({...orderRow,id:`own-order-${index}`,public_reference:`GC-${index}`}));
 const result=await fixture({tables:{product_orders:rows,product_order_items:[]}}).read();
 assert.equal(result.order_operations.total,103);assert.equal(result.order_operations.shown_count,100);assert.equal(result.order_operations.orders.length,100);assert.equal(result.order_operations.is_excerpt,true);
});

test('an empty product-name match does not become a claim that the business has no orders',async()=>{
 const result=await fixture().read('not listed');assert.equal(result.total,0);assert.equal(result.products.length,0);
 assert.equal(result.order_operations.total,1);assert.equal(result.order_operations.query_applies_to_orders,false);
});

test('existing assistant products permission denial prevents inventory and order retrieval',async()=>{
 const f=fixture({denied:['products']});await assert.rejects(f.server.executeAssistantTool(f.context,{requestId:product,locale:'en',tool:'get_products',args:{query:''}}),/ASSISTANT_ACCESS_DENIED/);
 assert.equal(f.calls.some(call=>call.table||call.rpc==='read_business_stock'),false);
});

test('order items cannot follow a foreign product reference but retain a legitimately deleted product snapshot',async()=>{
 const item={id:'own-item',order_id:order,product_id:actor,product_name:'Not authorized as own product',quantity:1};
 await assert.rejects(fixture({tables:{product_order_items:[item]}}).read(),/ASSISTANT_SERVICE_UNAVAILABLE/);
 const result=await fixture({tables:{product_order_items:[{...item,product_id:null,product_name:'Former own product'}]}}).read();
 assert.equal(result.order_operations.orders[0].items[0].product_name,'Former own product');
});

test('product grant loss after order retrieval cannot disclose the completed result',async()=>{
 const f=fixture({permission:(permission,calls)=>permission!=='products'||!calls.some(call=>call.table==='product_orders')});
 await assert.rejects(f.read(),/ASSISTANT_ACCESS_DENIED/);assert.ok(f.calls.some(call=>call.table==='product_orders'));
});

test('bounded item collections preserve unknown total rather than reporting missing items as none',async()=>{
 const items=Array.from({length:1001},(_,index)=>({id:`item-${index}`,order_id:order,product_id:product,product_name:'Own product',quantity:1}));
 const result=await fixture({tables:{product_order_items:items}}).read(),row=result.order_operations.orders[0];
 assert.equal(row.items.length,12);assert.equal(row.shown_item_count,12);assert.equal(row.item_count,null);assert.equal(row.items_are_excerpt,true);
});

test('empty own orders are a verified zero and never trigger an unbound item lookup',async()=>{
 const f=fixture({tables:{product_orders:[{...orderRow,id:foreignOrder,salon_id:other}]}}),result=await f.read();
 assert.equal(result.order_operations.total,0);assert.deepEqual(plain(result.order_operations.orders),[]);assert.equal(result.order_operations.is_excerpt,false);
 assert.equal(f.calls.some(call=>call.table==='product_order_items'),false);
});

test('invalid order dates and missing item counts remain unavailable',async()=>{
 await assert.rejects(fixture({tables:{product_orders:[{...orderRow,pickup_deadline:'invalid date'}]}}).read(),/ASSISTANT_SERVICE_UNAVAILABLE/);
 await assert.rejects(fixture({noCountTable:'product_order_items'}).read(),/ASSISTANT_SERVICE_UNAVAILABLE/);
});
