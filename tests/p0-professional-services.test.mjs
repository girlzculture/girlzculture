import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd());
const {sanitizeSalonRecord}=load('src/lib/salonRecordValidation.ts');
const {professionalOffersService}=load('src/lib/professionalServices.ts');
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('explicit assignment validation preserves null versus none and rejects malformed ids or foreign patch fields',()=>{
 for(const ids of [null,[],[a]])assert.deepEqual(JSON.parse(JSON.stringify(sanitizeSalonRecord('stylists',{assigned_service_ids:ids},false))),{assigned_service_ids:ids});
 assert.equal(sanitizeSalonRecord('stylists',{assigned_service_ids:[a,a.toUpperCase()]},false).assigned_service_ids.length,1);
 for(const ids of ['',{},['foreign'],[null],Array(1001).fill(a)])assert.throws(()=>sanitizeSalonRecord('stylists',{assigned_service_ids:ids},false));
 assert.throws(()=>sanitizeSalonRecord('stylists',{salon_id:a,assigned_service_ids:[]},false));
});
test('public and server eligibility agree on explicit none, archived/draft/inactive and malformed data',()=>{
 for(const assigned_service_ids of [null,undefined,[a]])assert.equal(professionalOffersService({assigned_service_ids},a),true);
 for(const assigned_service_ids of [[],['other'],{},a])assert.equal(professionalOffersService({assigned_service_ids},a),false);
 for(const state of [{is_active:false},{is_draft:true},{archived_at:'2026-01-01'}])assert.equal(professionalOffersService({...state,assigned_service_ids:[a]},a),false);
});
