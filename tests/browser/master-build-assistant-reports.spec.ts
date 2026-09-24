import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {BUSINESS_FINANCE_SOURCE_MESSAGES} from '../../src/i18n/business-finance-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,900],['zh-CN',844,390]] as const){
 test(`Master assistant report downloads retain dates, conversation language, auth and failure recovery in ${locale}`,async({page},info)=>{
  const fixture=await p0OwnerFixture(page,{populated:true,locale:'en'});await page.setViewportSize({width,height});
  const t=(s:string)=>BUSINESS_FINANCE_SOURCE_MESSAGES[locale]?.[s]||s;
  let plans=0,downloads=0;let release!:()=>void;const pending=new Promise<void>(r=>{release=r;});
  await page.route('**/api/salon/assistant',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${fixture.session.access_token}`);
   const body=route.request().postDataJSON();expect(body.action).toBe('plan');plans++;
   return route.fulfill({json:{response_locale:locale,request:{id:body.request_id,tool:'get_earnings_summary',risk_class:1,arguments:{},result:{scope:'authenticated_business_only',period:{from:'2026-09-01',to:'2026-09-30',timeZone:'America/New_York'}},confirmed_at:null},assistant_message:locale==='fr'?'Votre rapport est prêt.':locale==='es'?'Su informe está listo.':locale==='zh-CN'?'您的报告已准备好。':'Your report is ready.'}});
  });
  await page.route('**/api/salon/finances/export?*',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${fixture.session.access_token}`);
   const query=Object.fromEntries(new URL(route.request().url()).searchParams);
   expect(query).toEqual({from:'2026-09-01',to:'2026-09-30',locale,format:downloads<2?'pdf':'xlsx'});
   downloads++;
   if(downloads===1){await pending;return route.fulfill({status:503,json:{code:'FINANCE_EXPORT_UNAVAILABLE',request_id:'99000000-0000-4000-8000-000000000079'}});}
   return route.fulfill({contentType:query.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',body:Buffer.from(query.format==='pdf'?'%PDF-fixture':'xlsx fixture')});
  });
  await page.goto('/salon/dashboard');await page.getByRole('button',{name:'GC Assistant',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});await dialog.locator('textarea').fill(`Show my September finance report in ${locale}.`);await dialog.getByRole('button',{name:'Ask GC Assistant',exact:true}).click();
  const pdf=dialog.getByRole('button',{name:t('Download PDF'),exact:true}),xlsx=dialog.getByRole('button',{name:t('Download spreadsheet'),exact:true});
  await expect(pdf).toBeVisible();await expect(dialog).toContainText('2026-09-01 – 2026-09-30 · America/New_York');
  await pdf.click();await expect(pdf).toBeDisabled();await expect(xlsx).toBeDisabled();release();
  await expect(dialog.getByRole('alert')).toContainText('99000000-0000-4000-8000-000000000079');await expect(pdf).toBeEnabled();
  for(const [button,extension]of [[pdf,'pdf'],[xlsx,'xlsx']] as const){const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);expect(download.suggestedFilename()).toBe(`girlz-culture-finances-2026-09-01-2026-09-30-${locale}.${extension}`);}
  await expect(dialog.getByRole('alert')).toHaveCount(0);expect(plans).toBe(1);expect(downloads).toBe(3);
  await expect(page).toHaveURL(/\/salon\/dashboard$/);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('assistant-report.png')});
 });
}
