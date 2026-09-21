import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { BUSINESS_MARKETING_SOURCE_MESSAGES as messages } from '../../src/i18n/business-marketing-source-catalog';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
import { untranslatedOwnerCopy } from './helpers/ownerLocaleCoverage';
import AxeBuilder from '@axe-core/playwright';
import { draftMarketingCopies, marketingDestinations, MARKETING_LOCALES, type MarketingPost, type MarketingSnapshot } from '../../src/lib/businessMarketing';

test.describe('Business marketing offer dates',()=>{
 test.use({timezoneId:'America/Los_Angeles'});
 for(const [locale,width,height,staff] of [['en',390,844,false],['fr',768,1000,false],['es',1440,1000,true],['zh-CN',844,390,true]] as const){
  test(`Business marketing offer dates preserve instants and recover saved drafts in ${locale}`,async({page},info)=>{
   const f=await p0OwnerFixture(page,{locale,populated:true,role:staff?'salon_team':'salon_owner'});
   if(staff)await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{promotions:true},records:f.records}}));
   const own={id:'17500000-0000-4000-8000-000000000071',salon_id:f.business.id,title:'Own dated offer',public_headline:'Own dated offer',promotion_type:'percentage',discount_value:10,discount_label:'10%',description:'Own retained description',status:'Draft',is_active:false,paused_at:null as string|null,target_scope:'salon',target_ids:[],starts_at:'2026-10-20T17:00:12.345Z',ends_at:'2026-11-15T22:00:00.000Z',timezone:'America/New_York',restrictions:{minimum_subtotal:40,new_customers_only:true,usage_limit:20,per_customer_limit:1,terms:'Own retained terms'}};
   f.records.salon_promotions=[own];const posts:Record<string,unknown>[]=[];const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
   const failureId='17500000-0000-4000-8000-000000000072';let release!:()=>void,observe!:()=>void;const held=new Promise<void>(resolve=>release=resolve),observed=new Promise<void>(resolve=>observe=resolve);
   await page.route('**/api/salon/records/save',async route=>{
    expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);const input=route.request().postDataJSON();expect(input.table).toBe('salon_promotions');expect(input.id).toBe(own.id);posts.push(input.values);
    const expectedStatus=['Draft','Draft','Draft','Active','Paused'][posts.length-1];expect(expectedStatus).toBeTruthy();
    expect(input.values).toMatchObject({promotion_type:'percentage',discount_value:'10',status:expectedStatus,is_active:expectedStatus==='Active',target_scope:'salon',target_ids:[],restrictions:own.restrictions,timezone:'America/New_York'});
    if(expectedStatus==='Paused')expect(input.values.paused_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);else expect(input.values.paused_at).toBeNull();
    if(posts.length===1){observe();await held;return route.fulfill({status:503,json:{error:'Could not save the offer.',request_id:failureId}});}
    Object.assign(own,input.values);return route.fulfill({json:{record:own,verified:true}});
   });
   await page.setViewportSize({width,height});await page.goto(`/salon/dashboard/promotions/${own.id}`);
   const editor=page.locator('#promotion-editor'),title=editor.locator('[name="title"]'),start=editor.locator('[name="starts_at"]'),end=editor.locator('[name="ends_at"]');
   const status=editor.locator('[name="status"]');for(const value of ['Draft','Active','Paused'])await expect(status.getByRole('option',{name:text(locale,value),exact:true})).toHaveAttribute('value',value);await expect(status).toHaveValue('Draft');
   await expect(start).toHaveValue('2026-10-20T13:00');await expect(end).toHaveValue('2026-11-15T17:00');await expect(editor.locator('[name="timezone"]')).toHaveValue('America/New_York');
   await title.fill('Edited own offer');const save=editor.getByRole('button',{name:text(locale,'Save promotion'),exact:true});await save.click();await observed;
   const saveAndWaitForRouteResponse=async()=>{
    // A verified save calls router.replace. Require its successful response
    // and saved UI before reloading; a streaming RSC body need not close.
    const transitioned=page.waitForResponse(response=>{const url=new URL(response.url()),request=response.request(),headers=request.headers();return request.method()==='GET'&&url.pathname===`/salon/dashboard/promotions/${own.id}`&&url.searchParams.has('_rsc')&&headers.rsc==='1'&&headers['next-router-prefetch']!=='1';});
    await save.click();const response=await transitioned;expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('text/x-component');await expect(page.getByText(text(locale,'Saved and verified.'),{exact:true})).toBeVisible();
   };
   try{await expect(title).toHaveValue('Edited own offer');expect(posts[0]).toMatchObject({starts_at:'2026-10-20T17:00:12.345Z',ends_at:'2026-11-15T22:00:00.000Z'});expect(own.title).toBe('Own dated offer');}finally{release();}
   await expect(page.getByText(new RegExp(failureId))).toBeVisible();await expect(title).toHaveValue('Edited own offer');await expect(start).toHaveValue('2026-10-20T13:00');expect(own.title).toBe('Own dated offer');
   const failureNotice=page.getByRole('alert').filter({hasText:failureId});await failureNotice.getByRole('button',{name:text(locale,'Dismiss message'),exact:true}).click();await expect(failureNotice).toHaveCount(0);
   await saveAndWaitForRouteResponse();await expect.poll(()=>own.title).toBe('Edited own offer');await expect(title).toHaveValue('Edited own offer');expect(posts).toHaveLength(2);expect(own.starts_at).toBe('2026-10-20T17:00:12.345Z');expect(own.ends_at).toBe('2026-11-15T22:00:00.000Z');
   await page.reload();await expect(title).toHaveValue('Edited own offer');await expect(start).toHaveValue('2026-10-20T13:00');await expect(end).toHaveValue('2026-11-15T17:00');
   await start.fill('2026-10-23T15:45');await saveAndWaitForRouteResponse();await expect.poll(()=>own.starts_at).toBe('2026-10-23T19:45:00.000Z');expect(posts).toHaveLength(3);expect(own.ends_at).toBe('2026-11-15T22:00:00.000Z');expect(own.discount_value).toBe('10');expect(own.status).toBe('Draft');
   await page.reload();await expect(start).toHaveValue('2026-10-23T15:45');await expect(title).toHaveValue('Edited own offer');
   for(const next of ['Active','Paused']){
    await status.selectOption(next);await expect(status).toHaveValue(next);const submittedAt=Date.now();await saveAndWaitForRouteResponse();await expect.poll(()=>own.status).toBe(next);await expect(page.getByText(text(locale,'Saved and verified.'),{exact:true})).toBeVisible();
    expect(own.is_active).toBe(next==='Active');if(next==='Paused'){expect(Date.parse(own.paused_at!)).toBeGreaterThanOrEqual(submittedAt);expect(Date.parse(own.paused_at!)).toBeLessThanOrEqual(Date.now());}else expect(own.paused_at).toBeNull();
    expect(own.starts_at).toBe('2026-10-23T19:45:00.000Z');expect(own.ends_at).toBe('2026-11-15T22:00:00.000Z');expect(own.discount_value).toBe('10');expect(own.restrictions).toEqual({minimum_subtotal:40,new_customers_only:true,usage_limit:20,per_customer_limit:1,terms:'Own retained terms'});
    await page.reload();await expect(status).toHaveValue(next);await expect(title).toHaveValue('Edited own offer');await expect(start).toHaveValue('2026-10-23T15:45');await expect(end).toHaveValue('2026-11-15T17:00');
   }
   expect(posts.map(row=>row.status)).toEqual(['Draft','Draft','Draft','Active','Paused']);
   const header=await page.locator('.gc-owner-header').evaluate(element=>element.getBoundingClientRect().bottom);await start.evaluate((element,offset)=>window.scrollBy(0,element.getBoundingClientRect().top-offset),header+16);await page.screenshot({path:info.outputPath(`offer-dates-${locale}-${width}.png`)});
   expect(pageErrors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
  });
 }
 test('Business marketing desktop assistant opening preserves offer draft focus',async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true});await page.setViewportSize({width:1279,height:900});await page.goto('/salon/dashboard/promotions/new');
  const editor=page.locator('#promotion-editor'),title=editor.locator('[name="title"]'),headline=editor.locator('[name="public_headline"]');
  await headline.fill('Own headline');await title.fill('Own draft');await expect(title).toHaveValue('Own draft');await expect(title).toBeFocused();
  await title.evaluate((element:HTMLInputElement)=>element.setSelectionRange(4,4));
  const assistant=page.getByRole('dialog',{name:'GC Assistant',exact:true});await expect(assistant).not.toBeVisible();
  // Crossing the real docking breakpoint opens the same native desktop dialog
  // as delayed startup. Opening a passive dock must not redirect ongoing input.
  await page.setViewportSize({width:1280,height:900});await expect(assistant).toBeVisible();
  const focus=await title.evaluate((element:HTMLInputElement)=>({retained:document.activeElement===element,selectionStart:element.selectionStart,selectionEnd:element.selectionEnd,activeTag:document.activeElement?.tagName,activeLabel:document.activeElement?.getAttribute('aria-label')}));
  await info.attach('automatic-dock-focus',{body:JSON.stringify(focus),contentType:'application/json'});
  await page.screenshot({path:info.outputPath('offer-automatic-dock-focus.png')});
  expect(focus.retained,'Automatic desktop docking must preserve the active offer input').toBe(true);expect(focus.selectionStart).toBe(4);expect(focus.selectionEnd).toBe(4);
  await page.keyboard.insertText('reviewed ');await expect(title).toHaveValue('Own reviewed draft');await expect(headline).toHaveValue('Own headline');
  await assistant.getByRole('button',{name:'Close GC Assistant',exact:true}).click();await expect(assistant).not.toBeVisible();
  await page.getByRole('button',{name:'GC Assistant',exact:true}).click();await expect(assistant).toBeVisible();
  expect(await assistant.evaluate(element=>element.contains(document.activeElement)),'An explicit assistant launch should move focus into its dialog').toBe(true);
  expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
 test('Business marketing offer dates reject unavailable wall times before saving',async({page})=>{
  const f=await p0OwnerFixture(page,{populated:true});await page.goto('/salon/dashboard/promotions/new');const editor=page.locator('#promotion-editor');
  await editor.locator('[name="title"]').fill('Own draft');await editor.locator('[name="public_headline"]').fill('Own draft');await editor.locator('[name="timezone"]').fill('America/New_York');
  const start=editor.locator('[name="starts_at"]'),save=editor.getByRole('button',{name:'Create promotion',exact:true});
  for(const [value,message] of [['2026-03-08T02:30',"That time does not exist in the offer's time zone. Choose another time."],['2026-11-01T01:30',"That time occurs twice in the offer's time zone. Choose a time outside the repeated hour."]]){
   await start.fill(value);await save.click();await expect(editor.getByRole('alert')).toHaveText(message);await expect(start).toHaveValue(value);expect(f.actions).toEqual([]);
  }
  expect(f.records.salon_promotions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
});
test.use({ serviceWorkers: 'block' });
const promotion='17500000-0000-4000-8000-000000000002';
const text=(locale:string,value:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[value]||messages[locale]?.[value]||value;
for(const locale of ['en','fr','es','zh-CN'])for(const width of [390,768,1440])for(const populated of [false,true]){
 test(`Business marketing default workspace route audit ${locale} ${width}px ${populated?'populated':'empty'}`,async({page})=>{
  const f=await p0OwnerFixture(page,{locale,populated});await page.setViewportSize({width,height:width===390?844:1000});
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/salon/marketing'&&r.request().method()==='GET');
  await page.goto('/salon/dashboard/promotions');const loaded=await response;expect(loaded.status()).toBe(200);
  const data=await loaded.json();expect(data.posts).toEqual([]);expect(data.sources.services.map((row:{id:string})=>row.id)).toEqual(populated?[f.ids.service]:[]);expect(data.external_posting).toBe(false);
  await expect(page.getByRole('region',{name:text(locale,'Marketing content'),exact:true})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('lang',locale);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await untranslatedOwnerCopy(page,locale)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  const audit=await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(audit.violations.map(item=>({id:item.id,targets:item.nodes.map(node=>node.target)}))).toEqual([]);
  expect(f.unexpected,'Every fixture request must remain explicitly accounted for').toEqual([]);expect(f.actions).toEqual([]);
 });
}
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
  await marketingPhotoFixture(page);
  return {auth,state,handler,source,snapshot};
}
async function marketingPhotoFixture(page:Page) {
  await page.route('https://maps.gstatic.com/gc-marketing-fixture/own.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#006677"/><text x="45" y="155" fill="white" font-size="25">Owner portfolio fixture</text></svg>'}));
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
    try{const second=await context.newPage();await p0OwnerFixture(second,{locale,populated:true});await second.route('**/api/salon/marketing',f.handler);await marketingPhotoFixture(second);await second.goto('/salon/dashboard/promotions');const secondPanel=second.getByRole('region',{name:t('Marketing content'),exact:true});await secondPanel.getByRole('button',{name:t('Open marketing content'),exact:true}).click();await secondPanel.getByRole('button',{name:t('Cancel publication and remove from business page'),exact:true}).click();await expect(secondPanel.getByRole('status')).toContainText(t('Marketing publication cancelled and verified.'));expect(f.state.cancellations).toBe(1);}finally{await context.close();}
    await panel.getByRole('button',{name:t('Refresh marketing status'),exact:true}).click();await expect(panel.getByRole('button',{name:t('Cancel publication and remove from business page'),exact:true})).toHaveCount(0);
  });
}
test('Business marketing failed portfolio image preserves the native Open target at 390px',async({page},info)=>{
  const locale='zh-CN',f=await fixture(page,locale),t=(value:string)=>text(locale,value);
  f.state.posts=[{id:'17500000-0000-4000-8000-000000000093',revision:1,status:'scheduled',source:f.source,snapshot:f.snapshot,copies:draftMarketingCopies(f.snapshot),...marketingDestinations(f.snapshot),scheduled_at:'2026-10-20T13:00:00.000Z',expires_at:'2026-10-21T21:00:00.000Z',published_at:null,updated_at:'2026-10-19T12:00:00.000Z',last_error:null}];
  let release!:()=>void,observe!:()=>void;
  const held=new Promise<void>(resolve=>release=resolve),observed=new Promise<void>(resolve=>observe=resolve);
  await page.route(f.source.photo_urls[0],async route=>{observe();await held;await route.fulfill({status:404,contentType:'text/html',body:'Missing owner portfolio image'});});
  await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/promotions');
  const panel=page.getByRole('region',{name:t('Marketing content'),exact:true}),open=panel.getByRole('button',{name:t('Open marketing content'),exact:true}),photo=panel.getByRole('img',{name:'Own portfolio GC123',exact:true});
  try{
    await open.scrollIntoViewIfNeeded();await observed;
    // Settle fonts independently so this regression isolates the real image
    // error boundary rather than attributing a font swap to image geometry.
    await open.evaluate(async element=>{element.getBoundingClientRect();await document.fonts.ready;const rect=element.getBoundingClientRect();window.scrollTo({top:scrollY+rect.top+rect.height/2-innerHeight/2,behavior:'instant'});});
    await photo.evaluate((element:HTMLImageElement)=>{
      Object.assign(window,{marketingImageFailure:new Promise<void>(resolve=>element.addEventListener('error',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())),{once:true}))});
    });
    const before=await open.evaluate(button=>{
      const events:{type:string;isOpen:boolean}[]=[];
      for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>events.push({type,isOpen:button.contains(event.target as Node)}),{capture:true});
      Object.assign(window,{marketingOpenEvents:events});
      const rect=button.getBoundingClientRect();return{top:rect.top,bottom:rect.bottom,documentTop:scrollY+rect.top,x:rect.x+rect.width/2,y:rect.y+rect.height/2,hit:button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2))};
    });
    expect(before.hit).toBe(true);expect(await photo.evaluate((element:HTMLImageElement)=>element.complete)).toBe(false);
    await page.mouse.move(before.x,before.y);await page.mouse.down();release();
    await page.evaluate(()=>(window as unknown as {marketingImageFailure:Promise<void>}).marketingImageFailure);
    const after=await open.evaluate(button=>{const rect=button.getBoundingClientRect();return{top:rect.top,bottom:rect.bottom,documentTop:scrollY+rect.top};});
    await page.mouse.up();
    const events=await page.evaluate(()=>(window as unknown as {marketingOpenEvents:{type:string;isOpen:boolean}[]}).marketingOpenEvents);
    await info.attach('marketing-failed-image-native-target',{body:JSON.stringify({before,after,events}),contentType:'application/json'});
    await page.screenshot({path:info.outputPath('marketing-failed-image-native-open.png')});
    expect(Math.abs(after.documentTop-before.documentTop),'A failed image must not move the Open control in the document').toBeLessThanOrEqual(1);
    expect(Math.abs(after.top-before.top),'A failed image must not move the native pointer target').toBeLessThanOrEqual(1);
    expect(events.map(event=>({type:event.type,isOpen:event.isOpen}))).toEqual([{type:'pointerdown',isOpen:true},{type:'pointerup',isOpen:true},{type:'click',isOpen:true}]);
    await expect(panel.getByLabel(t('Caption title'),{exact:true})).toHaveValue('Boho / Goddess Braids · Maison Étoile GC123');
    expect(f.state.cancellations).toBe(0);
    await panel.getByRole('button',{name:t('Cancel publication and remove from business page'),exact:true}).click();
    await expect(panel.getByRole('status')).toContainText(t('Marketing publication cancelled and verified.'));expect(f.state.cancellations).toBe(1);
    expect(f.auth.actions).toEqual([]);expect(f.auth.unexpected).toEqual([]);
  }finally{release();}
});
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

