import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const {INITIAL_APPLICATION_FIELDS,applicationProgressInput,applicationSetup,validateApplicationDetails}=loadNodeTypescript(process.cwd())('src/lib/applicationProgress.ts');
const fields=()=>({...INITIAL_APPLICATION_FIELDS,operator_type:'solo',location_type:'home',public_neighborhood:'Bedford-Stuyvesant',services_offered:'Braids',price_range:'From $80',insurance:'no'});
const draft=()=>({fields:fields(),documents:[],plan:'Solo',locale:'fr',step:2,revision:null,entry_mode:'form'});
test('application resumes all fields and four-language selection without requiring insurance',()=>{const input=applicationProgressInput(draft());assert.equal(input.fields.public_neighborhood,'Bedford-Stuyvesant');assert.equal(input.locale,'fr');assert.equal(validateApplicationDetails(input.fields,input.plan).insurance,'no');});
test('draft ownership and approval fields cannot be injected',()=>{for(const extra of [{user_id:'another'},{fields:{...fields(),approved:true}},{fields:{...fields(),subscription_status:'active'}}])assert.throws(()=>applicationProgressInput({...draft(),...extra}));});
test('operator types choose appropriate plans and retain shared-suite setup',()=>{assert.equal(applicationSetup(fields()),'solo_professional');assert.equal(applicationSetup({...fields(),location_type:'chair_suite'}),'shared_suite_booth');assert.throws(()=>validateApplicationDetails(fields(),'Starter'));assert.throws(()=>validateApplicationDetails({...fields(),operator_type:'team'},'Solo'));});
test('mobile fee is explicit, bounded and retained as integer cents',()=>{const f={...fields(),location_type:'mobile',travel_radius_miles:'10',travel_fee:'12.50'};assert.equal(validateApplicationDetails(f,'Solo Pro').travel_fee_cents,1250);for(const change of [{travel_fee:''},{travel_fee:'-1'},{travel_radius_miles:'101'},{travel_radius_miles:'NaN'}])assert.throws(()=>validateApplicationDetails({...f,...change},'Solo'));});
test('draft does not accept unsupported languages, oversized content or stale revision shapes',()=>{for(const extra of [{locale:'wo'},{step:99},{revision:0},{fields:{...fields(),services_offered:'a'.repeat(2001)}},{documents:['../other-owner/photo']}])assert.throws(()=>applicationProgressInput({...draft(),...extra}));});

const {readApplicationRequest}=loadNodeTypescript(process.cwd())('src/lib/applicationRequest.ts');
test('draft stream rejects oversized, invalid UTF-8 and malformed JSON without trusting Content-Length',async()=>{
 for(const body of ['{','x'.repeat(65537),new Uint8Array([255,254])])await assert.rejects(readApplicationRequest(new Request('https://example.test',{method:'POST',body})),error=>['INPUT_TOO_LONG','INVALID_INPUT'].includes(error.code));
 assert.deepEqual(await readApplicationRequest(new Request('https://example.test',{method:'POST',body:JSON.stringify({name:'中文'})})),{name:'中文'});
});
