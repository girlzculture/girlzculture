import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const id='33000000-0000-4000-8000-000000000001';
function fixture({stored,failSave=false,actor='owner-A',business='business-A'}={}){
 const calls=[],metadata=stored?{gc_assistant_locale:stored}:{};
 const context={user:{id:actor,user_metadata:metadata},salon:{id:business,time_zone:'America/New_York'},
  admin:{auth:{admin:{updateUserById:async(user,body)=>{calls.push({save:user,body});if(failSave)return{error:Error('secret provider detail')};Object.assign(metadata,body.user_metadata);return{error:null};}}}}};
 const load=typescriptLoader(process.cwd(),{
  '@/lib/supabaseAdmin':{requireSalonOwner:async()=>context},
  '@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},
  '@/lib/gcAssistantPlanningServer':{planOwnerRequest:async input=>{
   calls.push({plan:input.locale,actor:input.userId,business:input.salonId});
   if(input.answerOnly)return{reply:input.locale};
   const chosen={'Answer in French':'fr','Responde en español':'es','请用中文回答':'zh-CN','Answer in English':'en'}[input.text]||input.locale;
   return {language_switch:chosen !== input.locale || input.text.startsWith("Answer in") ? chosen : null,response_locale:chosen,plan:{tool:'get_services_and_prices',args:{query:''}}};
  }},
  '@/lib/gcAssistantServer':{executeAssistantTool:async(_context,input)=>{calls.push({tool:input.locale});return{request:{id},assistant_message:input.locale};}},
  '@/lib/platformErrors':{capturePlatformError:async()=> 'SAFE-LANGUAGE-REFERENCE',safeFailure:()=>Response.json({code:'FAIL'},{status:503})},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_profile,handler)=>handler},
 });
 const route=load('src/app/api/salon/assistant/route.ts');
 return{calls,metadata,async send(text,locale='en'){
  const response=await route.POST(new Request('https://app.test/api/salon/assistant',{method:'POST',body:JSON.stringify({action:'plan',request_id:id,locale,text,previous_request_ids:[]})}));
  return{status:response.status,body:await response.json()};
 }};
}
test('explicit language switches persist independently of interface locale and later fresh requests',async()=>{
 const f=fixture();
 for(const [text,lang]of [['Answer in French','fr'],['Responde en español','es'],['请用中文回答','zh-CN'],['Answer in English','en']]){
  assert.equal((await f.send(text)).body.response_locale,lang);
  assert.equal(f.metadata.gc_assistant_locale,lang);
  const afterLogin=fixture({stored:f.metadata.gc_assistant_locale});
  assert.equal((await afterLogin.send('And the duration?','en')).body.response_locale,lang);
  assert.equal(afterLogin.calls.filter(c=>c.save).length,0);
 }
 assert.deepEqual(f.calls.filter(c=>c.save).map(c=>c.save),Array(4).fill('owner-A'));
 assert.ok(f.calls.filter(c=>c.save).every(c=>Object.keys(c.body.user_metadata).join()==='gc_assistant_locale'));
});
test('response language is account-specific and historical deferred Wolof is not restored as a saved preference',async()=>{
 const french=fixture({stored:'fr',actor:'owner-A',business:'business-A'});
 const spanish=fixture({stored:'es',actor:'staff-B',business:'business-B'});
 assert.equal((await french.send('How many photos?')).body.response_locale,'fr');
 assert.equal((await spanish.send('How many photos?')).body.response_locale,'es');
 assert.equal((await fixture({stored:'wo'}).send('How many photos?')).body.response_locale,'en');
});
test('failed preference save preserves the retry boundary without executing a business tool or leaking the failure',async()=>{
 const f=fixture({failSave:true});
 const result=await f.send('Answer in French');
 assert.equal(result.status,503);assert.equal(result.body.code,'ASSISTANT_LANGUAGE_SAVE_FAILED');
 assert.equal(result.body.request_id,'SAFE-LANGUAGE-REFERENCE');
 assert.equal(f.calls.filter(c=>c.tool).length,0);assert.ok(!JSON.stringify(result).includes('secret provider detail'));
});

test("explicitly choosing the current default persists it for a later device with a different UI language",async()=>{const f=fixture();assert.equal((await f.send("Answer in English")).body.response_locale,"en");assert.equal(f.metadata.gc_assistant_locale,"en");assert.equal((await fixture({stored:"en"}).send("And tomorrow?","fr")).body.response_locale,"en");});
