import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';

function fixture(){
 let body='Deposits are shown before booking.';let cmsUnavailable=false;
 const writes=[];const stored=[];
 const admin={rpc:async(_name,{p_slug})=>{if(cmsUnavailable)throw Error('CMS unavailable');return {data:p_slug==='help'?{slug:p_slug,title:'Help',sections:[{title:'Deposit',body}]}:null};},from(table){
  const filters=[];let write;
  const result=()=>{let data=table==='supported_locales'?[{locale:'en',is_default:true},{locale:'fr'}]:table==='translation_entries'?stored:[];
   data=data.filter(row=>filters.every(([key,value])=>row[key]===value));return {data:write?[write]:data};};
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},insert(row){write=row;writes.push({table,row});return q;},upsert(row){write=row;writes.push({table,row});return q;},update(row){write=row;writes.push({table,row});return q;},single:async()=>({data:result().data[0]}),maybeSingle:async()=>({data:result().data[0]||null}),then(resolve){return Promise.resolve(result()).then(resolve);}};return q;
 }};
 const load=loadNodeTypescript(process.cwd(),{
  '@/lib/supabaseAdmin':{requireAdminPermission:async(_r,permission)=>{assert.equal(permission,'content');return {admin,user:{id:'fixture-admin'}};}},
  '@/lib/operationalMonitoring':{noteOperationalFailure(){},routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_p,h)=>h},
  '@/lib/requestSecurity':{cleanText:(v,n)=>String(v||'').trim().slice(0,n),errorResponse:error=>Response.json({error:error.message},{status:400})},
  '@/lib/aiAutomationServer':{generateTranslationDraft(){throw new Error('High-impact text must never call a provider');}},
  '@/lib/translationProviderErrors':{translationProviderFailure:()=>null},
  '@/lib/platformErrors':{},'next/cache':{revalidatePath(){}},
 });
 return {route:load('src/app/api/admin/engine/translations/route.ts'),writes,stored,setBody(value){body=value;},unavailableCms(){cmsUnavailable=true;}};
}
const request=body=>new Request('https://fixture.invalid/api/admin/engine/translations',{method:'PATCH',body:JSON.stringify(body)});

test('existing Engine lists current published Help sources and saves reviewed translations through its normal history workflow',async()=>{
 const f=fixture();const response=await f.route.GET(new Request('https://fixture.invalid/api/admin/engine/translations?locale=fr'));
 assert.equal(response.status,200);
 const entry=(await response.json()).entries.find(row=>row.source_text==='Deposits are shown before booking.');
 assert.ok(entry);assert.equal(entry.status,'Missing');assert.equal(entry.impact_level,'booking');
 const draft={translation_key:entry.translation_key,locale:'fr',translated_text:'L’acompte est affiché avant la réservation.',version:0};
 const blocked=await f.route.PATCH(request({...draft,action:'publish'}));
 assert.equal(blocked.status,400);assert.match((await blocked.json()).error,/human review/);assert.equal(f.writes.length,0);
 const published=await f.route.PATCH(request({...draft,action:'publish',confirm_review:true}));
 assert.equal(published.status,200);
 assert.equal(f.writes[0].row.status,'Published');assert.equal(f.writes[0].row.source_text,entry.source_text);
 assert.equal(f.writes[0].row.reviewed_by,'fixture-admin');assert.equal(f.writes[1].row.action,'translation_published');
});

test('withdrawn or changed Help cannot publish an obsolete source, including an existing translation ID',async()=>{
 const f=fixture();const response=await f.route.GET(new Request('https://fixture.invalid/api/admin/engine/translations?locale=fr'));
 const entry=(await response.json()).entries.find(row=>row.source_text==='Deposits are shown before booking.');
 f.stored.push({...entry,id:'old-entry',version:1});f.setBody('Updated public guidance.');
 const result=await f.route.PATCH(request({id:'old-entry',version:1,action:'publish',confirm_review:true,translated_text:'Old translation'}));
 assert.equal(result.status,400);assert.match((await result.json()).error,/source changed/);assert.equal(f.writes.length,0);
 const imported=await f.route.PATCH(request({action:'bulk_import',entries:[{translation_key:entry.translation_key,locale:'fr',translated_text:'Old translation'}]}));
 assert.equal(imported.status,400);assert.equal(f.writes.length,0);
});

test('Engine retains human review for provider-generated Help translations and denies arbitrary sources',async()=>{
 const f=fixture();const response=await f.route.GET(new Request('https://fixture.invalid/api/admin/engine/translations?locale=fr'));
 const entry=(await response.json()).entries.find(row=>row.source_text==='Deposits are shown before booking.');
 const result=await f.route.PATCH(request({action:'generate_draft',translation_key:entry.translation_key,locale:'fr'}));
 assert.equal(result.status,400);assert.match((await result.json()).error,/reviewed by a person/);assert.equal(f.writes.length,0);
 const invalid=await f.route.PATCH(request({action:'save_draft',translation_key:'knowledge.foreign-business',locale:'fr',translated_text:'Private text'}));
 assert.equal(invalid.status,400);assert.equal(f.writes.length,0);
});

test('ordinary interface translation saves do not depend on published Help availability',async()=>{
 const f=fixture();const response=await f.route.GET(new Request('https://fixture.invalid/api/admin/engine/translations?locale=fr'));
 const entry=(await response.json()).entries.find(row=>!row.translation_key.startsWith('knowledge.')&&row.impact_level==='standard');
 assert.ok(entry);f.unavailableCms();
 const result=await f.route.PATCH(request({action:'save_draft',translation_key:entry.translation_key,locale:'fr',translated_text:'Brouillon de test',version:0}));
 assert.equal(result.status,200);assert.equal(f.writes[0].row.status,'Draft');assert.equal(f.writes[0].row.source_text,entry.source_text);
});
