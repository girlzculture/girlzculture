import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {assistantOperationsCopy} from '../../src/i18n/assistant-operations-copy';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';

test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,900],['zh-CN',844,390]] as const){
 test(`Master fulfillment review from Overview preserves tracking, explicit status-only terms and retry in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const copy=assistantOperationsCopy(locale),t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  let attempts=0,writes=0,activeId='';let status='Preparing';let release!:()=>void;const delay=new Promise<void>(r=>{release=r;});
  const changes={fulfillment_status:'Shipped',carrier:'Local carrier',tracking_number:'TEST-TRACK-123',note:'Original order note'};
  await page.route('**/api/salon/assistant',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);const body=route.request().postDataJSON();
   if(body.action==='confirm'){
    expect(body).toMatchObject({request_id:activeId,digest:'c'.repeat(64),confirm:true});attempts++;
    if(attempts===1){await delay;return route.fulfill({status:503,json:{code:'ASSISTANT_UNAVAILABLE',request_id:'20000000-0000-4000-8000-000000000099'}});}
    if(status!=='Shipped'){status='Shipped';writes++;}return route.fulfill({json:{verified:true,result:{operation:'product_fulfillment',fulfillment_status:status,carrier:changes.carrier,tracking_number:changes.tracking_number,provider_action:false,notification_sent:false}}});
   }
   expect(body.action).toBe('plan');activeId=body.request_id;
   if(status==='Shipped')return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'get_products',risk_class:1,arguments:{query:'GC-ORDER-51'},execution_payload:{},before_summary:{},result:{orders:[{public_reference:'GC-ORDER-51',fulfillment_status:status,tracking_number:changes.tracking_number}]},confirmed_at:null},assistant_message:`GC-ORDER-51 · ${copy.Shipped} · TEST-TRACK-123`}});
   return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'prepare_stock_change',risk_class:4,digest:'c'.repeat(64),before_summary:{fulfillment_status:status},confirmed_at:null,arguments:{operation:'product_fulfillment',record_id:f.ids.service,changes_json:JSON.stringify(changes)},execution_payload:{operation:'product_fulfillment',record_name:'GC-ORDER-51',changes,provider_action:false,notification_sent:false}},preview_required:true}});
  });
  await page.goto('/salon/dashboard');const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  const open=async()=>{if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();};await open();
  const send=async(text:string)=>{await dialog.locator('textarea').fill(text);await dialog.getByRole('button',{name:t('Ask GC Assistant'),exact:true}).click();};
  await send('Review shipping order GC-ORDER-51 with tracking TEST-TRACK-123.');
  await expect(dialog.getByRole('heading',{name:copy.product_fulfillment,exact:true})).toBeVisible();
  for(const value of [copy.status_only,copy.Shipped,'GC-ORDER-51','Local carrier','TEST-TRACK-123','Original order note'])await expect(dialog.getByText(value,{exact:true})).toBeVisible();
  expect(writes).toBe(0);expect(status).toBe('Preparing');
  const confirm=dialog.getByRole('button',{name:t('Confirm this change'),exact:true});await confirm.click();await expect(confirm).toBeDisabled();release();
  await expect(dialog).toContainText('20000000-0000-4000-8000-000000000099');await expect(confirm).toBeEnabled();await expect(dialog.getByText(changes.tracking_number,{exact:true})).toBeVisible();await confirm.click();
  await expect(dialog.getByText(t('Your change was saved and verified.'),{exact:true})).toBeVisible();expect(writes).toBe(1);expect(attempts).toBe(2);await expect(page).toHaveURL(/\/salon\/dashboard$/);
  await page.reload();await open();await send('Read the order status again.');await expect(dialog.getByText(`GC-ORDER-51 · ${copy.Shipped} · TEST-TRACK-123`,{exact:true})).toBeVisible();expect(writes).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('assistant-fulfillment.png')});
 });
}
