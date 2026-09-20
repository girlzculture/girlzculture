import { expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { instagramOnboardingText } from '../../src/i18n/instagram-onboarding-copy';
import { onboardingText } from '../../src/i18n/business-onboarding-copy';
import { emptyOnboardingFacts, onboardingUncertainty, ONBOARDING_SECTIONS, type OnboardingDraft } from '../../src/lib/businessOnboardingDraft';

test.use({ serviceWorkers: 'block' });
const importId='18400000-0000-4000-8000-000000000030',draftId='18400000-0000-4000-8000-000000000040';
const ids=['18400000-0000-4000-8000-000000000001','18400000-0000-4000-8000-000000000002'];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
async function fixture(page:Page,locale='en',available=true){
 const auth=await p0OwnerFixture(page,{locale});
 const state={status:available?'connected':'unavailable',snapshot:false,draft:null as OnboardingDraft|null,reads:0,creates:[] as Record<string,unknown>[],saves:0,applies:0,disconnects:0,failCreate:false,missingPreview:false,gate:null as Promise<void>|null};
 const snapshot=()=>({id:importId,profile:{username:'own_fixture',name:'Permitted account name'},media:ids.map((id,index)=>({id,preview_url:`${new URL(page.url()).origin}/fixture-instagram/photo-${index}.png`,timestamp:'2026-09-19T12:00:00Z'})),shown_count:2,is_excerpt:true});
 const status=()=>({status:state.status,...(state.status==='connected'?{account:{username:'own_fixture'}}:{}),...(state.snapshot?{import:snapshot()}:{}),...(state.status==='unavailable'?{reason:'INSTAGRAM_ACTIVATION_REQUIRED'}:{})});
 const instagram=async(route:Route)=>{
  expect(route.request().headers().authorization).toBe(`Bearer ${auth.session.access_token}`);
  if(route.request().method()==='GET')return route.fulfill({json:status()});
  const body=route.request().postDataJSON();
  if(body.action==='read'){expect(body).toEqual({action:'read'});state.reads++;state.status='disconnected';state.snapshot=true;return route.fulfill({json:{import:snapshot()}});}
  if(body.action==='disconnect'){expect(body).toEqual({action:'disconnect'});state.disconnects++;state.status='disconnected';return route.fulfill({json:{disconnected:true}});}
  expect(body.action).toBe('create_draft');expect(Object.keys(body).sort()).toEqual(['action','import_id','locale','media_ids','permitted','request_id']);expect(body.import_id).toBe(importId);expect(body.permitted).toBe(true);expect(body.locale).toBe(locale);expect(body.media_ids.every((id:string)=>ids.includes(id))).toBe(true);state.creates.push(body);
  if(state.gate)await state.gate;
  if(state.failCreate){state.failCreate=false;return route.fulfill({status:503,headers:{'X-Request-ID':'INSTAGRAM-EXACT-REFERENCE'},json:{code:'INSTAGRAM_UNAVAILABLE',request_id:'INSTAGRAM-EXACT-REFERENCE'}});}
  if(!state.draft){const facts=emptyOnboardingFacts();facts.identity.name='Permitted account name';facts.photos=body.media_ids.map((id:string)=>`instagram-asset:${id}`);state.draft={id:draftId,revision:1,status:'draft',source:{kind:'instagram',reference:'own_fixture',permitted:true,locale,provider_import:{provider:'instagram',import_id:importId,username:'own_fixture',imported_at:'2026-09-19T12:00:00Z',media_ids:body.media_ids}},facts,uncertain:onboardingUncertainty(facts),result:null,created_at:'2026-09-19T12:00:00Z'};}
  return route.fulfill({json:{draft:state.draft,verified:true,published:false}});
 };
 const onboarding=async(route:Route)=>{
  expect(route.request().headers().authorization).toBe(`Bearer ${auth.session.access_token}`);
  if(route.request().method()==='GET')return route.fulfill({json:{drafts:state.draft?[state.draft]:[],groups:[],owned_photos:[],private_photos:state.missingPreview?[]:(state.draft?.source.provider_import?.media_ids||[]).map(id=>({token:`instagram-asset:${id}`,url:`${new URL(page.url()).origin}/fixture-instagram/photo-${ids.indexOf(id)}.png`})),current_name:'Existing own workspace',live_business:false,current_is_discoverable:false,page_path:'/salon/own-fixture'}});
  const body=route.request().postDataJSON();
  if(body.action==='draft'){
   state.saves++;expect(body.source.provider_import).toBeUndefined();expect(body.id).toBe(draftId);expect(body.revision).toBe(state.draft?.revision);state.draft={...state.draft!,revision:state.draft!.revision+1,source:{...body.source,locale,provider_import:state.draft!.source.provider_import},facts:body.facts,uncertain:onboardingUncertainty(body.facts)};
   return route.fulfill({json:{draft:state.draft,verified:true,published:false}});
  }
  expect(body.action).toBe('confirm');state.applies++;expect(body.reviewed).toEqual([...ONBOARDING_SECTIONS]);expect(body.confirm).toBe(true);expect(body.keep_unpublished).toBe(true);expect(body.public_impact).toBe(false);expect(body.revision).toBe(state.draft?.revision);
  state.draft={...state.draft!,status:'applied',result:{published:false,services_created:0,team_ids:[]}};
  return route.fulfill({json:{draft:state.draft,verified:true,published:false,current_is_discoverable:false,live_business:false}});
 };
 await page.route('**/fixture-instagram/photo-*.png',route=>route.fulfill({contentType:'image/png',body:png}));
 await page.route('**/api/salon/onboarding-instagram',instagram);await page.route('**/api/salon/onboarding-draft',onboarding);
 return {auth,state,instagram,onboarding};
}
const copy=(key:Parameters<typeof instagramOnboardingText>[1])=>instagramOnboardingText('en',key);
const draftCopy=(key:Parameters<typeof onboardingText>[1])=>onboardingText('en',key);
async function selectOne(page:Page){
 const panel=page.getByRole('region',{name:copy('title'),exact:true});
 await panel.getByRole('checkbox',{name:copy('permission'),exact:true}).check();await panel.getByRole('button',{name:copy('read'),exact:true}).click();
 await expect(panel.getByText(copy('retained'),{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:copy('read'),exact:true})).toHaveCount(0);
 await panel.getByRole('checkbox',{name:'Photo 1',exact:true}).check();await expect(panel.getByRole('checkbox',{name:'Photo 2',exact:true})).not.toBeChecked();return panel;
}

for(const [locale,width,height] of [['en',320,740],['fr',390,844],['es',768,1024],['zh-CN',844,390]] as const){
 test(`Instagram onboarding unavailable preserves manual fallback in ${locale} ${width}x${height}`,async({page},info)=>{
  const f=await fixture(page,locale,false);await page.setViewportSize({width,height});await page.goto('/salon/onboarding/import');
  const text=(key:Parameters<typeof instagramOnboardingText>[1])=>instagramOnboardingText(locale,key),panel=page.getByRole('region',{name:text('title'),exact:true});
  await expect(panel.getByText(text('unavailable'),{exact:true})).toBeVisible();await expect(panel.getByRole('button')).toHaveCount(0);await expect(page.getByRole('textbox',{name:onboardingText(locale,'sourceText'),exact:true})).toBeEditable();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const axe=await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(axe.violations).toEqual([]);
  expect(f.state.creates).toEqual([]);expect(f.state.applies).toBe(0);expect(f.auth.unexpected).toEqual([]);await page.screenshot({path:info.outputPath(`instagram-unavailable-${locale}.png`),fullPage:true});
 });
}

test('Instagram onboarding selected private draft persists across edits reload and a separate session before exact review',async({page,browser},info)=>{
 const f=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/salon/onboarding/import');const panel=await selectOne(page);
 let release!:()=>void;f.state.gate=new Promise<void>(resolve=>{release=resolve;});await panel.getByRole('button',{name:copy('draft'),exact:true}).click();await expect(page.getByRole('textbox',{name:'Business Name',exact:true})).toBeDisabled();expect(f.state.applies).toBe(0);release();f.state.gate=null;
 const review=page.getByRole('region',{name:draftCopy('review'),exact:true});await expect(review.getByRole('checkbox',{name:draftCopy('reviewed'),exact:true})).toHaveCount(6);expect(f.state.creates[0].media_ids).toEqual([ids[0]]);expect(f.state.draft?.facts.services).toEqual([]);expect(f.auth.business.gallery_photos).toEqual([]);
 await page.getByRole('textbox',{name:'Business Name',exact:true}).fill('Owner reviewed identity');await expect(panel.getByRole('button',{name:copy('draft'),exact:true})).toBeDisabled();await page.getByRole('button',{name:draftCopy('save'),exact:true}).click();await expect(review).toContainText('Owner reviewed identity');expect(f.state.saves).toBe(1);expect(f.state.applies).toBe(0);
 await page.reload();await expect(review).toContainText('Owner reviewed identity');await expect(panel.getByRole('checkbox',{name:'Photo 1',exact:true})).toBeVisible();await expect(review.getByRole('link',{name:'Photos 1',exact:true})).toHaveAttribute('href',/\/fixture-instagram\/photo-0\.png$/);expect(f.state.reads).toBe(1);
 await page.screenshot({path:info.outputPath('instagram-private-draft-390.png'),fullPage:true});
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('instagram-private-source-viewport-390.png')});await review.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('instagram-private-review-viewport-390.png')});
 const context=await browser.newContext({baseURL:new URL(page.url()).origin,viewport:{width:1440,height:1000},serviceWorkers:'block'});
 try{const second=await context.newPage();await p0OwnerFixture(second);await second.route('**/api/salon/onboarding-instagram',f.instagram);await second.route('**/api/salon/onboarding-draft',f.onboarding);await second.route('**/fixture-instagram/photo-*.png',route=>route.fulfill({contentType:'image/png',body:png}));await second.goto('/salon/onboarding/import');const secondReview=second.getByRole('region',{name:draftCopy('review'),exact:true});await expect(secondReview).toContainText('Owner reviewed identity');const confirm=secondReview.getByRole('button',{name:draftCopy('confirm'),exact:true});await expect(confirm).toBeDisabled();for(const box of await secondReview.getByRole('checkbox',{name:draftCopy('reviewed'),exact:true}).all())await box.check();await secondReview.getByRole('checkbox',{name:draftCopy('hold'),exact:true}).check();await confirm.click();await expect(secondReview).toContainText(draftCopy('saved'));expect(f.state.applies).toBe(1);}finally{await context.close();}
 expect(f.auth.unexpected).toEqual([]);
});

