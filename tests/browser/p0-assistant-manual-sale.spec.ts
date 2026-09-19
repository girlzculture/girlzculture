import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
import { ASSISTANT_MANUAL_SALE_SOURCE_MESSAGES } from '../../src/i18n/assistant-manual-sale-source-catalog';
import { BUSINESS_FINANCE_SOURCE_MESSAGES } from '../../src/i18n/business-finance-source-catalog';
import { intlLocale } from '../../src/i18n/catalog';
test.use({serviceWorkers:'block'});
const text=(locale:string,source:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[source]||ASSISTANT_MANUAL_SALE_SOURCE_MESSAGES[locale]?.[source]||BUSINESS_FINANCE_SOURCE_MESSAGES[locale]?.[source]||source;
const noCharge='This records payment you already received in Finances. Girlz Culture will not charge the client, send a receipt or create an appointment.';
const saved='The received payment was recorded and verified in Finances. No customer charge was made.';
for(const [locale,width,height] of [['en',390,844],['fr',768,1000],['es',1440,1000],['zh-CN',844,390]] as const){
  test(`P0 Assistant manual receipt requires reviewed own service and received cash in ${locale}`,async({page},info)=>{
    const f=await p0OwnerFixture(page,{populated:true,locale}),t=(source:string)=>text(locale,source);let writes=0;let pending:Record<string,unknown>|null=null;
    const source=locale==='es'?'social':'walk_in';
    await page.route('**/api/salon/assistant',async route=>{
      expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);const input=route.request().postDataJSON();
      if(input.action==='confirm'){expect(input).toMatchObject({request_id:pending!.id,digest:pending!.digest,confirm:true});writes++;return route.fulfill({json:{verified:true,result:{sale_id:f.ids.service,receipt_id:f.ids.booking,amount_cents:12000,method:'cash',provider_charge:false}}});}
      expect(input.action).toBe('plan');expect(input.locale).toBe(locale);pending={id:input.request_id,tool:'prepare_manual_service_sale',risk_class:4,digest:'c'.repeat(64),before_summary:{},arguments:{service_id:f.ids.service,stylist_id:f.ids.professional,amount_cents:12000,method:'cash',source,date:'2026-09-18',time:'12:30',client_name:null,payment_received:true},execution_payload:{service_name:'Silk Press GC123',professional_name:'Aisha',amount_cents:12000,method:'cash',source,client_name:null,occurred_at:'2026-09-18T16:30:00.000Z',time_zone:'America/New_York'},confirmed_at:null};return route.fulfill({json:{request:pending,preview_required:true}});
    });
    await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings');await expect(page.locator('[data-owner-workspace]')).toBeVisible();
    const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();
    await dialog.locator('textarea').fill('Record the completed Silk Press: received $120 cash today from an anonymous client, performed by Aisha.');await dialog.getByRole('button',{name:t('Ask GC Assistant'),exact:true}).click();
    await expect(dialog.getByText(t(noCharge),{exact:true})).toBeVisible();await expect(dialog).toContainText('Silk Press GC123');await expect(dialog).toContainText('Aisha');
    await expect(dialog.getByText(t(source==='social'?'Social media':'Walk-in'),{exact:true})).toBeVisible();await expect(dialog.getByText(t('Cash'),{exact:true})).toBeVisible();
    const receivedAt=new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'}).format(new Date('2026-09-18T16:30:00.000Z'));await expect(dialog.getByText(receivedAt,{exact:true})).toBeVisible();
    const expectedAmount=new Intl.NumberFormat(intlLocale(locale),{style:'currency',currency:'USD'}).format(120);await expect(dialog.getByText(expectedAmount,{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:t('Confirm this public action'),exact:true})).toHaveCount(0);expect(writes).toBe(0);
    const confirm=dialog.getByRole('button',{name:t('Record received payment'),exact:true});await confirm.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`manual-receipt-${locale}-${width}.png`)});await confirm.click();await expect(dialog.getByText(t(saved),{exact:true})).toBeVisible();expect(writes).toBe(1);await expect(confirm).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
}
test('P0 Assistant manual receipt keeps its preview and exact confirmation identity after failed readback',async({page})=>{
  const f=await p0OwnerFixture(page,{populated:true});let id='';let attempts=0;let release!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/salon/assistant',async route=>{
    const input=route.request().postDataJSON();if(input.action==='confirm'){expect(input.request_id).toBe(id);expect(input.digest).toBe('c'.repeat(64));attempts++;if(attempts===1){await waiting;return route.fulfill({status:409,json:{code:'ASSISTANT_READBACK_FAILED',request_id:'17700000-0000-4000-8000-000000000091'}});}return route.fulfill({json:{verified:true,result:{amount_cents:12000,provider_charge:false}}});}
    id=input.request_id;return route.fulfill({json:{request:{id,tool:'prepare_manual_service_sale',risk_class:4,digest:'c'.repeat(64),before_summary:{},arguments:{amount_cents:12000},execution_payload:{service_name:'Silk Press GC123',professional_name:'Aisha',amount_cents:12000,method:'cash'},confirmed_at:null},preview_required:true}});
  });
  await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/earnings');await page.getByRole('button',{name:'GC Assistant',exact:true}).click();const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});await dialog.locator('textarea').fill('Record received cash, $120, Silk Press, professional Aisha.');await dialog.getByRole('button',{name:'Ask GC Assistant',exact:true}).click();
  const confirm=dialog.getByRole('button',{name:'Record received payment',exact:true});await confirm.click();await expect.poll(()=>attempts).toBe(1);await expect(confirm).toBeDisabled();release();await expect(dialog).toContainText('17700000-0000-4000-8000-000000000091');await expect(dialog.getByText(saved,{exact:true})).toHaveCount(0);await expect(confirm).toBeEnabled();await confirm.click();await expect(dialog.getByText(saved,{exact:true})).toBeVisible();expect(attempts).toBe(2);expect(f.records.bookings).toHaveLength(1);
});
