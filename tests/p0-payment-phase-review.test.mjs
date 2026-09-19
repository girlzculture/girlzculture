import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const load=()=>loadNodeTypescript(process.cwd())('src/lib/subscriptionPaymentPhaseReview.ts');
const version='2025-06-30.basil';
function phase(start,end,method){return {start_date:start,end_date:end,default_payment_method:method,add_invoice_items:[],application_fee_percent:null,billing_cycle_anchor:null,billing_thresholds:null,collection_method:null,currency:'usd',default_tax_rates:[],description:null,discounts:[],invoice_settings:null,items:[{price:'price_A',plan:'price_A',quantity:1,billing_thresholds:null,discounts:[],metadata:{},tax_rates:[]}],metadata:{},on_behalf_of:null,proration_behavior:'create_prorations',transfer_data:null,trial_end:null};}
function fixture(){return {id:'sub_sched_A',object:'subscription_schedule',application:null,billing_mode:{type:'classic'},canceled_at:null,completed_at:null,created:100,current_phase:{start_date:200,end_date:300},customer:'cus_A',default_settings:{application_fee_percent:null,billing_cycle_anchor:'automatic',billing_thresholds:null,collection_method:'charge_automatically',default_payment_method:'pm_default',description:null,invoice_settings:{account_tax_ids:null,days_until_due:null,issuer:{type:'self'}},on_behalf_of:null,transfer_data:null},end_behavior:'release',livemode:false,metadata:{agreement:'unchanged'},phases:[phase(100,200,'pm_past'),phase(200,300,'pm_current'),phase(300,400,null),phase(400,500,'pm_future')],released_at:null,released_subscription:null,status:'active',subscription:'sub_A',test_clock:null};}
function input(source=fixture()){
 const api=load(),emptyDiscounts={};for(let i=1;i<source.phases.length;i++){emptyDiscounts[`phases[${i}].discounts`]='inherit';emptyDiscounts[`phases[${i}].items[0].discounts`]='none';}
 return {source,apiVersion:version,customerId:'cus_A',subscriptionId:'sub_A',livemode:false,targetMethodId:'pm_new',now:250,sourceIntent:{sourceFingerprint:api.paymentPhaseSourceFingerprint(source,version),emptyDiscounts}};
}
test('explicit phase review capability prepares only the approved method changes without enabling provider writes',()=>{
 const {preparePaymentPhaseReview}=load(),i=input(),before=structuredClone(i.source),out=preparePaymentPhaseReview(i);
 assert.equal(out.api_version,version);assert.equal(out.application_ready,false);assert.equal(out.request.proration_behavior,'none');assert.equal(out.request.phases.length,3);assert.equal(out.expected_state.phases[0].default_payment_method,'pm_past');assert.equal(out.expected_state.phases[1].default_payment_method,'pm_new');assert.equal(out.expected_state.phases[2].default_payment_method,null);assert.equal(out.expected_state.phases[3].default_payment_method,'pm_new');assert.equal(out.expected_state.default_settings.default_payment_method,'pm_new');assert.deepEqual(i.source,before);
});
const prepare=(value)=>load().preparePaymentPhaseReview(value);
function tax(){return {id:'txr_A',object:'tax_rate',active:true,country:'US',created:50,description:'Recorded sales tax',display_name:'Tax',effective_percentage:8.875,flat_amount:null,inclusive:false,jurisdiction:'New York',jurisdiction_level:'state',livemode:false,metadata:{source:'saved'},percentage:8.875,rate_type:'percentage',state:'NY',tax_type:'sales_tax'};}
function removeMethods(value){const copy=structuredClone(value);delete copy.default_settings.default_payment_method;for(const phase of copy.phases)delete phase.default_payment_method;return copy;}
function rejectMutation(change,code){const value=input();change(value);assert.throws(()=>prepare(value),new RegExp(code));}
function sourceChanged(change){const source=fixture();change(source);return input(source);}