const promotionLayoutTypeOptions = [
  ['percentage', 'Percentage discount'], ['fixed', 'Fixed discount'],
  ['free_addon', 'Free eligible add-on'], ['free_service', 'Free eligible service'],
  ['descriptive', 'Descriptive offer'],
] as const;
const promotionLayoutScopeOptions = [
  ['salon', 'All eligible services'], ['services', 'Selected services'],
  ['service_groups', 'Selected service groups'], ['master_styles', 'Selected styles'],
  ['products', 'Selected products'], ['addons', 'Selected add-ons'],
] as const;

for (const locale of ['en', 'fr', 'es', 'zh-CN'] as const) {
  for (const width of [320, 390, 768, 1440]) {
    test(`Business marketing offer selections show every full choice in ${locale} at ${width}`, async ({ page }, info) => {
      const f = await p0OwnerFixture(page, { locale, populated: true });
      const own = {
        id: '17500000-0000-4000-8000-000000000081', salon_id: f.business.id,
        title: 'Own layout offer', public_headline: 'Own layout offer',
        promotion_type: 'percentage', discount_value: 10, discount_label: '10%',
        status: 'Draft', is_active: false, paused_at: null,
        target_scope: 'salon', target_ids: [], starts_at: null, ends_at: null,
        timezone: 'America/New_York', restrictions: {},
      };
      f.records.salon_promotions = [own];
      const original = JSON.stringify(own), errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await page.goto(`/salon/dashboard/promotions/${own.id}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const editor = page.locator('#promotion-editor');
      const offerType = editor.getByRole('combobox', { name: text(locale, 'Offer type'), exact: true });
      const appliesTo = editor.getByRole('combobox', { name: text(locale, 'Applies to'), exact: true });
      await expect(offerType).toHaveValue('percentage');
      await expect(appliesTo).toHaveValue('salon');
      await page.evaluate(() => document.fonts.ready);
      if (width === 1440) {
        // Preserve the real reduced workspace width; do not close the dock.
        const dock = page.getByRole('dialog', { name: 'GC Assistant', exact: true });
        await expect(dock).toBeVisible();
        await expect(dock).toHaveAttribute('aria-modal', 'false');
        expect(await page.locator('main[data-owner-workspace]').evaluate(node => parseFloat(getComputedStyle(node).marginRight))).toBeGreaterThanOrEqual(336);
      }
      const controls = [
        { name: 'Offer type', select: offerType, options: promotionLayoutTypeOptions },
        { name: 'Applies to', select: appliesTo, options: promotionLayoutScopeOptions },
      ];
      const geometry = [];
      for (const control of controls) {
        await expect(control.select.locator('option')).toHaveCount(control.options.length);
        const choices = [];
        for (const [value, source] of control.options) {
          await expect(control.select.locator(`option[value="${value}"]`)).toHaveText(text(locale, source));
          await control.select.selectOption(value);
          await expect(control.select).toHaveValue(value);
          choices.push(await control.select.evaluate(node => {
            const select = node as HTMLSelectElement, style = getComputedStyle(select);
            const context = document.createElement('canvas').getContext('2d');
            if (!context) throw new Error('Native select text measurement requires a canvas context.');
            context.font = style.font;
            const label = select.selectedOptions[0].textContent || '', spacing = parseFloat(style.letterSpacing) || 0;
            const rect = select.getBoundingClientRect();
            return {
              value: select.value, label, font: style.font, fontSize: parseFloat(style.fontSize),
              textWidth: context.measureText(label).width + Math.max(0, label.length - 1) * spacing,
              // Same conservative native-arrow allowance used by Products geometry.
              usableWidth: select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20,
              left: rect.left, right: rect.right, height: rect.height,
            };
          }));
        }
        geometry.push({ control: control.name, choices });
        const longest = choices.reduce((best, choice) => choice.textWidth > best.textWidth ? choice : best);
        await control.select.selectOption(longest.value);
        const label = control.select.locator('..');
        const headerBottom = await page.locator('.gc-owner-header').evaluate(node => node.getBoundingClientRect().bottom);
        // Align the label, not just the input, beneath the real sticky header.
        await label.evaluate((node, offset) => window.scrollBy(0, node.getBoundingClientRect().top - offset), headerBottom + 16);
        await page.screenshot({ path: info.outputPath(`offer-select-${control.name === 'Offer type' ? 'type' : 'scope'}-${locale}-${width}.png`) });
      }
      await info.attach('offer-select-geometry', { body: JSON.stringify({ locale, width, geometry }, null, 2), contentType: 'application/json' });
      for (const control of geometry) for (const choice of control.choices) {
        const detail = JSON.stringify({ control: control.control, ...choice });
        expect.soft(choice.textWidth, detail).toBeLessThanOrEqual(choice.usableWidth);
        expect.soft(choice.height, detail).toBeGreaterThanOrEqual(44);
        expect.soft(choice.fontSize, detail).toBeGreaterThanOrEqual(13);
        expect.soft(choice.left, detail).toBeGreaterThanOrEqual(0);
        expect.soft(choice.right, detail).toBeLessThanOrEqual(width);
      }
      await offerType.selectOption('percentage');
      await appliesTo.selectOption('salon');
      await expect(offerType).toHaveValue('percentage');
      await expect(appliesTo).toHaveValue('salon');
      await expect(editor.locator('[name="discount_value"]')).toHaveValue('10');
      await expect(editor.locator('[name="status"]')).toHaveValue('Draft');
      expect(JSON.stringify(own)).toBe(original);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(errors).toEqual([]);
      expect(f.actions).toEqual([]);
      expect(f.unexpected).toEqual([]);
    });
  }
}
