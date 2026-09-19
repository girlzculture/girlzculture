import { expect, type Page, type Route } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { onboardingText } from '../../src/i18n/business-onboarding-copy';
import { emptyOnboardingFacts, ONBOARDING_SECTIONS, type OnboardingDraft } from '../../src/lib/businessOnboardingDraft';
import { POLICY_DEFAULTS } from '../../src/lib/businessPolicyCore';
import { structureOwnerSource } from '../../src/lib/businessOnboardingSource';

test.use({ serviceWorkers: 'block' });
const draftId='17400000-0000-4000-8000-000000000001';
const groupId='17400000-0000-4000-8000-000000000002';
const original='Business name: Onboarding Fixture GC123\nDescription: Owner supplied facts only.\nPhone: 3055550123\nCity: Miami\nState: FL\nZIP: 33101\nService: Silk press | $125 | 90 minutes\nMon: 09:00–17:00\nTeam member: Fixture Aisha | Owner supplied biography\nUncertain claim: review manually';
async function fixture(page: Page, locale='en') {
  const auth=await p0OwnerFixture(page,{locale});
  await page.route('**/api/salon/onboarding-instagram', route => route.request().method() === 'GET' ? route.fulfill({json:{status:'unavailable',reason:'configuration'}}) : route.fallback());
  const state={draft:null as OnboardingDraft|null,saveCalls:0,applyCalls:0,aiCalls:0,live:false,published:false,failSave:false,failAi:false,failConfirm:false,denied:false};
  const handler=async(route:Route)=>{
    expect(route.request().headers().authorization).toBe(`Bearer ${auth.session.access_token}`);
    if(state.denied)return route.fulfill({status:403,json:{code:'ONBOARDING_OWNER_REQUIRED'}});
    if(route.request().method()==='GET')return route.fulfill({json:{drafts:state.draft?[state.draft]:[],groups:[{id:groupId,name:'Hair styling'}],owned_photos:[],current_name:'Onboarding Fixture GC123',live_business:state.live,current_is_discoverable:state.published,page_path:'/salon/onboarding-fixture',automatic_source_import:false}});
    const body=route.request().postDataJSON();
    if(body.action==='structure'){
      expect(Object.keys(body).sort()).toEqual(['action','locale','source']);state.aiCalls++;
      if(state.failAi)return route.fulfill({status:503,headers:{'X-Request-ID':'AI-EXACT-REFERENCE'},json:{code:'ONBOARDING_AI_UNAVAILABLE',request_id:'AI-EXACT-REFERENCE'}});
      const generated=structureOwnerSource(body.source.text);
      state.draft={id:draftId,revision:1,status:'draft',source:{...body.source,locale:body.locale,extraction:{method:'openai_source_quotes',evidence:generated.evidence.map(item=>({field:item.field,quote:item.excerpt})),unresolved:['Uncertain claim: review manually']}},facts:generated.facts,uncertain:['photos','policies','services.0.group_id'],result:null,created_at:new Date().toISOString()};
      return route.fulfill({json:{draft:state.draft,verified:true,published:false,provider:'openai'}});
    }
    if(body.action==='draft'){
      state.saveCalls++;
      if(state.failSave){state.failSave=false;return route.fulfill({status:503,headers:{'X-Request-ID':'ONBOARDING-EXACT-REFERENCE'},json:{code:'ONBOARDING_UNAVAILABLE',request_id:'ONBOARDING-EXACT-REFERENCE'}});}
      state.draft={id:draftId,revision:(state.draft?.revision||0)+1,status:'draft',source:{...body.source,locale:body.locale,...(state.draft?.source.extraction&&state.draft.source.text===body.source.text?{extraction:state.draft.source.extraction}:{})},facts:body.facts,uncertain:['identity.address_street','photos','policies','hours.Tue'],result:null,created_at:new Date().toISOString()};
      return route.fulfill({json:{draft:state.draft,verified:true,published:false}});
    }
    expect(body.action).toBe('confirm');expect(body.id).toBe(draftId);expect(body.revision).toBe(state.draft?.revision);expect(body.reviewed).toEqual([...ONBOARDING_SECTIONS]);expect(body.confirm).toBe(true);expect(body.keep_unpublished).toBe(!state.live);expect(body.public_impact).toBe(state.live);expect(body.facts).toBeUndefined();
    state.applyCalls++;
    if(state.failConfirm){state.failConfirm=false;return route.fulfill({status:409,json:{code:'ONBOARDING_WORKSPACE_CHANGED',request_id:'ONBOARDING-STALE-REFERENCE'}});}
    state.draft={...state.draft!,status:'applied',result:{published:state.published,services_created:state.draft!.facts.services.filter(row=>row.price!==null&&row.minutes!==null&&row.group_id).length,team_ids:state.draft!.facts.team.map((_,index)=>String(index)),policy_revision_id:null}};
    return route.fulfill({json:{draft:state.draft,verified:true,published:state.published,current_is_discoverable:state.published,live_business:state.live}});
  };
  await page.route('**/api/salon/onboarding-draft',handler);
  return {state,handler,auth};
}
async function enterSource(page:Page,locale:string){
  const t=(key:Parameters<typeof onboardingText>[1])=>onboardingText(locale,key);
  await expect(page.getByRole('heading',{name:t('title'),exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:t('permission'),exact:true}).check();
  await page.getByRole('textbox',{name:t('sourceText'),exact:true}).fill(original);
  await page.getByRole('button',{name:t('structure'),exact:true}).click();
  await expect(page.getByRole('status')).toContainText(t('unresolvedLines'));
  await page.getByRole('combobox',{name:t('group'),exact:true}).selectOption(groupId);
}
async function review(page:Page,locale:string,live=false){
  const t=(key:Parameters<typeof onboardingText>[1])=>onboardingText(locale,key);
  const panel=page.getByRole('region',{name:t('review'),exact:true});
  const confirm=panel.getByRole('button',{name:t(live?'publicConfirm':'confirm'),exact:true});
  await expect(confirm).toBeDisabled();
  const boxes=panel.getByRole('checkbox',{name:t('reviewed'),exact:true});await expect(boxes).toHaveCount(6);
  for(const box of await boxes.all())await box.check();
  await expect(confirm).toBeDisabled();
  await panel.getByRole('checkbox',{name:t(live?'liveHold':'hold'),exact:true}).check();
  await expect(confirm).toBeEnabled();return {panel,confirm};
}
for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
  test(`Business onboarding draft source review save and separate session in ${locale}`,async({page,browser},info)=>{
    const f=await fixture(page,locale);const t=(key:Parameters<typeof onboardingText>[1])=>onboardingText(locale,key);
    await page.setViewportSize({width,height});await page.goto('/salon/onboarding/import');await enterSource(page,locale);
    await page.getByRole('button',{name:t('save'),exact:true}).click();
    const {panel,confirm}=await review(page,locale);
    await expect(panel).toContainText('Onboarding Fixture GC123');await expect(panel).toContainText('125');await expect(panel).toContainText('90');await expect(panel).toContainText('09:00 – 17:00');
    expect(f.state.applyCalls).toBe(0);expect(f.state.draft?.source.text).toBe(original);
    await confirm.click();await expect(panel).toContainText(t('saved'));expect(f.state.applyCalls).toBe(1);expect(f.state.draft?.facts.services[0].price).toBe(125);
    await page.reload();await expect(page.getByRole('region',{name:t('review'),exact:true})).toContainText('Onboarding Fixture GC123');expect(f.state.applyCalls).toBe(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:info.outputPath(`onboarding-${locale}-${width}.png`),fullPage:true});
    const context=await browser.newContext({baseURL:new URL(page.url()).origin,viewport:{width:width===390?1440:390,height:844},serviceWorkers:'block'});
    try{const second=await context.newPage();await p0OwnerFixture(second,{locale});await second.route('**/api/salon/onboarding-draft',f.handler);await second.goto('/salon/onboarding/import');await expect(second.getByRole('region',{name:t('review'),exact:true})).toContainText('Fixture Aisha');await expect(second.getByRole('button',{name:t('confirm'),exact:true})).toHaveCount(0);expect(f.state.applyCalls).toBe(1);}finally{await context.close();}
  });
}
test('Business onboarding draft failed save retains source and exact reference; stale confirmation needs fresh review',async({page})=>{
  const f=await fixture(page);await page.goto('/salon/onboarding/import');await enterSource(page,'en');f.state.failSave=true;
  await page.getByRole('button',{name:onboardingText('en','save'),exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('ONBOARDING-EXACT-REFERENCE');await expect(page.getByRole('textbox',{name:onboardingText('en','sourceText'),exact:true})).toHaveValue(original);expect(f.state.draft).toBeNull();
  await page.getByRole('button',{name:onboardingText('en','save'),exact:true}).click();let reviewed=await review(page,'en');f.state.failConfirm=true;await reviewed.confirm.click();await expect(page.getByRole('main').getByRole('alert')).toContainText('ONBOARDING-STALE-REFERENCE');expect(f.state.draft?.status).toBe('draft');
  await page.getByRole('button',{name:onboardingText('en','save'),exact:true}).click();reviewed=await review(page,'en');await reviewed.confirm.click();await expect(reviewed.panel).toContainText(onboardingText('en','saved'));expect(f.state.applyCalls).toBe(2);
});
test('Business onboarding draft existing page requires explicit public impact and uses current publication state after refresh',async({page})=>{
  const f=await fixture(page);f.state.live=true;f.state.published=true;await page.goto('/salon/onboarding/import');await enterSource(page,'en');await page.getByRole('button',{name:onboardingText('en','save'),exact:true}).click();
  const {panel,confirm}=await review(page,'en',true);await confirm.click();await expect(panel).toContainText(onboardingText('en','liveSaved'));
  f.state.published=false;expect(f.state.draft?.result?.published).toBe(true);await page.reload();await expect(page.getByRole('region',{name:onboardingText('en','review'),exact:true})).toContainText(onboardingText('en','saved'));await expect(page.getByRole('region',{name:onboardingText('en','review'),exact:true})).not.toContainText(onboardingText('en','liveSaved'));await expect(page.locator('a[href="/salon/onboarding-fixture"]')).toHaveCount(0);
});
test('Business onboarding draft owner denial exposes no editable business source or saved facts',async({page})=>{
  const f=await fixture(page);f.state.denied=true;await page.goto('/salon/onboarding/import');await expect(page.getByRole('main').getByRole('alert')).toContainText(onboardingText('en','access'));await expect(page.locator('form')).toHaveCount(0);expect(f.state.saveCalls).toBe(0);
});
test('Business onboarding draft never treats a source handle alone as imported business facts',async({page})=>{
  const f=await fixture(page);await page.goto('/salon/onboarding/import');await page.getByRole('combobox',{name:onboardingText('en','source'),exact:true}).selectOption('instagram');await page.getByRole('textbox',{name:onboardingText('en','instagram'),exact:true}).fill('fixture_salon');await page.getByRole('checkbox',{name:onboardingText('en','permission'),exact:true}).check();await page.getByRole('button',{name:onboardingText('en','save'),exact:true}).click();
  expect(f.state.draft?.facts).toEqual(emptyOnboardingFacts());await expect(page.getByRole('region',{name:onboardingText('en','review'),exact:true})).toContainText(onboardingText('en','missing'));expect(f.state.applyCalls).toBe(0);
});
test('Business onboarding draft policy link resumes only the selected private draft and preserves review before publication',async({page})=>{
  await p0OwnerFixture(page,{populated:true});
  const oldId='17400000-0000-4000-8000-000000000010',importId='17400000-0000-4000-8000-000000000011',reviewId='17400000-0000-4000-8000-000000000012';
  const revisions=[{id:oldId,policy:{...POLICY_DEFAULTS,business_policy_text:'Original live policy'},source_locale:'en',version:1 as number|null,published_at:'2026-09-18T12:00:00Z' as string|null},{id:importId,policy:{...POLICY_DEFAULTS,business_policy_text:'Imported owner policy GC123'},source_locale:'en',version:null,published_at:null}];let current=oldId,publishes=0,drafts=0;
  await page.route(/\/api\/salon\/policies(?:\?|$)/,route=>{
    if(route.request().method()==='GET')return route.fulfill({json:{revisions,current}});
    const body=route.request().postDataJSON();
    if(body.action==='draft'){drafts++;expect(body.policy.business_policy_text).toBe('Imported owner policy GC123');const revision={...revisions[1],id:reviewId,policy:body.policy};revisions.push(revision);return route.fulfill({json:{revision,digest:'a'.repeat(64),expected_revision:oldId}});}
    expect(body.action).toBe('publish');expect(body.revision_id).toBe(reviewId);expect(body.source_reviewed).toBe(true);expect(body.platform_rules_acknowledged).toBe(true);publishes++;const revision=revisions.find(row=>row.id===reviewId)!;revision.published_at='2026-09-19T12:00:00Z';revision.version=2;current=reviewId;return route.fulfill({json:{revision,verified:true}});
  });
  await page.goto(`/salon/dashboard/my-page/business-policies?draft=${importId}`);
  await expect(page.getByLabel('Business Policy',{exact:true})).toHaveValue('Imported owner policy GC123');expect(publishes).toBe(0);expect(drafts).toBe(0);
  await page.getByRole('button',{name:'Save draft and review',exact:true}).click();await expect(page).toHaveURL(new RegExp(`draft=${reviewId}`));
  const publish=page.getByRole('button',{name:'Confirm and publish',exact:true});await expect(publish).toBeDisabled();
  await page.getByRole('checkbox',{name:'I reviewed this policy in its original language and understand that platform rules and legal rights take precedence.',exact:true}).check();await publish.click();await expect(page.getByRole('status',{name:'',exact:true})).toContainText('Business policies published.');await expect(page).not.toHaveURL(/draft=/);expect(publishes).toBe(1);
  await page.reload();await expect(page.getByLabel('Business Policy',{exact:true})).toHaveValue('Imported owner policy GC123');expect(publishes).toBe(1);expect(revisions[1].published_at).toBeNull();
});
test('Business onboarding draft policy link cannot select a missing or foreign unpublished revision',async({page})=>{
  await p0OwnerFixture(page,{populated:true});await page.route(/\/api\/salon\/policies(?:\?|$)/,route=>route.fulfill({json:{revisions:[],current:null}}));
  await page.goto('/salon/dashboard/my-page/business-policies?draft=17400000-0000-4000-8000-999999999999');await expect(page.getByRole('status',{name:'',exact:true})).toContainText('Business policies are temporarily unavailable.');await expect(page.getByRole('button',{name:'Save draft and review',exact:true})).toBeDisabled();
});

for(const isOwner of [true,false])test(`Business onboarding draft My Page entry is ${isOwner?'available to the owner':'hidden from a team member'}`,async({page})=>{
  const f=await fixture(page);
  await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.auth.business,isOwner,isTeamMember:!isOwner,permissions:{my_page:true},records:f.auth.records}}));
  await page.goto('/salon/dashboard/my-page');
  const entry=page.getByRole('link',{name:onboardingText('en','entry'),exact:true});
  if(isOwner){await entry.click();await expect(page).toHaveURL(/\/salon\/onboarding\/import$/);await expect(page.getByRole('heading',{name:onboardingText('en','title'),exact:true})).toBeVisible();}
  else{await expect(page.getByRole('heading',{name:'My Page',exact:true})).toBeVisible();await expect(entry).toHaveCount(0);}
});