test('all commercial fields survive a rich phase mapping and the only expected-state diff is explicit method IDs',()=>{
 const source=fixture(),p=source.phases[1];
 Object.assign(p,{application_fee_percent:4.25,automatic_tax:{enabled:true,disabled_reason:null,liability:{type:'account',account:'acct_tax'}},billing_cycle_anchor:'automatic',billing_thresholds:{amount_gte:5500,reset_billing_cycle_anchor:false},collection_method:'send_invoice',description:'Existing agreement',default_tax_rates:[tax()],discounts:[{coupon:null,discount:'di_saved',promotion_code:null}],invoice_settings:{account_tax_ids:['txi_existing'],days_until_due:15,issuer:{type:'account',account:'acct_issuer'}},metadata:{agreement:'existing',remove_at_transition:''},on_behalf_of:'acct_owner',transfer_data:{amount_percent:20.75,destination:'acct_recipient'},trial_end:275,proration_behavior:'always_invoice'});
 p.items=[{price:'price_existing',plan:'price_existing',quantity:3,billing_thresholds:{usage_gte:10},discounts:[{coupon:null,discount:'di_item',promotion_code:null}],metadata:{service:'same'},tax_rates:[tax()]}];
 p.add_invoice_items=[{price:'price_addition',quantity:2,discounts:[{coupon:'existing-coupon',discount:null,promotion_code:null}],tax_rates:[tax()]}];
 source.billing_mode={type:'flexible',updated_at:120};source.end_behavior='cancel';
 const value=input(source);delete value.sourceIntent.emptyDiscounts['phases[1].discounts'];delete value.sourceIntent.emptyDiscounts['phases[1].items[0].discounts'];
 const out=prepare(value),mapped=out.request.phases[0];
 assert.deepEqual(removeMethods(out.expected_state),removeMethods(source));
 assert.deepEqual(out.request.default_settings,{default_payment_method:'pm_new'});
 assert.deepEqual(Object.keys(out.request).sort(),['default_settings','phases','proration_behavior']);
 assert.equal(mapped.start_date,200);assert.equal(mapped.end_date,300);assert.equal(mapped.trial_end,275);assert.equal(mapped.proration_behavior,'always_invoice');assert.equal(out.request.proration_behavior,'none');
 assert.equal(mapped.application_fee_percent,4.25);assert.equal(mapped.collection_method,'send_invoice');assert.equal(mapped.currency,'usd');assert.equal(mapped.description,'Existing agreement');assert.equal(mapped.billing_cycle_anchor,'automatic');
 assert.deepEqual(mapped.automatic_tax,{enabled:true,liability:{type:'account',account:'acct_tax'}});
 assert.deepEqual(mapped.billing_thresholds,{amount_gte:5500,reset_billing_cycle_anchor:false});
 assert.deepEqual(mapped.invoice_settings,p.invoice_settings);assert.deepEqual(mapped.transfer_data,p.transfer_data);assert.equal(mapped.on_behalf_of,'acct_owner');assert.deepEqual(mapped.metadata,p.metadata);
 assert.deepEqual(mapped.default_tax_rates,['txr_A']);assert.deepEqual(mapped.discounts,[{discount:'di_saved'}]);
 assert.deepEqual(mapped.items,[{price:'price_existing',quantity:3,billing_thresholds:{usage_gte:10},discounts:[{discount:'di_item'}],metadata:{service:'same'},tax_rates:['txr_A']}]);
 assert.deepEqual(mapped.add_invoice_items,[{price:'price_addition',quantity:2,discounts:[{coupon:'existing-coupon'}],tax_rates:['txr_A']}]);
 assert.ok(out.remaining_requirements.includes('provider_acceptance_including_invoice_items'));assert.equal(out.application_ready,false);
});

test('null inheritance, empty removal and metered quantity omission are explicit and are never replaced with defaults',()=>{
 const value=sourceChanged(source=>{source.default_settings.default_payment_method=null;delete source.phases[2].items[0].quantity;source.phases[2].items[0].metadata=null;source.phases[2].default_tax_rates=null;});
 const out=prepare(value),inherited=out.request.phases[1];
 assert.equal(Object.hasOwn(out.request,'default_settings'),false);assert.equal(Object.hasOwn(inherited,'default_payment_method'),false);
 assert.equal(out.inherited_schedule_default,true);assert.deepEqual(out.inherited_phase_indices,[2]);assert.equal(out.effective_payment_methods_verified,false);assert.ok(out.remaining_requirements.includes('authoritative_current_subscription_and_effective_defaults'));
 assert.equal(Object.hasOwn(inherited.items[0],'quantity'),false);assert.equal(Object.hasOwn(inherited.items[0],'metadata'),false);
 assert.equal(Object.hasOwn(inherited,'default_tax_rates'),false);assert.equal(Object.hasOwn(inherited,'discounts'),false);assert.equal(inherited.items[0].discounts,'');assert.equal(inherited.items[0].tax_rates,'');
 assert.deepEqual(out.expected_state.phases[2],value.source.phases[2]);
});

