import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});

for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Master demo private page recovers and keeps sample facts in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});Object.assign(f.business,{is_demo:true,name:'Culture House — Sample Salon'});
  const t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  let requests=0;
  await page.route('**/api/salon/demo-page',route=>{
   requests++;expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);
   return route.fulfill(requests===1?{status:503,json:{error:'The private demo page could not load. Try again.',request_id:'DEMO-RETRY'}}:{json:{sample:true,assistant:{id:f.business.id,userId:f.session.user.id,isOwner:true,permissions:null,avatar:'woman'},business:{name:f.business.name,description:'FICTIONAL SAMPLE BUSINESS',cover:'/images/salon-warm.jpg',city:'New York',photos:[]},services:[{id:f.ids.service,name:'Boho / Knotless Braids',base_price:210,duration_min_hours:4,duration_max_hours:4,description:'Sample service'}],team:[{id:f.ids.professional,name:'Amara Demo',bio:'Fictional professional'}]}});
  });
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/demo-page');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(t('The private demo page could not load. Try again.'));
  await page.getByRole('button',{name:t('Try again'),exact:true}).click();
  await expect(page.getByRole('heading',{name:'Culture House — Sample Salon',exact:true})).toBeVisible();
  await expect(page.getByText('Boho / Knotless Braids',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:t('Private demonstration — sample data'),exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Book now|Pay now/i})).toHaveCount(0);
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
