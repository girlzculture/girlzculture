import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const core=loadNodeTypescript(process.cwd())('src/lib/googleBusinessProfileCore.ts');
const env={GOOGLE_BUSINESS_PROFILE_ACTIVATION:'live',GOOGLE_BUSINESS_PROFILE_APPROVED:'true',GOOGLE_BUSINESS_PROFILE_VERIFIED_AT:'2026-01-01',GOOGLE_BUSINESS_PROFILE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET:'fixture-secret',GOOGLE_BUSINESS_PROFILE_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),GOOGLE_BUSINESS_PROFILE_REDIRECT_URI:'https://girlzculture.com/api/salon/integrations/google/callback'};
const config=core.googleProfileConfig(env);
test('Google activation fails closed, acceptance is restricted, and future verification is invalid',()=>{
 assert.ok(config);assert.equal(core.googleProfileConfig({}),null);
 for(const changes of [{GOOGLE_BUSINESS_PROFILE_APPROVED:'false'},{GOOGLE_BUSINESS_PROFILE_VERIFIED_AT:'2999-01-01'},{GOOGLE_BUSINESS_PROFILE_ENCRYPTION_KEY:'bad'},{GOOGLE_BUSINESS_PROFILE_REDIRECT_URI:env.GOOGLE_BUSINESS_PROFILE_REDIRECT_URI+'?code=bad'},{GOOGLE_BUSINESS_PROFILE_REDIRECT_URI:'https://foreign.test/api/salon/integrations/google/callback'}])assert.equal(core.googleProfileConfig({...env,...changes}),null);
 const acceptance=core.googleProfileConfig({...env,GOOGLE_BUSINESS_PROFILE_ACTIVATION:'acceptance',GOOGLE_BUSINESS_PROFILE_ACCEPTANCE_OWNER_ID:'owner-a',GOOGLE_BUSINESS_PROFILE_REDIRECT_URI:'https://000000000000000000000001--girlzculture.netlify.app/api/salon/integrations/google/callback'});
 assert.ok(acceptance);const origin=new URL(acceptance.redirectUri).origin;
 assert.doesNotThrow(()=>core.assertGoogleAccess(acceptance,origin,'owner-a'));
 for(const args of [[origin,'owner-b'],[origin,'owner-a',true],['https://girlzculture.com','owner-a']])assert.throws(()=>core.assertGoogleAccess(acceptance,...args),/GOOGLE_ACTIVATION_DEFERRED/);
});
test('encrypted credentials cannot cross businesses, purposes or tampering boundaries',()=>{
 const ciphertext=core.sealGoogleSecret({refresh_token:'fixture-refresh'},'business-a','tokens',config.key);
 assert.ok(!ciphertext.includes('fixture-refresh'));assert.deepEqual(core.openGoogleSecret(ciphertext,'business-a','tokens',config.key),{refresh_token:'fixture-refresh'});
 for(const [text,business,purpose] of [[ciphertext,'business-b','tokens'],[ciphertext,'business-a','pkce'],[ciphertext+'.extra','business-a','tokens']])assert.throws(()=>core.openGoogleSecret(text,business,purpose,config.key),/GOOGLE_CONNECTION_UNAVAILABLE/);
});
test('OAuth uses unique state and PKCE, fixed callback and constant-time cookie comparison',()=>{
 const auth=core.googleAuthorization(config),url=new URL(auth.url);
 assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('redirect_uri'),config.redirectUri);
 assert.equal(url.searchParams.get('scope'),core.GOOGLE_BUSINESS_SCOPE);assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(auth.verifier).digest('base64url'));
 assert.equal(core.verifyGoogleState(auth.state,auth.state),auth.stateHash);
 assert.throws(()=>core.verifyGoogleState(auth.state,'x'.repeat(43)),/GOOGLE_AUTHORIZATION_EXPIRED/);
 assert.notEqual(core.googleAuthorization(config).state,auth.state);
});
test('provider exchanges and refreshes server-side; revoked tokens stay out of URLs',async()=>{
 const requests=[];const provider=new core.GoogleProfileProvider(config,async(url,init)=>{requests.push({url,init});return url.endsWith('/revoke')?new Response(''):Response.json({access_token:'fixture-access',refresh_token:requests.length===1?'fixture-refresh':undefined,expires_in:3600,scope:core.GOOGLE_BUSINESS_SCOPE});});
 const tokens=await provider.exchange('fixture-code','fixture-verifier'),refreshed=await provider.refresh(tokens);await provider.revoke(refreshed.refresh_token);
 assert.equal(refreshed.refresh_token,'fixture-refresh');
 assert.equal(requests[0].init.body.get('redirect_uri'),config.redirectUri);assert.equal(requests[0].init.body.get('code_verifier'),'fixture-verifier');
 assert.equal(requests[1].init.body.get('grant_type'),'refresh_token');assert.equal(requests[2].url,'https://oauth2.googleapis.com/revoke');
 for(const r of requests){assert.equal(r.init.redirect,'error');assert.equal(r.init.cache,'no-store');assert.ok(!r.url.includes('fixture-refresh'));}
});
test('provider errors disclose allowlisted status only and never retry uncertain writes',async()=>{
 let calls=0;const provider=new core.GoogleProfileProvider(config,async()=>{calls++;return new Response('secret fixture provider body',{status:403});});
 await assert.rejects(provider.patch('fixture-access','locations/1',{title:'Our Business'}),error=>error.code==='GOOGLE_ACCESS_UNAVAILABLE'&&!error.message.includes('secret'));
 assert.equal(calls,1);await assert.rejects(provider.location('fixture-access','https://foreign.test'),/GOOGLE_LOCATION_INVALID/);assert.equal(calls,1);
 await assert.rejects(provider.patch('fixture-access','locations/1',{storefrontAddress:{}}),/GOOGLE_FIELDS_INVALID/);assert.equal(calls,1);
 const expired=new core.GoogleProfileProvider(config,()=>{throw Error('must not call');},Date.now()-1);await assert.rejects(expired.accounts('fixture-access'),/GOOGLE_DEADLINE_EXCEEDED/);
});
export {env};