test('the original no-discount choice stays distinct from inheritance in request and fingerprint',()=>{
 const inherited=input(),none=input();none.sourceIntent.emptyDiscounts['phases[1].discounts']='none';
 const a=prepare(inherited),b=prepare(none);assert.equal(Object.hasOwn(a.request.phases[0],'discounts'),false);assert.equal(b.request.phases[0].discounts,'');
 assert.equal(a.source_fingerprint,b.source_fingerprint);assert.notEqual(a.request_fingerprint,b.request_fingerprint);
 rejectMutation(value=>{delete value.sourceIntent.emptyDiscounts['phases[1].discounts'];},'DISCOUNT_INTENT_REQUIRED');
 rejectMutation(value=>{value.sourceIntent.emptyDiscounts['phases[0].discounts']='none';},'UNUSED_DISCOUNT_INTENT');
 rejectMutation(value=>{value.sourceIntent.emptyDiscounts['phases[1].discounts']='guess';},'DISCOUNT_INTENT_REQUIRED');
});

test('API version, association, mode, phase transition and source intent are mandatory',()=>{
 for(const change of [i=>i.customerId='cus_other',i=>i.subscriptionId='sub_other',i=>i.livemode=true])rejectMutation(change,'IDENTITY_CONFLICT');
 rejectMutation(i=>i.apiVersion='2026-01-01.unknown','API_VERSION');rejectMutation(i=>i.now=300,'PHASE_TRANSITION');rejectMutation(i=>i.now=199,'PHASE_TRANSITION');
 rejectMutation(i=>i.targetMethodId='card_legacy','UNSUPPORTED_REFERENCE');rejectMutation(i=>i.source.phases[2].items[0].quantity=2,'SOURCE_INTENT_STALE');
});

test('unknown fields at every writable nesting boundary reject rather than being silently omitted',()=>{
 const mutations=[s=>s.future_field=true,s=>s.default_settings.future_field=true,s=>s.phases[1].future_field=true,s=>s.phases[0].future_field=true,s=>s.phases[1].items[0].future_field=true,s=>s.phases[1].metadata={constructor:'bad'},s=>s.billing_mode.future_field=true,s=>s.phases[1].invoice_settings={account_tax_ids:null,days_until_due:null,issuer:{type:'self',future_field:true}},s=>s.phases[1].automatic_tax={enabled:false,disabled_reason:null,liability:{type:'self',future_field:true}},s=>s.phases[1].default_tax_rates=[{...tax(),future_field:true}],s=>s.phases[1].add_invoice_items=[{price:'price_add',quantity:1,discounts:[],future_field:true}]];
 for(const mutate of mutations)assert.throws(()=>prepare(sourceChanged(mutate)),/UNSUPPORTED_FIELD|INVALID_JSON/);
});

test('unrepresentable response fields and expanded references never degrade to an incomplete ID-only request',()=>{
 const mutations=[s=>s.phases[1].default_payment_method={id:'pm_current'},s=>s.phases[1].items[0].price={id:'price_A'},s=>s.phases[1].items[0].plan='price_different',s=>s.phases[1].automatic_tax={enabled:false,disabled_reason:'requires_location_inputs',liability:null},s=>s.phases[1].discounts=[{coupon:'saved',discount:'di_saved',promotion_code:null}],s=>s.phases[1].invoice_settings={account_tax_ids:[{id:'txi_A'}],days_until_due:null,issuer:{type:'self'}},s=>s.phases[1].add_invoice_items=[{price:'price_add',quantity:null,discounts:[]}],s=>s.phases[1].billing_thresholds={amount_gte:null,reset_billing_cycle_anchor:null},s=>s.phases[1].items[0].billing_thresholds={usage_gte:null},s=>s.phases[1].trial_end=300];
 for(const mutate of mutations)assert.throws(()=>prepare(sourceChanged(mutate)),/PAYMENT_PHASE_REVIEW_/);
});

test('manual tax definitions retain ID, mode and full expected readback; foreign mode and duplicate IDs reject',()=>{
 const value=sourceChanged(s=>{s.phases[1].default_tax_rates=[tax()];}),out=prepare(value);
 assert.deepEqual(out.expected_state.phases[1].default_tax_rates,[tax()]);assert.deepEqual(out.request.phases[0].default_tax_rates,['txr_A']);
 assert.throws(()=>prepare(sourceChanged(s=>s.phases[1].default_tax_rates=[{...tax(),livemode:true}])),/TAX_IDENTITY/);
 assert.throws(()=>prepare(sourceChanged(s=>s.phases[1].default_tax_rates=[tax(),tax()])),/DUPLICATE_TAX/);
});