test('Business onboarding draft AI suggestions remain private with source evidence and no automatic rerun after refresh',async({page},info)=>{
 const f=await fixture(page);const t=(key:Parameters<typeof onboardingText>[1])=>onboardingText('en',key);
 await page.setViewportSize({width:390,height:844});await page.goto('/salon/onboarding/import');await page.getByRole('checkbox',{name:t('permission'),exact:true}).check();await page.getByRole('textbox',{name:t('sourceText'),exact:true}).fill(original);await page.getByRole('button',{name:t('aiCreate'),exact:true}).click();
 await expect(page.getByRole('status')).toContainText(t('aiSaved'));const panel=page.getByRole('region',{name:t('review'),exact:true});await expect(panel).toContainText(t('notPublished'));await expect(panel.getByRole('button',{name:t('confirm'),exact:true})).toBeDisabled();expect(f.state.aiCalls).toBe(1);expect(f.state.applyCalls).toBe(0);
 await panel.getByText(t('evidence'),{exact:true}).click();await expect(panel.locator('blockquote').filter({hasText:'Service: Silk press | $125 | 90 minutes'})).toBeVisible();await expect(panel).toContainText('Uncertain claim: review manually');await page.screenshot({path:info.outputPath('onboarding-ai-private-mobile.png'),fullPage:true});
 await page.reload();await expect(page.getByRole('button',{name:t('aiCreate'),exact:true})).toBeDisabled();expect(f.state.aiCalls).toBe(1);expect(f.state.applyCalls).toBe(0);
 await page.getByRole('combobox',{name:t('group'),exact:true}).selectOption(groupId);await page.getByRole('button',{name:t('save'),exact:true}).click();const reviewed=await review(page,'en');await reviewed.confirm.click();await expect(reviewed.panel).toContainText(t('saved'));expect(f.state.aiCalls).toBe(1);expect(f.state.applyCalls).toBe(1);expect(f.state.draft?.facts.services[0]).toMatchObject({price:125,minutes:90,group_id:groupId});
});

