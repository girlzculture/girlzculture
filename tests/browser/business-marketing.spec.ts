import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { BUSINESS_MARKETING_SOURCE_MESSAGES as messages } from '../../src/i18n/business-marketing-source-catalog';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
import { draftMarketingCopies, marketingDestinations, MARKETING_LOCALES, type MarketingPost, type MarketingSnapshot } from '../../src/lib/businessMarketing';
test.use({ serviceWorkers: 'block' });
const promotion='17500000-0000-4000-8000-000000000002';
const text=(locale:string,value:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[value]||messages[locale]?.[value]||value;
async function fixture(page:Page,locale='en') {
  const auth=await p0OwnerFixture(page,{locale,populated:true});Object.assign(auth.business,{name:'Maison Étoile GC123'});
  const source={photo_urls:['https://maps.gstatic.com/gc-marketing-fixture/own.svg'],service_id:auth.ids.service,promotion_id:promotion,booking_id:null};
  const snapshot:MarketingSnapshot={business:{id:auth.business.id,name:auth.business.name,slug:auth.business.slug,time_zone:auth.business.time_zone},photos:[{url:source.photo_urls[0],category:'before_after',title:'Own portfolio GC123'}],service:{id:auth.ids.service,name:'Boho / Goddess Braids',base_price:125,price_display_min:125,price_display_max:150},promotion:{id:promotion,title:'Autumn offer',promotion_type:'percentage',discount_value:20,starts_at:null,ends_at:null,terms:'Eligible services only'},completed_service:null};
  const state={posts:[] as MarketingPost[],saveCalls:0,approvalCalls:0,publications:0,cancellations:0,saveIds:[] as string[],approvalBodies:[] as Record<string,unknown>[],failSave:false,uncertainApproval:false,denied:false,holdSave:null as Promise<void>|null};
  const handler=async(route:Route)=>{
    expect(route.request().headers().authorization).toBe(`Bearer ${auth.session.access_token}`);
    if(state.denied)return route.fulfill({status:403,json:{code:'MARKETING_FORBIDDEN',error:'The business owner manages approved marketing content.'}});
    if(route.request().method()==='GET')return route.fulfill({json:{posts:state.posts,sources:{photos:snapshot.photos,services:[snapshot.service],promotions:[snapshot.promotion],completed_services:[]},time_zone:snapshot.business.time_zone,external_posting:false}});
    const body=route.request().postDataJSON();
    if(body.action==='generate'){expect(body.source).toEqual(source);return route.fulfill({json:{source,snapshot,copies:draftMarketingCopies(snapshot),...marketingDestinations(snapshot),saved:false,external_posting:false}});}
    if(body.action==='save'){
      state.saveCalls++;state.saveIds.push(body.id);if(state.holdSave)await state.holdSave;
      if(state.failSave){state.failSave=false;return route.fulfill({status:503,headers:{'X-Request-ID':'17500000-0000-4000-8000-000000000091'},json:{code:'MARKETING_UNAVAILABLE',request_id:'17500000-0000-4000-8000-000000000091'}});}
      const post:MarketingPost={id:body.id,revision:body.revision+1,status:'draft',source,snapshot,copies:body.copies,...marketingDestinations(snapshot),scheduled_at:null,expires_at:null,published_at:null,updated_at:new Date().toISOString(),last_error:null};state.posts=[post];return route.fulfill({json:{post,verified:true,external_posting:false}});
    }
    const post=state.posts.find(item=>item.id===body.id)!;expect(post).toBeTruthy();
    if(body.action==='approve'){
      state.approvalCalls++;state.approvalBodies.push(body);expect(body.reviewed_locales).toEqual([...MARKETING_LOCALES]);expect(body.media_permission).toBe(true);expect(body.confirm).toBe(true);expect(body.copies).toBeUndefined();
      if(post.status==='draft'){state.publications++;Object.assign(post,{revision:post.revision+1,status:Date.parse(body.scheduled_at)>Date.now()?'scheduled':'published',scheduled_at:body.scheduled_at,expires_at:body.expires_at,published_at:new Date().toISOString()});}
      else expect(body).toEqual(state.approvalBodies[0]);
      if(state.uncertainApproval){state.uncertainApproval=false;return route.fulfill({status:503,headers:{'X-Request-ID':'17500000-0000-4000-8000-000000000092'},json:{code:'MARKETING_UNAVAILABLE',request_id:'17500000-0000-4000-8000-000000000092'}});}
      return route.fulfill({json:{post,verified:true,external_posting:false}});
    }
    expect(body.action).toBe('cancel');expect(body.confirm).toBe(true);expect(body.revision).toBe(post.revision);state.cancellations++;Object.assign(post,{status:'cancelled',revision:post.revision+1});return route.fulfill({json:{post,verified:true,external_posting:false}});
  };
  await page.route('**/api/salon/marketing',handler);
  await page.route('https://maps.gstatic.com/gc-marketing-fixture/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#006677"/><text x="45" y="155" fill="white" font-size="25">Owner portfolio fixture</text></svg>'}));
  return {auth,state,handler,source,snapshot};
}
async function prepare(page:Page,locale='en'){
  const t=(value:string)=>text(locale,value);const panel=page.getByRole('region',{name:t('Marketing content'),exact:true});
  const close=page.getByRole('button',{name:t('Close GC Assistant'),exact:true});if(await close.isVisible())await close.click();
  await expect(panel.getByRole('button',{name:t('Prepare multilingual draft'),exact:true})).toBeDisabled();
  await panel.getByRole('combobox').nth(0).selectOption('33000000-0000-4000-8000-000000000004');await panel.getByRole('combobox').nth(1).selectOption(promotion);await panel.getByRole('checkbox',{name:/^Own portfolio GC123(?: Own portfolio GC123)?$/}).check();
  await panel.getByRole('button',{name:t('Prepare multilingual draft'),exact:true}).click();await expect(panel.getByRole('status')).toContainText(t('Draft prepared from your business records. Review and save it; nothing is published.'));
  return panel;
}
async function review(panel:Locator,locale='en'){
  const t=(value:string)=>text(locale,value);const publish=panel.getByRole('button',{name:t('Approve business-page publication'),exact:true});await expect(publish).toBeDisabled();
  for(const language of MARKETING_LOCALES){await panel.getByRole('navigation',{name:t('Content language'),exact:true}).getByRole('button').nth(MARKETING_LOCALES.indexOf(language)).click();await expect(panel.getByRole('textbox',{name:t('Caption'),exact:true})).toHaveValue(/USD 125\.00–USD 150\.00/);await panel.getByRole('checkbox').first().check();}
  await expect(publish).toBeDisabled();await panel.getByRole('checkbox',{name:t('I have permission to publish the selected work and approve all four language versions.'),exact:true}).check();await expect(publish).toBeEnabled();return publish;
}
for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
  test(`Business marketing own sources edit review schedule and separate-session persistence in ${locale}`,async({page,browser},info)=>{
    const f=await fixture(page,locale),t=(value:string)=>text(locale,value);await page.setViewportSize({width,height});await page.goto('/salon/dashboard/promotions');const panel=await prepare(page,locale);
    await expect(panel.getByLabel(t('Caption title'),{exact:true})).toHaveValue('Boho / Goddess Braids · Maison Étoile GC123');await expect(panel.getByRole('link',{name:t('Open booking destination'),exact:true})).toHaveAttribute('href',marketingDestinations(f.snapshot).booking_path);
    const caption=panel.getByRole('textbox',{name:t('Caption'),exact:true});await caption.fill(`${await caption.inputValue()}\nGC123`);await panel.getByRole('button',{name:t('Save marketing draft'),exact:true}).click();await expect(panel.getByRole('status')).toContainText(t('Marketing draft saved and verified.'));expect(f.state.publications).toBe(0);
    const starts=new Date(Date.now()+3*86400_000).toISOString().slice(0,10)+'T09:00',ends=new Date(Date.now()+4*86400_000).toISOString().slice(0,10)+'T17:00';const publish=await review(panel,locale);await panel.getByRole('combobox',{name:t('Publication'),exact:true}).selectOption('schedule');await panel.getByLabel(t('Publish at'),{exact:true}).fill(starts);await panel.getByLabel(t('Remove from public page at'),{exact:true}).fill(ends);await publish.click();
    await expect(panel.getByRole('status')).toContainText(t('Approved and scheduled for your Girlz Culture business page. Nothing was posted externally.'));expect(f.state.publications).toBe(1);const localTime=(value:unknown)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(String(value))).replace(' ','T');expect(localTime(f.state.approvalBodies[0].scheduled_at)).toBe(starts);expect(localTime(f.state.approvalBodies[0].expires_at)).toBe(ends);
    await page.reload();await panel.getByRole('button',{name:t('Open marketing content'),exact:true}).click();await expect(panel.getByLabel(t('Caption title'),{exact:true})).toHaveValue('Boho / Goddess Braids · Maison Étoile GC123');expect(f.state.approvalCalls).toBe(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);const image=panel.getByRole('img',{name:'Own portfolio GC123',exact:true});await image.scrollIntoViewIfNeeded();await expect(image).toHaveJSProperty('naturalWidth',400);await panel.screenshot({path:info.outputPath(`marketing-${locale}-${width}.png`)});
    const context=await browser.newContext({baseURL:new URL(page.url()).origin,viewport:{width:width===390?1440:390,height:844},serviceWorkers:'block'});
    try{const second=await context.newPage();await p0OwnerFixture(second,{locale,populated:true});await second.route('**/api/salon/marketing',f.handler);await second.goto('/salon/dashboard/promotions');const secondPanel=second.getByRole('region',{name:t('Marketing content'),exact:true});await secondPanel.getByRole('button',{name:t('Open marketing content'),exact:true}).click();await secondPanel.getByRole('button',{name:t('Cancel publication and remove from business page'),exact:true}).click();await expect(secondPanel.getByRole('status')).toContainText(t('Marketing publication cancelled and verified.'));expect(f.state.cancellations).toBe(1);}finally{await context.close();}
    await panel.getByRole('button',{name:t('Refresh marketing status'),exact:true}).click();await expect(panel.getByRole('button',{name:t('Cancel publication and remove from business page'),exact:true})).toHaveCount(0);
  });
}
test('Business marketing failed save retains caption and id while pending prevents duplicate submission',async({page})=>{
  const f=await fixture(page);await page.goto('/salon/dashboard/promotions');const panel=await prepare(page);f.state.failSave=true;let release!:()=>void;f.state.holdSave=new Promise<void>(resolve=>{release=resolve;});
  const save=panel.getByRole('button',{name:'Save marketing draft',exact:true});await save.click();await expect(save).toBeDisabled();await expect.poll(()=>f.state.saveCalls).toBe(1);release();await expect(panel.getByRole('alert')).toContainText('17500000-0000-4000-8000-000000000091');await expect(panel.getByRole('textbox',{name:'Caption',exact:true})).toHaveValue(/USD 125\.00–USD 150\.00/);expect(f.state.posts).toHaveLength(0);
  f.state.holdSave=null;await save.click();await expect(panel.getByRole('status')).toContainText('Marketing draft saved and verified.');expect(f.state.saveIds[0]).toBe(f.state.saveIds[1]);expect(f.state.publications).toBe(0);
});
test('Business marketing uncertain approval retries the identical reviewed timestamp without duplicate publication',async({page})=>{
  const f=await fixture(page);await page.goto('/salon/dashboard/promotions');const panel=await prepare(page);await panel.getByRole('button',{name:'Save marketing draft',exact:true}).click();const publish=await review(panel);f.state.uncertainApproval=true;await publish.click();await expect(panel.getByRole('alert')).toContainText('17500000-0000-4000-8000-000000000092');expect(f.state.publications).toBe(1);await publish.click();await expect(panel.getByRole('status')).toContainText('Published on your Girlz Culture business page. Nothing was posted externally.');expect(f.state.approvalCalls).toBe(2);expect(f.state.publications).toBe(1);expect(f.state.approvalBodies[0]).toEqual(f.state.approvalBodies[1]);
});
test('Business marketing unavailable or unauthorized data never becomes an editable empty workspace',async({page})=>{
  const f=await fixture(page);f.state.denied=true;await page.goto('/salon/dashboard/promotions');const panel=page.getByRole('region',{name:'Marketing content',exact:true});await expect(panel.getByRole('alert')).toContainText('The business owner manages approved marketing content.');await expect(panel.getByRole('button',{name:'Prepare multilingual draft',exact:true})).toHaveCount(0);expect(f.state.saveCalls).toBe(0);
});