test('source fingerprints are canonical, version-bound, complete and sensitive to commercial or method drift',()=>{
 const api=load(),source=fixture(),reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverse(v)])):value;
 assert.equal(api.paymentPhaseSourceFingerprint(source,version),api.paymentPhaseSourceFingerprint(reverse(source),version));
 for(const mutate of [s=>s.default_settings.default_payment_method='pm_other',s=>s.phases[0].metadata.past='changed',s=>s.phases[3].end_date=501,s=>s.phases[1].items[0].quantity=2,s=>s.metadata.agreement='changed']){const changed=structuredClone(source);mutate(changed);assert.notEqual(api.paymentPhaseSourceFingerprint(source,version),api.paymentPhaseSourceFingerprint(changed,version));}
 assert.equal(prepare(input()).expected_fingerprint,api.paymentPhaseSourceFingerprint(prepare(input()).expected_state,version));
});

test('incomplete, inactive, nonsequential, duplicate or empty phases cannot produce a review',()=>{
 const changes=[s=>delete s.default_settings.default_payment_method,s=>delete s.phases[1].description,s=>s.phases[2].start_date=301,s=>s.current_phase.end_date=299,s=>s.status='released',s=>s.released_at=200,s=>s.phases[1].items=[],s=>s.phases=[],s=>s.phases[1].end_date=200,s=>s.phases.push(structuredClone(s.phases[3]))];
 for(const change of changes)assert.throws(()=>prepare(sourceChanged(change)),/PAYMENT_PHASE_REVIEW_/);
});

test('only actual explicit changes produce a proposal, with exact changed paths and no past-phase writes',()=>{
 const value=input(),out=prepare(value);
 assert.deepEqual(out.changed_paths,['default_settings.default_payment_method','phases[1].default_payment_method','phases[3].default_payment_method']);
 assert.equal(out.inherited_schedule_default,false);assert.deepEqual(out.inherited_phase_indices,[2]);assert.equal(out.effective_payment_methods_verified,false);
 assert.deepEqual(out.request.phases.map(p=>p.start_date),[200,300,400]);
 assert.throws(()=>prepare(sourceChanged(s=>{s.default_settings.default_payment_method='pm_new';s.phases[1].default_payment_method='pm_new';s.phases[3].default_payment_method='pm_new';})),/NO_EXPLICIT_CHANGE/);
});

test('preparation validates plain bounded JSON without running accessors or accepting prototype/array surprises',()=>{
 const api=load();let calls=0;
 const accessor={};Object.defineProperty(accessor,'source',{enumerable:true,get(){calls++;throw new Error('getter ran');}});
 assert.throws(()=>api.paymentPhaseSourceFingerprint(accessor,version),/INVALID_JSON/);assert.equal(calls,0);
 const array=[];Object.defineProperty(array,'0',{enumerable:true,get(){calls++;throw new Error('getter ran');}});
 assert.throws(()=>api.paymentPhaseSourceFingerprint(array,version),/INVALID_JSON/);assert.equal(calls,0);
 for(const value of [undefined,NaN,new Date(),new Array(1),Object.create(Object.create(null)),JSON.parse('{"__proto__":{"admin":true}}'),{bad:Infinity},{bad:undefined}])assert.throws(()=>api.paymentPhaseSourceFingerprint(value,version),/INVALID_JSON/);
 assert.throws(()=>api.paymentPhaseSourceFingerprint({long:'x'.repeat(10001)},version),/INPUT_LIMIT/);
});

test('explicit zero/false settings survive and undocumented null shapes are not silently treated as omission',()=>{
 const value=sourceChanged(s=>{Object.assign(s.phases[1],{application_fee_percent:0,automatic_tax:{enabled:false,disabled_reason:null,liability:null},invoice_settings:{account_tax_ids:[],days_until_due:0,issuer:{type:'self'}},transfer_data:{amount_percent:0,destination:'acct_recipient'}});});
 const mapped=prepare(value).request.phases[0];assert.equal(mapped.application_fee_percent,0);assert.deepEqual(mapped.automatic_tax,{enabled:false});assert.deepEqual(mapped.invoice_settings,{account_tax_ids:'',days_until_due:0,issuer:{type:'self'}});assert.deepEqual(mapped.transfer_data,{amount_percent:0,destination:'acct_recipient'});
 for(const change of [s=>s.phases[1].automatic_tax=null,s=>s.default_settings.invoice_settings=null,s=>s.default_settings.billing_cycle_anchor=null,s=>s.billing_mode.updated_at=null])assert.throws(()=>prepare(sourceChanged(change)),/PAYMENT_PHASE_REVIEW_/);
});
