import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
function loadDemo(file,query='',locale='en') {
 const cache=new Map();
 const load=relative=>{
  const target=path.resolve(relative); if(cache.has(target))return cache.get(target);
  const exports={};cache.set(target,exports);
  const code=ts.transpileModule(readFileSync(target,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const resolve=name=>{
   if(name==='next/navigation')return {useSearchParams:()=>new URLSearchParams(query)};
   if(name==='next/link')return {__esModule:true,default:({children,...props})=>{delete props.prefetch;delete props.scroll;return React.createElement('a',props,children);}};
   if(name==='@/components/dashboard/WorkspaceCalendar')return {__esModule:true,default:()=>React.createElement('section',{'aria-label':'Sample appointment calendar'})};
   if(name==='@/components/i18n/LocaleProvider')return {useI18n:()=>({locale})};
   if(name.startsWith('@/'))return load('src/'+name.slice(2)+(['.ts','.tsx',''].find(ext=>existsSync('src/'+name.slice(2)+ext))??''));
   if(name.startsWith('.'))return load(path.resolve(path.dirname(target),name)+(['.ts','.tsx',''].find(ext=>existsSync(path.resolve(path.dirname(target),name)+ext))??''));
   return require(name);
  };
  new Function('exports','require',code)(exports,resolve);return exports;
 };
 return load(file);
}

test('business demo renders four distinct selectable hair-business scenarios instead of one generic studio',()=>{
 const Component=loadDemo('src/components/dashboard/DemoBusinessWorkspace.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Component));
 const selector=html.match(/<select[^>]*id="demo-scenario"[^>]*>([\s\S]*?)<\/select>/)?.[1]||'';
 assert.equal((selector.match(/<option\b/g)||[]).length,4,'The actual demo component must expose four isolated scenarios');
});

const core=loadDemo('src/components/dashboard/demo/businessDemoScenarios.ts');
const {BUSINESS_DEMO_SCENARIOS:scenarios,resolveDemoSelection,demoDestination,demoSummary,demoSchedule}=core;
const {BUSINESS_DEMO_COPY:copy}=loadDemo('src/i18n/business-demo-copy.ts');

test('each sample model has its own names, valid assignments and non-overlapping professional schedule',()=>{
 assert.equal(new Set(scenarios.map(s=>s.name)).size,4);
 const ids=new Set();
 for(const scenario of scenarios){
  assert.ok(scenario.services.length>=3);assert.ok(scenario.team.length>=1);assert.ok(scenario.appointments.length>=6);
  for(const item of [...scenario.services,...scenario.team,...scenario.appointments,...scenario.blocks]){assert.ok(!ids.has(item.id));ids.add(item.id);}
  for(const service of scenario.services){assert.ok(Number.isSafeInteger(service.priceCents)&&service.priceCents>0);assert.ok(service.minutes>0);assert.ok(service.professionalIds.length);for(const id of service.professionalIds)assert.ok(scenario.team.some(p=>p.id===id));}
  for(const appointment of scenario.appointments){const service=scenario.services.find(s=>s.id===appointment.serviceId);assert.ok(service);assert.ok(service.professionalIds.includes(appointment.professionalId));assert.match(appointment.client,/^Sample client /);}
  for(const person of scenario.team){
   const events=demoSchedule(scenario,copy.en,person.id);
   for(let index=0;index<events.length;index++){
    const event=events[index];assert.ok(event.start.startsWith('2026-09-'));assert.ok(Date.parse(event.start)>=Date.parse('2026-09-14T00:00:00-04:00'));assert.ok(Date.parse(event.end)<=Date.parse('2026-09-21T00:00:00-04:00'));assert.ok(Date.parse(event.end)>Date.parse(event.start));
    assert.equal(event.href,undefined);if(index)assert.ok(Date.parse(events[index-1].end)<=Date.parse(event.start),`${scenario.id}/${person.id} must not overlap`);
   }
  }
 }
});

test('sample totals derive from the displayed appointments and exact menu amounts, excluding blocks',()=>{
 const expected=[[6,44000,405],[7,145000,1560],[6,50500,450],[6,74500,495]];
 scenarios.forEach((scenario,index)=>{const result=demoSummary(scenario);assert.deepEqual([result.appointments,result.valueCents,result.minutes],expected[index]);assert.equal(result.pending,1);});
 const changed=structuredClone(scenarios[0]);changed.services[0].priceCents+=100;
 assert.equal(demoSummary(changed).valueCents,demoSummary(scenarios[0]).valueCents+200);
 changed.blocks=[];assert.deepEqual(demoSummary(changed),demoSummary({...changed,blocks:scenarios[0].blocks}));
});

test('professional filtering never includes another sample roster and travel remains reserved non-sale time',()=>{
 const braid=scenarios[1], mobile=scenarios[3];
 const own=demoSchedule(braid,copy.en,'braid-maya');assert.equal(own.length,4);assert.ok(own.every(e=>e.subtitle.endsWith('Maya')));
 assert.deepEqual(demoSchedule(braid,copy.en,'event-ren'),[]);
 const travel=demoSchedule(mobile,copy.en).filter(e=>e.kind==='unavailable');assert.equal(travel.length,2);assert.ok(travel.every(e=>e.title===copy.en.travel));
 assert.equal(demoSummary(mobile).appointments,6);
});

test('untrusted URL choices normalize to known demo-only destinations without injecting links or identities',()=>{
 for(const input of [null,undefined,'','https://example.com','../../salon/real-business','<script>','braiding-team&salon_id=other']){
  assert.equal(resolveDemoSelection(input,input).scenario.id,'curl-studio');assert.equal(resolveDemoSelection(input,input).view,'overview');
  assert.equal(demoDestination(input,input),'/site-access/business-demo?scenario=curl-studio&view=overview');
 }
 assert.equal(demoDestination('braiding-team','services'),'/site-access/business-demo?scenario=braiding-team&view=services');
});

test('demo copy has complete four-locale parity and actual rendered disclosure/navigation in every locale',()=>{
 const keys=Object.keys(copy.en).sort();
 for(const locale of ['en','fr','es','zh-CN']){
  assert.deepEqual(Object.keys(copy[locale]).sort(),keys);assert.ok(Object.values(copy[locale]).every(v=>typeof v==='string'&&v.trim()));
  const Component=loadDemo('src/components/dashboard/DemoBusinessWorkspace.tsx','scenario=loc-studio&view=services',locale).default;
  const html=renderToStaticMarkup(React.createElement(Component));
  assert.ok(html.includes(copy[locale].choose));assert.ok(html.includes(copy[locale].notice));assert.ok(html.includes(copy[locale].menu));assert.match(html,/Loc &amp; Scalp Studio/);assert.ok(!html.includes('Knotless braids'));assert.ok(!html.includes('Sample client'));
 }
});

test('demo source stays disconnected and ordinary marketplace source does not import scenarios',()=>{
 for(const file of ['src/components/dashboard/DemoBusinessWorkspace.tsx','src/components/dashboard/demo/businessDemoScenarios.ts']){
  const source=readFileSync(file,'utf8');assert.doesNotMatch(source,/\bfetch\s*\(|supabase|stripe|localStorage|sessionStorage|\/api\//i);
 }
 const route=readFileSync('src/app/site-access/business-demo/page.tsx','utf8');assert.match(route,/index: false/);assert.match(route,/follow: false/);
 const market=readFileSync('src/app/site-access/page.tsx','utf8');assert.doesNotMatch(market,/businessDemoScenarios|DemoBusinessWorkspace/);
});