test('Business onboarding draft AI failure retains source and manual setup without a false success or automatic retry',async({page})=>{
 const f=await fixture(page);f.state.failAi=true;const t=(key:Parameters<typeof onboardingText>[1])=>onboardingText('en',key);await page.goto('/salon/onboarding/import');await page.getByRole('checkbox',{name:t('permission'),exact:true}).check();await page.getByRole('textbox',{name:t('sourceText'),exact:true}).fill(original);await page.getByRole('button',{name:t('aiCreate'),exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('AI-EXACT-REFERENCE');await expect(page.getByRole('main').getByRole('alert')).toContainText(t('aiUnavailable'));await expect(page.getByRole('textbox',{name:t('sourceText'),exact:true})).toHaveValue(original);await expect(page.getByRole('region',{name:t('review'),exact:true})).toHaveCount(0);expect(f.state.aiCalls).toBe(1);expect(f.state.draft).toBeNull();
 await page.getByRole('button',{name:t('structure'),exact:true}).click();await page.getByRole('combobox',{name:t('group'),exact:true}).selectOption(groupId);await page.getByRole('button',{name:t('save'),exact:true}).click();await expect(page.getByRole('status').filter({hasText:t('draftSaved')})).toBeVisible();expect(f.state.aiCalls).toBe(1);expect(f.state.applyCalls).toBe(0);
});
