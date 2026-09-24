import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const {locationSettingsInput}=loadNodeTypescript(process.cwd())('src/lib/businessLocationSettings.ts');
const valid=()=>({revision:1,home_address_public:false,public_neighborhood:'Brooklyn',offers_mobile:true,travel_radius_miles:10,travel_fee_cents:1250});
test('location settings preserve fee cents and require a known revision',()=>{assert.deepEqual(locationSettingsInput(valid()),{revision:1,settings:{home_address_public:false,public_neighborhood:'Brooklyn',offers_mobile:true,travel_radius_miles:10,travel_fee_cents:1250}});});
test('location settings reject tenant/approval injection, malformed booleans and unbounded fees',()=>{for(const patch of [{salon_id:'other'},{approved:true},{revision:0},{revision:'1'},{home_address_public:'true'},{travel_radius_miles:101},{travel_fee_cents:12.5},{travel_fee_cents:-1},{travel_fee_cents:100001},{public_neighborhood:'x'.repeat(121)}])assert.throws(()=>locationSettingsInput({...valid(),...patch}));});

test('waitlist demand counts only the six category-marked recruitment requests without returning contacts',async()=>{
 const calls=[];
 const admin={from(table){const call={table,filters:[]};calls.push(call);return {select(columns,options){call.columns=columns;call.options=options;return this;},eq(...args){call.filters.push(['eq',...args]);return this;},like(...args){call.filters.push(['like',...args]);return this;},then(resolve){return Promise.resolve({count:7,error:null}).then(resolve);}};}};
 const {businessWaitlistDemand}=loadNodeTypescript(process.cwd())('src/lib/businessWaitlistDemand.ts');
 const result=await businessWaitlistDemand(admin);
 assert.equal(result.length,6);assert.equal(calls.length,6);assert.equal(new Set(result.map(row=>row.category)).size,6);
 for(const [index,row] of result.entries()){
  assert.deepEqual(Object.keys(row).sort(),['category','name','requests']);assert.equal(row.requests,7);
  assert.notEqual(row.category,'other');assert.notEqual(row.category,'hair-salon-braiding');
  assert.deepEqual(calls[index],{table:'support_tickets',columns:'id',options:{count:'exact',head:true},filters:[['eq','category','Partnerships'],['like','subject','Business waitlist — %'],['like','message',`%\nBusiness category ID: ${row.category}\n%`]]});
 }
});
test('waitlist demand never presents an unavailable count as zero',async()=>{
 const {businessWaitlistDemand}=loadNodeTypescript(process.cwd())('src/lib/businessWaitlistDemand.ts');
 const make=result=>({from(){return{select(){return this;},eq(){return this;},like(){return this;},then(fn){return Promise.resolve(result).then(fn);}};}});
 await assert.rejects(()=>businessWaitlistDemand(make({count:null,error:null})),/WAITLIST_COUNT_UNAVAILABLE/);
 await assert.rejects(()=>businessWaitlistDemand(make({count:0,error:new Error('fixture failure')})),/fixture failure/);
});
test('waitlist aggregation enforces support permission before reading counts',async()=>{
 let reads=0,permission;
 const {GET}=loadNodeTypescript(process.cwd(),{
  '@/lib/supabaseAdmin':{requireAdminPermission:async(_request,p)=>{permission=p;throw new Error('Forbidden');}},
  '@/lib/businessWaitlistDemand':{businessWaitlistDemand:async()=>{reads++;return[];}},
  '@/lib/platformErrors':{monitoredRouteFailure:()=>Response.json({error:'Access denied'},{status:403})},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler},
 })('src/app/api/admin/business-waitlist/route.ts');
 assert.equal((await GET(new Request('https://example.test/api/admin/business-waitlist'))).status,403);assert.equal(permission,'support');assert.equal(reads,0);
});

const {publicBusinessLocation}=loadNodeTypescript(process.cwd())('src/lib/publicBusinessLocation.ts');
for(const kind of ['home','mobile'])test(`public ${kind} location never renders stale private streets or coordinates`,()=>{
 const view=publicBusinessLocation({service_location_type:kind,home_address_public:false,operator_type:'solo',public_neighborhood:'Harlem',address_street:'Private fixture street',address_zip:'10027',latitude:40.811,longitude:-73.944,offers_mobile:true,travel_radius_miles:10,travel_fee_cents:1250});
 assert.equal(view.mapQuery,null);assert.equal(view.address,'Harlem');assert.equal(view.travelFee,12.5);assert.equal(view.independent,true);assert.equal(JSON.stringify(view).includes('Private fixture'),false);assert.equal(JSON.stringify(view).includes('10027'),false);
});
test('fixed storefront and explicit home opt-in retain precise map behavior',()=>{
 for(const kind of ['storefront','chair_suite','home']){const view=publicBusinessLocation({service_location_type:kind,home_address_public:true,address_street:'123 Fixture St',address_city:'Brooklyn',latitude:40.68,longitude:-73.99});assert.equal(view.mapQuery,'40.68,-73.99');assert.equal(view.address,'123 Fixture St, Brooklyn');assert.equal(view.mobile,false);}
});
