import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd());
const {completedServiceCounts,popularServiceIds,featuredFirst}=load('src/lib/businessCatalogPerformance.ts');
const {sanitizeSalonRecord}=load('src/lib/salonRecordValidation.ts');
const start=Date.parse('2026-06-20T00:00:00Z'),end=Date.parse('2026-09-18T00:00:00Z');
const base={id:'1',salon_id:'A',style_id:'braids',status:'Completed',appointment_datetime:'2026-09-01T12:00:00Z'};

test('popularity counts distinct completed own-business appointments within the stated period',()=>{
 const records=[base,base,{...base,id:'2'}, {...base,id:'foreign',salon_id:'B'}, {...base,id:'cancelled',status:'Cancelled'}, {...base,id:'test',payment_mode:'test'}, {...base,id:'future',appointment_datetime:'2026-10-01'}, {...base,id:'old',appointment_datetime:'2026-06-19'}, {...base,id:'invalid',appointment_datetime:'bad'}, {...base,id:'end',appointment_datetime:new Date(end).toISOString()}, {...base,id:'start',style_id:'cut',appointment_datetime:new Date(start).toISOString()}];
 assert.deepEqual(JSON.parse(JSON.stringify(completedServiceCounts(records,'A',start,end))),{braids:2,cut:1});
});
test('popular badges require real completed bookings and eligible services; ties are stable',()=>{
 assert.deepEqual([...popularServiceIds({cut:2,braids:2,locs:1,draft:100,unbooked:0},['unbooked','cut','braids','locs'])],['braids','cut','locs']);
 assert.equal(popularServiceIds({},['cut']).size,0);
});
test('owner selections lead the public menu while preserving existing order within each group',()=>{
 const rows=[{id:'a'},{id:'b',is_featured:true},{id:'c'},{id:'d',is_featured:true}];
 assert.deepEqual(Array.from(featuredFirst(rows),r=>r.id),['b','d','a','c']);
 assert.deepEqual(rows.map(r=>r.id),['a','b','c','d']);
});
test('feature updates accept only a typed boolean and never allow a business-id patch',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(sanitizeSalonRecord('styles',{is_featured:true},false))),{is_featured:true});
 assert.throws(()=>sanitizeSalonRecord('styles',{is_featured:'false'},false));
 assert.throws(()=>sanitizeSalonRecord('styles',{salon_id:'B'},false));
});
