import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
test('professional questions and follow-ups resolve only the authenticated business catalog before model input',async()=>{
 const tables={stylists:[{id:'pa',salon_id:'A',name:'Awa',assigned_service_ids:['sa','sb']},{id:'pb',salon_id:'B',name:'Private B',assigned_service_ids:['sb']}],styles:[{id:'sa',salon_id:'A',name:'Braids A',is_draft:false},{id:'sb',salon_id:'B',name:'Private service B',is_draft:false}]};
 const calls=[];
 const admin={from(table){const filters=[];let fields=[];const q={select(columns){fields=columns.split(',');calls.push({table,fields});return q;},eq(key,value){filters.push(row=>row[key]===value);return q;},is(key,value){filters.push(row=>(row[key]??null)===value);return q;},ilike(key,value){const needle=value.slice(1,-1).toLowerCase();filters.push(row=>String(row[key]).toLowerCase().includes(needle));return q;},order(){return q;},limit(){return q;},then(resolve,reject){const rows=tables[table].filter(row=>filters.every(filter=>filter(row)));return Promise.resolve({data:rows.map(row=>Object.fromEntries(fields.map(key=>[key,row[key]]))),count:rows.length,error:null}).then(resolve,reject);}};return q;}};
 const {readOwnerOperation}=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/bookingAvailabilityServer':{}})('src/lib/ownerReadServer.ts');
 for(const [business,name,foreignName,ownId] of [['A','Awa','Private B','sa'],['B','Private B','Awa','sb']]){
  const context={admin,salon:{id:business},isOwner:true,user:{id:'owner-'+business}};
  for(const query of ['',name]){const result=await readOwnerOperation(context,'get_professionals',{query});const text=JSON.stringify(result);assert.equal(text.includes(foreignName),false);assert.equal(result.professionals[0].name,name);assert.deepEqual(Array.from(result.professionals[0].assigned_service_ids),[ownId]);assert.equal(result.service_dictionary.length,1);}
  const forged=await readOwnerOperation(context,'get_professionals',{query:foreignName,salon_id:business==='A'?'B':'A'});assert.equal(forged.professionals.length,0);
 }
 const before=calls.length;
 const restricted=await readOwnerOperation({admin,salon:{id:'A'},isOwner:false,teamMember:{permissions:{stylists:true,styles:false}},user:{id:'staff'}},'get_professionals',{query:''});
 assert.equal('service_dictionary' in restricted,false);assert.equal('assigned_service_ids' in restricted.professionals[0],false);
 assert.equal(calls.slice(before).some(call=>call.table==='styles'),false,'catalog is not retrieved for a role lacking permission');
});
