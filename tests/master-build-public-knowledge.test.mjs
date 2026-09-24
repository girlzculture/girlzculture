import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const {searchPublishedKnowledge,publishedKnowledgeTranslationSources}=loadNodeTypescript(process.cwd())('src/lib/publishedKnowledgeServer.ts');
test('customer guidance uses only allowlisted public pages and published exact-source translations in four languages',async()=>{
 const answer='The deposit is displayed before booking.';
 for(const [locale,query,translated]of [['en','deposit',answer],['fr','acompte','L’acompte est affiché avant la réservation.'],['es','depósito','El depósito se muestra antes de reservar.'],['zh-CN','订金','预订前会显示订金。']]){
  const reads=[],filters=[];
  const admin={rpc:async(name,args)=>{assert.equal(name,'get_public_content_page');reads.push(args.p_slug);return {data:args.p_slug==='help'?{slug:'help',title:'Help',sections:[{title:'Deposit',body:answer},{title:'Hidden',body:'PRIVATE_DRAFT',is_visible:false}]}:args.p_slug==='faq'?{slug:'salon/foreign',hero_subtitle:'PRIVATE_FOREIGN deposit'}:null};},from(table){assert.equal(table,'translation_entries');const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},then(resolve){return Promise.resolve({data:[{source_text:answer,translated_text:translated},{source_text:'Deposit',translated_text:query}]}).then(resolve);}};return q;}};
  const result=await searchPublishedKnowledge({admin},query,locale);
  assert.deepEqual(reads,['help','faq','how-it-works','pricing','terms','privacy']);
  assert.equal(result.total,1);assert.equal(result.matches[0].answer,translated);assert.equal(result.matches[0].language,locale);
  assert.equal(result.matches[0].href,'/help');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
  if(locale!=='en'){assert.deepEqual(filters.slice(0,2),[['locale',locale],['status','Published']]);assert.ok(filters[2][1].every(source=>!source.includes('PRIVATE')));}
 }
});
test('a public knowledge failure propagates instead of inventing platform policy',async()=>{
 await assert.rejects(searchPublishedKnowledge({admin:{rpc:async()=>({error:new Error('fixture unavailable')})}},'deposit'),/fixture unavailable/);
});

test('missing French publication never returns unrelated English fragments for the live deposit question',async()=>{
 const admin={rpc:async(_name,{p_slug})=>({data:p_slug==='help'?{slug:p_slug,title:'Help',hero_title:'Book with clear steps and real confirmation.',hero_subtitle:'Find, compare, book, and receive confirmation without guesswork.',sections:[{title:'FAQ',body:'Can I book without an account?::Yes. Guest booking is available, although an account makes managing appointments easier.'}]}:null}),from(){const q={select(){return q;},eq(){return q;},in(){return q;},then(resolve){return Promise.resolve({data:[]}).then(resolve);}};return q;}};
 const result=await searchPublishedKnowledge({admin},'Comment fonctionne le dépôt pour une réservation ?','fr');
 assert.equal(result.total,0);assert.deepEqual(result.matches,[]);
});

test('French deposit terms find reviewed French guidance; short words cannot match inside unrelated English words',async()=>{
 const page={slug:'help',title:'Help',sections:[{title:'Deposit',body:'Deposits are shown before booking.'},{title:'Search',body:'Find clear answers.'}]};
 const translations=[['Deposit','Acompte'],['Deposits are shown before booking.','L’acompte est affiché avant la réservation.']];
 const admin={rpc:async(_n,{p_slug})=>({data:p_slug==='help'?page:null}),from(){const q={select(){return q;},eq(){return q;},in(){return q;},then(resolve){return Promise.resolve({data:translations.map(([source_text,translated_text])=>({source_text,translated_text}))}).then(resolve);}};return q;}};
 const result=await searchPublishedKnowledge({admin},'Comment fonctionne le dépôt pour une réservation ?','fr');
 assert.equal(result.total,1);assert.equal(result.matches[0].question,'Acompte');assert.equal(result.matches[0].language,'fr');
 assert.equal(result.matches[0].answer,'L’acompte est affiché avant la réservation.');
 assert.equal(result.matches[0].title,'Aide Girlz Culture');
 assert.equal((await searchPublishedKnowledge({admin},'le','en')).total,0);
});

