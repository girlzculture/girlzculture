import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const {promotionLocalDateTime, promotionDateWindow}=load('src/lib/promotionDateTime.ts');
const zone='America/New_York';

test('offer instants roundtrip unchanged across device zones and DST seasons, preserving seconds',()=>{
 const prior=process.env.TZ;
 try{for(const device of ['UTC','America/New_York','Europe/Paris','Asia/Shanghai']){
  process.env.TZ=device;
  for(const [saved,display] of [['2026-07-01T14:00:12.345Z','2026-07-01T10:00'],['2026-01-15T14:00:56.789Z','2026-01-15T09:00']]){
   assert.equal(promotionLocalDateTime(saved,zone),display);
   assert.deepEqual(promotionDateWindow(display,'',zone,{starts_at:saved,timezone:zone}),{starts_at:saved,ends_at:null,timezone:zone});
  }
 }}finally{if(prior===undefined)delete process.env.TZ;else process.env.TZ=prior;}
});
test('edited dates use the declared zone, including a different zone and blank bounds',()=>{
 assert.deepEqual(promotionDateWindow('2026-07-01T10:00','2026-07-01T11:00',' America/New_York '),{starts_at:'2026-07-01T14:00:00.000Z',ends_at:'2026-07-01T15:00:00.000Z',timezone:zone});
 assert.equal(promotionDateWindow('2026-01-15T09:00','','Europe/Paris',{starts_at:'2026-01-15T14:00:00Z',timezone:zone}).starts_at,'2026-01-15T08:00:00.000Z');
 assert.deepEqual(promotionDateWindow('','','UTC'),{starts_at:null,ends_at:null,timezone:'UTC'});
});
test('new spring-gap and repeated-hour selections reject, but both saved repeated-hour instants remain exact',()=>{
 assert.throws(()=>promotionDateWindow('2026-03-08T02:30','',zone),/does not exist/);
 assert.throws(()=>promotionDateWindow('2026-11-01T01:30','',zone),/occurs twice/);
 for(const saved of ['2026-11-01T05:30:11.111Z','2026-11-01T06:30:22.222Z']){
  assert.equal(promotionLocalDateTime(saved,zone),'2026-11-01T01:30');
  assert.equal(promotionDateWindow('2026-11-01T01:30','',zone,{starts_at:saved,timezone:zone}).starts_at,saved);
 }
});
test('invalid zones, invalid dates and reversed or equal ranges cannot be saved',()=>{
 for(const invalid of ['','Invalid/Zone'])assert.throws(()=>promotionDateWindow('2026-01-01T12:00','',invalid),/valid offer time zone/);
 for(const invalid of ['2026-02-30T12:00','2026-07-01T25:00','bad','2026-07-01'])assert.throws(()=>promotionDateWindow(invalid,'',zone),/valid offer date/);
 assert.throws(()=>promotionDateWindow('2026-07-01T11:00','2026-07-01T10:00',zone),/end after/);
 assert.throws(()=>promotionDateWindow('2026-07-01T10:00','2026-07-01T10:00',zone),/end after/);
 assert.throws(()=>promotionDateWindow('','',zone,{starts_at:'invalid',timezone:zone}),/valid offer date/);
});

function editor(){
 const source=readFileSync('src/components/owner/SalonPromotionsManager.tsx','utf8');
 const ast=ts.createSourceFile('editor.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let submit;
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='submit')submit=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(submit);
 const editing={id:'own-offer',timezone:zone,starts_at:'2026-07-01T14:00:12.345Z',ends_at:'2026-07-05T15:00:00.000Z'};
 const values={title:'Updated own title',public_headline:'Own offer',promotion_type:'percentage',discount_value:'10',status:'Draft',starts_at:'2026-07-01T10:00',ends_at:'2026-07-05T11:00',timezone:zone};
 const saves=[],errors=[],routes=[];let resets=0,rows=[editing],resolve;
 const gate=new Promise(done=>{resolve=done;});const form={reset(){resets++;}};
 class FormData{constructor(value){assert.equal(value,form);}get(key){return values[key]??null;}}
 const handler=new Function('FormData','promotionDateWindow','saveRecord','setPromotions','editing','scope','selectedTargets','timeZone','setEditingId','router','setDateError',ts.transpileModule(submit,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return submit;')(
  FormData,promotionDateWindow,async(table,payload,id)=>{saves.push({table,payload,id});return gate;},update=>{rows=update(rows);},editing,'salon',[],zone,()=>{}, {replace:value=>routes.push(value)},value=>errors.push(value));
 return {values,saves,errors,routes,editing,rows:()=>rows,resets:()=>resets,resolve,dispatch(){const event={preventDefault(){},currentTarget:form};const pending=handler(event);event.currentTarget=null;return pending;}};
}
test('actual editor async success preserves date instants and does not read a cleared event target or reset saved values',async()=>{
 const f=editor(),pending=f.dispatch();assert.equal(f.saves.length,1);
 assert.equal(f.saves[0].payload.starts_at,f.editing.starts_at);assert.equal(f.saves[0].payload.ends_at,f.editing.ends_at);
 assert.equal(f.saves[0].payload.title,'Updated own title');assert.equal(f.saves[0].payload.discount_value,'10');assert.equal(f.saves[0].payload.status,'Draft');assert.equal(f.saves[0].payload.is_active,false);
 f.resolve({...f.editing,title:'Updated own title'});await pending;
 assert.equal(f.resets(),0);assert.equal(f.rows()[0].title,'Updated own title');assert.deepEqual(f.routes,['/salon/dashboard/promotions/own-offer']);
});
test('actual editor failed save retains input and row; invalid date selection does not call save',async()=>{
 const failed=editor(),pending=failed.dispatch();failed.resolve(null);await pending;
 assert.equal(failed.resets(),0);assert.equal(failed.values.title,'Updated own title');assert.equal(failed.rows()[0],failed.editing);assert.deepEqual(failed.routes,[]);
 const invalid=editor();invalid.values.starts_at='2026-03-08T02:30';await invalid.dispatch();assert.equal(invalid.saves.length,0);assert.match(invalid.errors[0],/does not exist/);assert.equal(invalid.values.starts_at,'2026-03-08T02:30');
});
test('offer date validation copy has four-locale key and placeholder parity',()=>{
 const {BUSINESS_MARKETING_SOURCE_MESSAGES:messages}=load('src/i18n/business-marketing-source-catalog.ts');
 const source=readFileSync('src/lib/promotionDateTime.ts','utf8');
 const keys=[...source.matchAll(/(?:throw )?Error\("([^"]+)"\)/g)].map(match=>match[1]);keys.push('Offer dates use this time zone.');
 for(const key of new Set(keys))for(const locale of ['fr','es','zh-CN']){assert.ok(messages[locale][key],locale+': '+key);assert.notEqual(messages[locale][key],key);assert.deepEqual(messages[locale][key].match(/\{[^}]+\}/g)||[],key.match(/\{[^}]+\}/g)||[]);}
});
