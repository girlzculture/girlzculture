import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd());
const { assistantAvatar }=load('src/lib/assistantAppearance.ts');
const { assistantPageActions }=load('src/lib/assistantPageActions.ts');
const { ASSISTANT_TOOLS }=load('src/lib/gcAssistantCore.ts');
test('contextual actions cover every page and obey current staff permissions',()=>{
  const pages=load('src/lib/assistantPageContext.ts').ASSISTANT_PAGES;
  for(const page of pages) {
    const actions=assistantPageActions(page,{isOwner:true});
    assert.ok(actions.length>=3&&actions.length<=5,page);
    for(const action of actions) if(action.tool) {
      assert.equal(ASSISTANT_TOOLS[action.tool].permission,action.permission);
      assert.equal(ASSISTANT_TOOLS[action.tool].risk,1);
    }
    assert.equal(assistantPageActions(page,{isOwner:false,permissions:{}}).length,0);
  }
  const photo=assistantPageActions('photos',{isOwner:false,permissions:{photos:true}});
  assert.equal(photo.length,3);assert.equal(photo[0].tool,'get_business_media');
  assert.equal(assistantAvatar('https://other-business.test/image'),'woman');
  assert.equal(assistantAvatar('dog'),'dog');
});
test('appearance updates derive business authority from the session and never accept foreign IDs or URLs',async()=>{
  const stored=new Map([['a','woman'],['b','man']]); let current={id:'a',user:'owner-a',isOwner:true};let calls=0;
  const route=typescriptLoader(process.cwd(),{
    '@/lib/supabaseAdmin':{ requireSalonOwner:async()=>({salon:{id:current.id},user:{id:current.user},isOwner:current.isOwner,admin:{rpc:async(name,args)=>{
      assert.equal(name,'update_business_assistant_avatar');assert.equal(args.p_salon,current.id);assert.equal(args.p_user,current.user);calls++;stored.set(args.p_salon,args.p_avatar);return{data:args.p_avatar};
    }}})},
    '@/lib/requestSecurity':{ enforceRateLimit(){},RateLimitError:class extends Error{} },
    '@/lib/platformErrors':{capturePlatformError:async()=>'APPEARANCE-EXACT-REFERENCE'},
    '@/lib/operationalMonitoring':{routeMonitoringProfile(){},withOperationalMonitoring:(_profile,fn)=>fn},
  })('src/app/api/salon/assistant/appearance/route.ts');
  const save=body=>route.PATCH(new Request('http://local/api/salon/assistant/appearance',{method:'PATCH',body:JSON.stringify(body)}));
  let response=await save({avatar:'cat'});assert.equal(response.status,200);assert.equal((await response.json()).business_id,'a');
  assert.equal(stored.get('a'),'cat');assert.equal(stored.get('b'),'man');
  for(const input of [{avatar:'dog',salon_id:'b'},{avatar:'https://b.invalid/photo'},null]) assert.equal((await save(input)).status,400);
  assert.equal(calls,1);
  current={id:'b',user:'owner-b',isOwner:true};response=await save({avatar:'dog'});assert.equal(response.status,200);assert.equal(stored.get('a'),'cat');assert.equal(stored.get('b'),'dog');
  current={id:'a',user:'staff-a',isOwner:false};response=await save({avatar:'man'});assert.equal(response.status,403);assert.equal(response.headers.get('X-Request-ID'),'APPEARANCE-EXACT-REFERENCE');assert.equal(calls,2);
});