test('Instagram onboarding failed private save retains selection and retries the exact request without public changes',async({page})=>{
 const f=await fixture(page);await page.goto('/salon/onboarding/import');const panel=await selectOne(page);f.state.failCreate=true;await panel.getByRole('button',{name:copy('draft'),exact:true}).click();await expect(panel.getByRole('alert')).toContainText('INSTAGRAM-EXACT-REFERENCE');await expect(panel.getByRole('checkbox',{name:'Photo 1',exact:true})).toBeChecked();expect(f.state.draft).toBeNull();expect(f.state.applies).toBe(0);
 await panel.getByRole('button',{name:copy('draft'),exact:true}).click();await expect(page.getByRole('region',{name:draftCopy('review'),exact:true})).toBeVisible();expect(f.state.creates).toHaveLength(2);expect(f.state.creates[1]).toEqual(f.state.creates[0]);expect(f.auth.business.gallery_photos).toEqual([]);expect(f.auth.unexpected).toEqual([]);
});

test('Instagram onboarding disconnect keeps private information reviewable and removes credential actions',async({page})=>{
 const f=await fixture(page);f.state.snapshot=true;await page.goto('/salon/onboarding/import');const panel=page.getByRole('region',{name:copy('title'),exact:true});await expect(panel.getByRole('checkbox',{name:'Photo 1',exact:true})).toBeVisible();await panel.getByRole('checkbox',{name:'Photo 1',exact:true}).check();await panel.getByRole('button',{name:copy('disconnect'),exact:true}).click();await expect(panel.getByRole('status')).toContainText(copy('disconnected'));await expect(panel.getByRole('checkbox',{name:'Photo 1',exact:true})).toBeChecked();await expect(panel.getByRole('button',{name:copy('disconnect'),exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:copy('draft'),exact:true})).toBeDisabled();expect(f.state.disconnects).toBe(1);expect(f.state.applies).toBe(0);expect(f.auth.unexpected).toEqual([]);
});

test('Instagram onboarding missing private preview prevents photo acknowledgement and confirmation',async({page})=>{
 const f=await fixture(page);await page.goto('/salon/onboarding/import');const panel=await selectOne(page);f.state.missingPreview=true;await panel.getByRole('button',{name:copy('draft'),exact:true}).click();const review=page.getByRole('region',{name:draftCopy('review'),exact:true});await expect(review.getByText(copy('previewUnavailable'),{exact:true})).toBeVisible();const boxes=review.getByRole('checkbox',{name:draftCopy('reviewed'),exact:true});await expect(boxes).toHaveCount(6);await expect(boxes.nth(3)).toBeDisabled();for(const index of [0,1,2,4,5])await boxes.nth(index).check();await review.getByRole('checkbox',{name:draftCopy('hold'),exact:true}).check();await expect(review.getByRole('button',{name:draftCopy('confirm'),exact:true})).toBeDisabled();expect(f.state.applies).toBe(0);expect(f.auth.unexpected).toEqual([]);
});