test('Engine exposes only published public excerpts with content-addressed keys and mandatory human-review impact',async()=>{
 let answer='Deposits are shown before booking.';
 const admin={rpc:async(_n,{p_slug})=>({data:p_slug==='help'?{slug:p_slug,title:'Help',sections:[{title:'Deposit',body:answer},{title:'Hidden',body:'PRIVATE_DRAFT',is_visible:false}]}:p_slug==='faq'?{slug:'salon/foreign',hero_subtitle:'PRIVATE_OTHER_BUSINESS'}:null})};
 const before=await publishedKnowledgeTranslationSources({admin});
 const key=Object.keys(before).find(k=>before[k].source===answer);
 assert.match(key,/^knowledge\.[a-f0-9]{64}$/);assert.equal(before[key].impact,'booking');
 assert.doesNotMatch(JSON.stringify(before),/PRIVATE_/);
 answer='A revised published deposit explanation.';
 const after=await publishedKnowledgeTranslationSources({admin});
 assert.equal(after[key],undefined);assert.ok(Object.values(after).some(row=>row.source===answer));
 assert.deepEqual(after,await publishedKnowledgeTranslationSources({admin}));
});

test('meaningful cancellation stems still match while articles and pronouns do not',async()=>{
 const admin={rpc:async(_n,{p_slug})=>({data:p_slug==='help'?{slug:p_slug,title:'Help',sections:[{title:'Appointments',body:'Cancellation terms are shown before booking.'}]}:null})};
 assert.equal((await searchPublishedKnowledge({admin},'How do I cancel?')).total,1);
 assert.equal((await searchPublishedKnowledge({admin},'us le la')).total,0);
});

test('Engine source discovery cannot register arbitrary business pages or conceal CMS read failure',async()=>{
 await assert.rejects(publishedKnowledgeTranslationSources({admin:{rpc:async()=>({error:new Error('published unavailable')})}}),/published unavailable/);
 const result=await publishedKnowledgeTranslationSources({admin:{rpc:async()=>({data:{slug:'salon/foreign',title:'PRIVATE',hero_subtitle:'PRIVATE'}})}});
 assert.deepEqual(result,{});
});

test('public assistant routes reject private tool arguments, unsupported languages and malformed input before executing',async()=>{
 const calls=[];
 const load=loadNodeTypescript(process.cwd(),{
  '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>({})},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_p,handler)=>handler},
  '@/lib/platformErrors':{rejectRequest(message,status=400){throw Object.assign(new Error(message),{status});},monitoredRouteFailure:async({error})=>Response.json({error:'Invalid public request'},{status:error.status||500})},
  '@/lib/requestSecurity':{cleanText:(value,max)=>String(value||'').trim().slice(0,max),enforceRateLimit(){},rejectBot(){},RateLimitError:class extends Error{},errorResponse:()=>Response.json({}, {status:429})},
  '@/lib/beautyConciergeServer':{runBeautyConcierge:async input=>{calls.push(input);return {salons:[]};},parseConciergeIntent:v=>v},
  '@/lib/publishedKnowledgeServer':{searchPublishedKnowledge:async(...args)=>{calls.push(args);return {matches:[]};}},
 });
 for(const [path,base]of [['search',{prompt:'Find businesses near me',language:'fr'}],['knowledge',{query:'deposit',language:'fr'}]]){
  const {POST}=load(`src/app/api/concierge/${path}/route.ts`);
  for(const body of [{...base,salon_id:'foreign'},{...base,tool:'get_bookings'},{...base,language:'wo'}]){
   const response=await POST(new Request('https://fixture.invalid/api/concierge/'+path,{method:'POST',body:JSON.stringify(body)}));
   assert.equal(response.status,400);assert.match(response.headers.get('content-type'),/application\/json/);
  }
  assert.equal(calls.length,0);
 }
 const {POST}=load('src/app/api/concierge/search/route.ts');
 for(const [prompt,status]of [['{',400],['hello '.repeat(101),413]])assert.equal((await POST(new Request('https://fixture.invalid/api/concierge/search',{method:'POST',body:JSON.stringify({prompt,language:'en'})}))).status,status);
 assert.equal(calls.length,0);
 const result=await POST(new Request('https://fixture.invalid/api/concierge/search',{method:'POST',body:JSON.stringify({prompt:'Find businesses',language:'zh-CN',latitude:40.81,longitude:-73.94})}));
 assert.equal(result.status,200);assert.equal(calls.length,1);assert.equal(calls[0].language,'zh-CN');assert.deepEqual(calls[0].origin,{lat:40.81,lng:-73.94});
});
