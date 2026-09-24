import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {POLICY_DEFAULTS} from '../../src/lib/businessPolicyCore';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});

for(const [width,height] of [[390,844],[768,1024],[1440,1000],[844,390]]){
 test(`Master demo bookings and sample subscription remain populated at ${width}x${height}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true});
  Object.assign(f.business,{is_demo:true,name:'Culture House — Sample Salon'});
  const base={...f.records.bookings[0],payment_mode:'test'};
  f.records.bookings=[{...base,is_demo:true,guest_name:'Sample visible'},
   {...base,id:'33000000-0000-4000-8000-000000000099',is_demo:false,guest_name:'Sandbox excluded'}];
  f.records.billing_events=Array.from({length:14},(_,i)=>({id:`sample-${i}`,salon_id:f.business.id,event_date:new Date(Date.UTC(2025,7+i,1,16)).toISOString(),event_type:'sample_subscription',new_plan:'Premium',amount_collected:19900,payment_status:'Simulated',stripe_event_id:`gc-demo:month-${i}`}));
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/bookings?group=All');
  const bookings=page.getByRole('region',{name:'Bookings workspace',exact:true});
  await expect(bookings.getByText('Sample visible',{exact:true}).filter({visible:true})).toBeVisible();
  await expect(bookings.getByText('Sandbox excluded',{exact:true})).toHaveCount(0);
  await page.reload();await expect(bookings.getByText('Sample visible',{exact:true}).filter({visible:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('sample-bookings.png'),fullPage:true});
  await page.goto('/salon/dashboard/subscription');
  const history=page.getByRole('region',{name:'Private demonstration — sample data',exact:true});
  await expect(history).toBeVisible();
  const rows=width<1024?history.getByRole('article'):history.locator('tbody tr');
  await expect(rows).toHaveCount(14);
  await expect(rows.first()).toContainText('gc-demo:month-13');
  await expect(rows.last()).toContainText('gc-demo:month-0');
  for(const row of await rows.all())await expect(row).toContainText('$199.00');
  await expect(history).not.toContainText('signed Stripe webhook');
  await expect(page.getByRole('button',{name:/Upgrade to|Downgrade to|Subscribe to/}).filter({visible:true})).not.toHaveCount(0);
  for(const button of await page.getByRole('button',{name:/Upgrade to|Downgrade to|Subscribe to/}).all())await expect(button).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await history.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('sample-billing.png')});
  Object.assign(f.business,{is_demo:false});await page.goto('/salon/dashboard/bookings?group=All');
  await expect(bookings.getByRole('heading',{name:'No appointments match these filters',exact:true})).toBeVisible();
  await expect(bookings.getByText('Sample visible',{exact:true})).toHaveCount(0);
  expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
}

for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Master demo private page recovers and keeps sample facts in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});Object.assign(f.business,{is_demo:true,name:'Culture House — Sample Salon'});
  const t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  let requests=0;
  await page.route('**/api/salon/demo-page',route=>{
   requests++;expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);
   return route.fulfill(requests===1?{status:503,json:{error:'The private demo page could not load. Try again.',request_id:'DEMO-RETRY'}}:{json:{sample:true,policy:{id:'sample-policy',version:2,source_locale:'en',policy:{...POLICY_DEFAULTS,business_policy_text:'Private sample policy, no real charges.'}},assistant:{id:f.business.id,userId:f.session.user.id,isOwner:true,permissions:null,avatar:'woman'},business:{name:f.business.name,description:'FICTIONAL SAMPLE BUSINESS',cover:'/images/salon-warm.jpg',city:'New York',photos:[]},services:[{id:f.ids.service,name:'Boho / Knotless Braids',base_price:210,duration_min_hours:4,duration_max_hours:4,description:'Sample service'}],team:[{id:f.ids.professional,name:'Amara Demo',bio:'Fictional professional'}]}});
  });
  await page.setViewportSize({width,height});
  if(locale==='en'){await page.goto('/salon/dashboard/my-page');const preview=page.getByRole('link',{name:'Preview public page',exact:true});await expect(preview).toHaveAttribute('href','/salon/dashboard/demo-page');await preview.click();}
  else await page.goto('/salon/dashboard/demo-page');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(t('The private demo page could not load. Try again.'));
  await page.getByRole('button',{name:t('Try again'),exact:true}).click();
  await expect(page.getByRole('heading',{name:'Culture House — Sample Salon',exact:true})).toBeVisible();
  await expect(page.getByText('Boho / Knotless Braids',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:t('Private demonstration — sample data'),exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Book now|Pay now/i})).toHaveCount(0);
  await page.locator('#business-policies summary').click();await expect(page.getByText('Private sample policy, no real charges.',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Amara Demo',exact:true})).toBeVisible();
  expect(requests).toBe(3);
  const assistant=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  if(!await assistant.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();
  await expect(assistant.locator('textarea')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`sample-page-${locale}.png`),fullPage:true});
 });
}

test('Master demo Assistant professional removal requires explicit review from Overview',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true});let writes=0,id='';
 await page.route('**/api/salon/assistant',route=>{
  const b=route.request().postDataJSON();
  if(b.action==='confirm'){expect(b.request_id).toBe(id);expect(b.digest).toBe('a'.repeat(64));writes++;return route.fulfill({json:{verified:true,result:{professional_name:'Amara Demo',archived:true,history_preserved:true}}});}
  id=b.request_id;return route.fulfill({json:{preview_required:true,request:{id,tool:'prepare_professional_archive',risk_class:4,digest:'a'.repeat(64),arguments:{stylist_id:f.ids.professional},execution_payload:{professional_name:'Amara Demo',archive:true,preserve_history:true},before_summary:{},confirmed_at:null}}});
 });
 await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard');
 await expect(page.locator('[data-owner-workspace]')).toBeVisible();
 const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
 if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();
 await dialog.locator('textarea').fill('Remove Amara Demo from my team');
 await dialog.getByRole('button',{name:'Ask GC Assistant',exact:true}).click();
 await expect(dialog.getByText('This removes the professional from booking and disables their staff access. Booking and finance history are preserved.',{exact:true})).toBeVisible();
 expect(writes).toBe(0);
 await dialog.getByRole('button',{name:'Confirm this change',exact:true}).click();
 await expect(dialog.getByText('Your change was saved and verified.',{exact:true})).toBeVisible();
 expect(writes).toBe(1);await expect(dialog.getByRole('button',{name:'Confirm this change',exact:true})).toHaveCount(0);
 expect(new URL(page.url()).pathname).toBe('/salon/dashboard');
});
