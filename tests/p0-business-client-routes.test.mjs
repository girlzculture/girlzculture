import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const booking='10000000-0000-4000-8000-000000000001',foreign='10000000-0000-4000-8000-000000000002',operation='10000000-0000-4000-8000-000000000003',reference='10000000-0000-4000-8000-000000000004';
function fixture({business='business-A',denied=[],failure,authError,photoPath}={}) {
 const calls=[],events=[];let revision=0;
 const permissions=Object.fromEntries(['client_history','client_formulas','client_notes','client_cautions','client_photos','client_spend','client_edit'].map(key=>[key,!denied.includes(key)]));
 const card=()=>({card_id:'card-A',revision,booking_id:booking,permissions,scope:'this_business_only',source_locale:'en',preferences:'No tightness',notes:'Original notes',cautions:permissions.client_cautions?'Private sensitivity':null,visits:[],photos:[],spend:null});
 const admin={rpc:async(name,args)=>{
  calls.push({name,args});assert.equal(args.p_salon,business);assert.equal(args.p_actor,`owner-${business}`);
  if(failure)return{error:{message:failure}};
  if(args.p_booking!==booking)return{error:{message:'CLIENT_NOT_FOUND'}};
  if(name==='read_business_client_card')return{data:card()};
  if(name==='save_business_client_card'){if(args.p_revision!==revision)return{error:{message:'CLIENT_CHANGED'}};revision++;return{data:{card_id:'card-A',revision,verified:true}};}
  if(name==='read_business_client_photo')return{data:photoPath||`${business}/${booking}/${operation}.webp`};
  throw Error(`Unexpected RPC ${name}`);
 },storage:{from:bucket=>{
  assert.equal(bucket,'business-client-work');
  return {download:async path=>{calls.push({download:path});return {data:new Blob(['synthetic'],{type:'image/webp'})};}};
 }}};
 const load=typescriptLoader(process.cwd(),{
  '@/lib/supabaseAdmin':{requireSalonPermission:async(_req,key)=>{assert.equal(key,'client_history');if(authError)throw Error(authError);return{admin,salon:{id:business},user:{id:`owner-${business}`},isOwner:true};}},
  '@/lib/requestSecurity':{enforceRateLimit(){}},
  '@/lib/platformErrors':{capturePlatformError:async data=>{events.push(data);return reference;}},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,h)=>h},
 },{Blob,File,FormData});
 const route=load('src/app/api/salon/bookings/[id]/client-record/route.ts');
 const photos=load('src/app/api/salon/bookings/[id]/client-record/photos/[photoId]/route.ts');
 const uploadRoute=load('src/app/api/salon/bookings/[id]/client-record/photos/route.ts');
 const run=(body,id=booking)=>route[body?'POST':'GET'](new Request('https://fixture.invalid/client-record',{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{params:Promise.resolve({id})});
 const photo=()=>photos.GET(new Request('https://fixture.invalid/photo'),{params:Promise.resolve({id:booking,photoId:operation})});
 const upload=()=>{const form=new FormData();form.set('file',new File(['not an image'],'work.png',{type:'image/png'}));form.set('caption','Private caption');form.set('locale','en');form.set('request_id',operation);return uploadRoute.POST(new Request('https://fixture.invalid/client-photo',{method:'POST',body:form}),{params:Promise.resolve({id:booking})});};
 return{run,photo,upload,calls,events,body:{request_id:operation,revision:0,locale:'fr',patch:{preferences:'Pas trop serré',formula:{instructions:'Medium waist-length box braids',duration_minutes:240}}}};
}
test('client read and verified save derive the current account/business on each request',async()=>{
 for(const business of ['business-A','business-B']){const f=fixture({business});const response=await f.run(f.body);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');const data=await response.json();assert.equal(data.verified,true);assert.equal(data.card.revision,1);assert.equal(f.calls.length,3);assert.equal(f.calls[1].args.p_patch.formula.instructions,'Medium waist-length box braids');}
});
test('forged business/customer/field IDs never reach a write RPC',async()=>{
 for(const extra of [{salon_id:'B'},{customer_id:'B'},{patch:{unknown:'private'}}]){const f=fixture();assert.equal((await f.run({...f.body,...extra})).status,400);assert.equal(f.calls.length,0);}
 const f=fixture();assert.equal((await f.run(f.body,foreign)).status,404);assert.equal(f.calls.some(c=>c.name==='save_business_client_card'),false);
 const reader=fixture({denied:['client_edit']});assert.equal((await reader.run(reader.body)).status,403);assert.equal(reader.calls.some(c=>c.name==='save_business_client_card'),false);
});
test('invalid formula quantities and oversized prose reject rather than silently truncate',async()=>{
 for(const patch of [{formula:{duration_minutes:1.5}},{formula:{duration_minutes:0}},{formula:{duration_minutes:1441}},{notes:'x'.repeat(4001)},{cautions:null}]){const f=fixture();assert.equal((await f.run({...f.body,patch})).status,400);assert.equal(f.calls.length,0);}
});
test('private database errors are allowlisted and exact incident references survive',async()=>{
 for(const [failure,status,code] of [['CLIENT_CHANGED',409,'CLIENT_CHANGED'],['CLIENT_ACCESS_DENIED',403,'CLIENT_ACCESS_DENIED'],['database error includes private formula and customer name',500,'CLIENT_UNAVAILABLE'],['CLIENT_PRIVATE_CUSTOMER_NAME',500,'CLIENT_UNAVAILABLE']]){const f=fixture({failure});const response=await f.run();const data=await response.json();assert.equal(response.status,status);assert.equal(data.request_id,reference);assert.equal(response.headers.get('x-request-id'),reference);assert.equal(f.events[0].error.message,code);assert.doesNotMatch(JSON.stringify(data),/private formula|customer name/);}
 const f=fixture({authError:'Unauthorized'});assert.equal((await f.run()).status,401);assert.equal(f.calls.length,0);
});
test('private photo bytes require a fresh authorized path and bypass public image URLs/caches',async()=>{
 const f=fixture();const response=await f.photo();assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(await response.text(),'synthetic');
 const foreignPath=fixture({photoPath:`business-B/${booking}/${operation}.webp`});assert.equal((await foreignPath.photo()).status,500);assert.equal(foreignPath.calls.some(c=>c.download),false);
 const denied=fixture({failure:'CLIENT_ACCESS_DENIED'});assert.equal((await denied.photo()).status,403);assert.equal(denied.calls.some(c=>c.download),false);
});

test('malformed private photo returns a safe validation response before storage or metadata writes',async()=>{
 const f=fixture();const response=await f.upload();assert.equal(response.status,400);assert.equal((await response.json()).code,'CLIENT_INVALID_IMAGE');assert.equal(f.calls.filter(c=>c.name==='record_business_client_photo').length,0);assert.equal(f.events[0].error.message,'CLIENT_INVALID_IMAGE');
});
