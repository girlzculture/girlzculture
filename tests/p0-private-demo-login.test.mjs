import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';

const owner='11000000-0000-4000-8000-000000000001';
const recipient='founder@example.com';
const originalMfaSecret=process.env.MFA_CODE_SECRET;
test.after(()=>{if(originalMfaSecret===undefined)delete process.env.MFA_CODE_SECRET;else process.env.MFA_CODE_SECRET=originalMfaSecret;});
const request=()=>new Request('https://example.com/api/auth/login',{headers:{'user-agent':'demo-regression','x-forwarded-for':'127.0.0.1'}});
function fixture({registered=true,metadata={gc_demo:true,gc_demo_security_email:recipient},userMetadata={},deliverySkipped=false}={}) {
  const rows=[],emails=[],sms=[],queries=[];
  const user={id:owner,email:'private-demo@private-demo.invalid',app_metadata:metadata,user_metadata:userMetadata};
  const admin={from(table){
    let operation='select',values,columns,filters=[];
    const chain={
      select(value){columns=value;return chain;},
      update(value){operation='update';values=value;return chain;},
      insert(value){operation='insert';values=value;return chain;},
      eq(key,value){filters.push([key,value]);return chain;},
      is(key,value){filters.push([key,value]);return chain;},
      in(){return chain;},order(){return chain;},limit(){return chain;},
      single(){return execute();},maybeSingle(){return execute();},
      then(resolve,reject){return execute().then(resolve,reject);},
    };
    async function execute(){
      queries.push({table,operation,columns,filters});
      if(table==='auth_mfa_challenges'){
        const matches=rows.filter(row=>filters.every(([key,value])=>row[key]===value));
        if(operation==='insert'){rows.push({created_at:new Date().toISOString(),attempts:0,used_at:null,...values});return {data:null,error:null};}
        if(operation==='update'){matches.forEach(row=>Object.assign(row,values));return {data:columns?matches[0]??null:null,error:null};}
        return {data:matches[0]??null,error:null};
      }
      if(table==='salons')return {data:columns==='id'?(registered?{id:'demo-business'}:null):{phone:'+12125550100'},error:null};
      if(table==='account_security_settings')return {data:{preferred_channel:'sms',mfa_enabled:false},error:null};
      return {data:null,error:null};
    }
    return chain;
  }};
  process.env.MFA_CODE_SECRET='test-only-mfa-secret-not-a-production-credential';
  const api=loadNodeTypescript(process.cwd(),{
    '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin,sendEmail:async(...args)=>{emails.push(args);return {skipped:deliverySkipped};},sendSms:async(...args)=>{sms.push(args);return {}; }},
    '@/lib/adminSecurityServer':{adminMfaPolicy:()=>({challengeMinutes:5,maxAttempts:5,resendCooldownSeconds:30,mode:'required'}),assertAuthorizedAdminUser:async()=>{}},
    '@/lib/identityServer':{},
    '@/lib/salonAuthorizationCore':{},
  })('src/lib/secureLoginServer.ts');
  const code=()=>emails[0]?.[2].match(/>(\d{6})<\/strong>/)?.[1];
  return {api,user,rows,emails,sms,queries,code};
}

test('private demo retains mandatory MFA and routes only the code to its trusted security recipient',async()=>{
  const f=fixture();assert.equal(await f.api.requiresMfa(f.user,'salon'),true);
  const result=await f.api.createMfaChallenge(f.user,'salon',request());
  assert.equal(result.channel,'email');assert.equal(result.destination,'fo***@example.com');
  assert.equal(f.sms.length,0);assert.equal(f.emails.length,1);
  assert.equal(f.emails[0][0],recipient);assert.equal(f.emails[0][3],'security');
  assert.equal(f.rows[0].email_normalized,f.user.email);assert.notEqual(f.rows[0].code_hash,f.code());
  assert.ok(f.queries.some(q=>q.table==='salons'&&q.filters.some(([key,value])=>key==='user_id'&&value===owner)&&q.filters.some(([key,value])=>key==='is_demo'&&value===true)));
  await f.api.verifyMfaChallenge(result.challengeId,f.code(),'salon',f.user.email,request(),owner);
  await assert.rejects(f.api.verifyMfaChallenge(result.challengeId,f.code(),'salon',f.user.email,request(),owner),/already been used/);
});

for(const [label,options,role] of [
  ['missing security recipient',{metadata:{gc_demo:true}},'salon'],
  ['fictional security recipient',{metadata:{gc_demo:true,gc_demo_security_email:'nobody@private-demo.invalid'}},'salon'],
  ['no registered owned demo',{registered:false},'salon'],
  ['wrong role',{},'admin'],
])test(`private demo fails closed for ${label}`,async()=>{
  const f=fixture(options);await assert.rejects(f.api.createMfaChallenge(f.user,role,request()),/Private demo sign-in delivery is not configured/);
  assert.equal(f.emails.length,0);assert.equal(f.sms.length,0);assert.equal(f.rows.length,0);
});

test('user editable metadata cannot redirect a genuine owner MFA code',async()=>{
  const f=fixture({metadata:{},userMetadata:{gc_demo:true,gc_demo_security_email:recipient}});
  assert.equal(await f.api.requiresMfa(f.user,'salon'),true);
  const result=await f.api.createMfaChallenge(f.user,'salon',request());
  assert.equal(result.channel,'sms');assert.equal(f.sms.length,1);assert.equal(f.emails.length,0);
});

test('private demo does not create a challenge when security delivery is unavailable',async()=>{
  const f=fixture({deliverySkipped:true});await assert.rejects(f.api.createMfaChallenge(f.user,'salon',request()),/Two-factor delivery is not configured/);
  assert.equal(f.rows.length,0);assert.equal(f.sms.length,0);
});

test('private demo challenge preserves cooldown, identity, device and incorrect-code checks',async()=>{
  const f=fixture();const result=await f.api.createMfaChallenge(f.user,'salon',request());
  await assert.rejects(f.api.createMfaChallenge(f.user,'salon',request()),/before requesting another code/);
  await assert.rejects(f.api.verifyMfaChallenge(result.challengeId,f.code(),'salon',recipient,request(),owner),/invalid/);
  await assert.rejects(f.api.verifyMfaChallenge(result.challengeId,f.code(),'salon',f.user.email,request(),'another-owner'),/invalid/);
  const differentDevice=request();differentDevice.headers.set('user-agent','another-device');
  await assert.rejects(f.api.verifyMfaChallenge(result.challengeId,f.code(),'salon',f.user.email,differentDevice,owner),/invalid/);
  await assert.rejects(f.api.verifyMfaChallenge(result.challengeId,'000000','salon',f.user.email,request(),owner),/incorrect/);
  assert.equal(f.rows[0].attempts,1);assert.equal(f.rows[0].used_at,null);
  await f.api.verifyMfaChallenge(result.challengeId,f.code(),'salon',f.user.email,request(),owner);
});
