import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
function fixture(body,headers={}) {
  const calls=[];
  const load=typescriptLoader(process.cwd(),{}, {URLSearchParams,process:{env:{STRIPE_SECRET_KEY:'fixture-only-secret'}},fetch:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(body),{status:400,headers});}});
  return{...load('src/lib/stripeServer.ts'),calls};
}
test('Stripe diagnostics preserve only allowlisted status, type, code, parameter and request ID',async()=>{
  const f=fixture({error:{type:'invalid_request_error',code:'resource_missing',param:'customer',message:'Never expose fixture-only-secret or customer@example.test',request_log_url:'https://private.invalid/log',payment_method:{number:'4242424242424242'}}},{'request-id':'req_Fixture123'});
  for(const run of [()=>f.stripeRequest('/billing_portal/sessions',{customer:'cus_fixture'}),()=>f.stripeGet('/customers/cus_fixture')]) {
    await assert.rejects(run,error=>{assert.equal(error.message,'STRIPE_PROVIDER_FAILURE:400');assert.equal(error.code,'HTTP_400');const safe=f.stripeFailureDiagnostics(error);assert.deepEqual(JSON.parse(JSON.stringify(safe)),{http_status:400,provider_code:'resource_missing',provider_type:'invalid_request_error',parameter:'customer',provider_request_id:'req_Fixture123'});assert.doesNotMatch(JSON.stringify(error),/fixture-only-secret|customer@example|424242|private.invalid/);return true;});
  }
  assert.ok(f.calls.every(call=>call.url.startsWith('https://api.stripe.com/v1/')));
});
test('unrecognized provider fields cannot smuggle credential details into diagnostic logs',async()=>{
  const f=fixture({error:{code:'fixture-only-secret',type:'customer@example.test',param:'4242424242424242',message:'sensitive'}},{'request-id':'https://private.invalid'});
  await assert.rejects(()=>f.stripeGet('/customers/cus_fixture'),error=>{assert.deepEqual(JSON.parse(JSON.stringify(f.stripeFailureDiagnostics(error))),{http_status:400,provider_code:'unclassified',provider_type:'unclassified',parameter:null,provider_request_id:null});assert.doesNotMatch(JSON.stringify(error),/fixture-only-secret|customer@example|424242|private.invalid|sensitive/);return true;});
});
