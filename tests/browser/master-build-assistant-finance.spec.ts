import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {assistantFinanceCopy} from '../../src/i18n/assistant-finance-record-copy';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height,action]of [['en',390,844,'expense'],['fr',768,900,'receipt'],['es',1440,900,'refund'],['zh-CN',844,390,'expense']] as const){
 test(`Master financial record from Overview retains exact review after failure in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const copy=assistantFinanceCopy(locale),incident='20000000-0000-4000-8000-000000000099';let attempts=0,writes=0,id='';let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});
  await page.route('**/api/salon/assistant',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);const body=route.request().postDataJSON();
   if(body.action==='confirm'){expect(body).toMatchObject({request_id:id,digest:'a'.repeat(64),confirm:true});attempts++;if(attempts===1){await wait;return route.fulfill({status:409,json:{code:'ASSISTANT_READBACK_FAILED',request_id:incident}});}writes++;return route.fulfill({json:{verified:true,result:{id:f.ids.booking,amount_cents:2500,provider_action:false}}});}
   expect(body.action).toBe('plan');id=body.request_id;
   return route.fulfill({json:{response_locale:locale,request:{id,tool:'prepare_finance_record',risk_class:4,digest:'a'.repeat(64),before_summary:{},confirmed_at:null,arguments:{action,amount_cents:2500},execution_payload:{action,record_label:'Original record GC123',amount_cents:2500,occurred_at:'2026-09-22T16:30:00.000Z',time_zone:'America/New_York',finance_payload:{category:action==='expense'?'Supplies':null,treatment:action==='expense'?'operating':null,method:action==='receipt'?'cash':null,note:'Original owner note: serviettes'}}},preview_required:true}});
  });
  await page.goto('/salon/dashboard');const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();
  const message='Record the $25 already paid; show the financial review without moving money.';await dialog.locator('textarea').fill(message);await dialog.getByRole('button',{name:DASHBOARD_SOURCE_MESSAGES[locale]?.['Ask GC Assistant']||'Ask GC Assistant',exact:true}).click();
  await expect(dialog.getByText(copy.intro,{exact:true})).toBeVisible();await expect(dialog.getByText(copy[action],{exact:true})).toBeVisible();await expect(dialog).toContainText('Original record GC123');await expect(dialog).toContainText('Original owner note: serviettes');
  await expect(dialog.getByText(new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(25),{exact:true})).toBeVisible();expect(writes).toBe(0);await expect(page).toHaveURL(/\/salon\/dashboard$/);
  const confirm=dialog.getByRole('button',{name:copy.confirm,exact:true});await confirm.click();await expect(confirm).toBeDisabled();release();await expect(dialog).toContainText(incident);await expect(dialog.getByText(copy.saved,{exact:true})).toHaveCount(0);await expect(confirm).toBeEnabled();
  await confirm.click();await expect(dialog.getByText(copy.saved,{exact:true})).toBeVisible();expect(writes).toBe(1);expect(attempts).toBe(2);await expect(confirm).toHaveCount(0);await expect(dialog.getByText(message,{exact:true})).toHaveCount(1);expect(f.records.bookings).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('assistant-finance-record.png')});
 });
}