for(const width of [390,1440])test(`Business marketing public subsection preserves the page and uses its current booking destination at ${width}px`,async({page,request},info)=>{
  const provider=process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL||'http://127.0.0.1:3105';expect(['127.0.0.1','localhost']).toContain(new URL(provider).hostname);
  const id=randomUUID(),other=randomUUID();const seed=(business:string,version:number|null,marketing=false)=>request.post(`${provider}/__fixtures/p0-public-policy/${business}`,{headers:{'x-acceptance-fixture':'p0-public-policy'},data:{version,marketing}});
  expect((await seed(id,1,true)).ok()).toBe(true);expect((await seed(other,1)).ok()).toBe(true);
  try{
    await page.route('https://maps.gstatic.com/gc-marketing-fixture/marketing-*.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#006677"/></svg>'}));
    await page.setViewportSize({width,height:844});await page.goto(`/salon/p0-policy-${id}`);
    const updates=page.getByRole('region',{name:'Business updates',exact:true});await expect(updates).toContainText('Owner approved GC123');await expect(updates).toContainText('USD 100.00');await expect(page.locator('#business-policies').filter({visible:true})).toHaveCount(1);
    await expect(updates.getByRole('img',{name:'Owner approved before',exact:true})).toBeVisible();await expect(updates.getByRole('img',{name:'Owner approved after',exact:true})).toBeVisible();for(const name of ['Owner approved before','Owner approved after']){const image=updates.getByRole('img',{name,exact:true});await image.scrollIntoViewIfNeeded();await expect(image).toHaveJSProperty('naturalWidth',400);}
    await expect(updates.getByRole('link',{name:'View services and book',exact:true})).toHaveAttribute('href',`/salon/p0-policy-${id}/book?style=${id}`);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await updates.screenshot({path:info.outputPath(`marketing-public-${width}.png`)});
    await page.goto(`/salon/p0-policy-${other}`);await expect(page.getByRole('heading',{name:'P0 Policy Fixture',exact:true})).toBeVisible();await expect(page.locator('#business-updates')).toHaveCount(0);
    expect((await seed(id,2,true)).ok()).toBe(true);await page.goto(`/salon/p0-policy-${id}`);await expect(page.getByRole('heading',{name:'P0 Policy Fixture',exact:true})).toBeVisible();await expect(page.locator('#business-updates')).toHaveCount(0);
  }finally{expect((await seed(id,null)).ok()).toBe(true);expect((await seed(other,null)).ok()).toBe(true);}
});

// Actual viewport captures complement the tall component captures above; fixed
// dashboard chrome must be assessed in the viewport where people use it.
for(const width of [390,1440])test(`Business marketing workspace viewport at ${width}px`,async({page},info)=>{
  await fixture(page);await page.setViewportSize({width,height:900});await page.goto('/salon/dashboard/promotions');
  const panel=await prepare(page);const headerBottom=await page.locator('.gc-owner-header').evaluate(element=>element.getBoundingClientRect().bottom);
  await panel.evaluate((element,offset)=>window.scrollBy(0,element.getBoundingClientRect().top-offset),headerBottom+16);
  await page.screenshot({path:info.outputPath(`marketing-workspace-${width}-editor.png`)});
  const review=panel.getByRole('heading',{name:'Review facts and destination',exact:true});await review.evaluate((element,offset)=>window.scrollBy(0,element.getBoundingClientRect().top-offset),headerBottom+16);
  const photo=panel.getByRole('img',{name:'Own portfolio GC123',exact:true});await photo.scrollIntoViewIfNeeded();await expect(photo).toHaveJSProperty('naturalWidth',400);
  await page.screenshot({path:info.outputPath(`marketing-workspace-${width}-review.png`)});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
