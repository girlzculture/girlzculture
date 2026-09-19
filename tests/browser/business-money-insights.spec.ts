import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {summarizeOperatingBooks,type OperatingBooks,type OperatingSale} from '../../src/lib/businessFinanceCore';
import {BUSINESS_MONEY_SOURCE_MESSAGES as messages} from '../../src/i18n/business-money-source-catalog';
import {intlLocale} from '../../src/i18n/catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height] of [['en',1440,1000],['fr',390,844],['es',768,1024],['zh-CN',844,390]] as const){
 test(`Business money insights preserves measured facts and period-linked actions in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});
  const sale=(id:string,at:string,cents:number):OperatingSale=>({id,salon_id:f.business.id,source:'walk_in',kind:'service',occurred_at:at,recorded_at:at,status:'completed',name:'Silk Press',stylist_id:f.ids.professional,client_id:null,client_name:null,list_cents:cents,discount_cents:0,agreed_cents:cents,cost_cents:null,quantity:1,compensation:{kind:'none',version:null}});
  const books:OperatingBooks={sales:[sale('old','2026-08-15T15:00:00Z',10000),sale('current','2026-09-15T15:00:00Z',12000)],payments:[{id:'receipt:current',salon_id:f.business.id,sale_id:'current',occurred_at:'2026-09-15T15:00:00Z',stage:'deposit',method:'cash',amount_cents:1200,original_payment_id:null}],expenses:[],obligations:[],compensation_payments:[]};
  await page.route('**/api/salon/finances?*',route=>{const url=new URL(route.request().url());if(url.searchParams.has('options'))return route.fulfill({json:{stylists:f.records.stylists,products:[]}});return route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(f.business.id,books,{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:f.business.time_zone}),evidence:{},stylists:f.records.stylists,arrangements:[]}});});
  const t=(source:string,values:Record<string,string>={})=>(messages[locale][source]||source).replace(/\{(value\d+)\}/g,(_,key)=>values[key]||'');
  const money=(amount:number)=>new Intl.NumberFormat(intlLocale(locale),{style:'currency',currency:'USD'}).format(amount);
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings?finance_from=2026-09-01&finance_to=2026-09-30');
  const insight=page.getByRole('region',{name:t('Business money insights'),exact:true});
  await expect(insight.getByText(t('Completed sales: {value0}; previous period: {value1}.',{value0:money(120),value1:money(100)}),{exact:true})).toBeVisible();
  await expect(insight.getByText(t('Net receipts recorded in this period: {value0}.',{value0:money(12)}),{exact:true})).toBeVisible();
  await insight.getByText(t('Your recorded service price samples'),{exact:true}).click();
  await expect(insight.getByText('Silk Press',{exact:true})).toBeVisible();
  await expect(insight.getByText(t('No completed service samples in this period.'),{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`money-insights-${locale}.png`),fullPage:true});
  const headerBottom=await page.locator('.gc-owner-header').evaluate(element=>element.getBoundingClientRect().bottom);
  await insight.evaluate((element,offset)=>window.scrollBy(0,element.getBoundingClientRect().top-offset),headerBottom+16);
  await page.screenshot({path:info.outputPath(`money-insights-${locale}-viewport.png`)});
  await insight.getByRole('link',{name:t('Review recorded unpaid balances'),exact:true}).click();
  await expect(page).toHaveURL(/finance=transactions/);await expect(page).toHaveURL(/finance_from=2026-09-01/);await expect(page).toHaveURL(/finance_to=2026-09-30/);
  await page.reload();await expect(page).toHaveURL(/finance=transactions/);expect(f.unexpected).toEqual([]);
 });
}
test('Business money insights does not label a professional-only ledger as whole-business advice',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true});
 await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{earnings_own:true},records:f.records}}));
 const books:OperatingBooks={sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]};
 await page.route('**/api/salon/finances?*',route=>{const url=new URL(route.request().url());return route.fulfill({json:{scope:{kind:'own'},books,summary:summarizeOperatingBooks(f.business.id,books,{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:f.business.time_zone}),evidence:{},stylists:[],arrangements:[]}});});
 await page.goto('/salon/dashboard/earnings?finance_from=2026-09-01&finance_to=2026-09-30');
 await expect(page.getByRole('heading',{name:'Completed sales by day',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Business money insights',exact:true})).toHaveCount(0);
 expect(f.unexpected).toEqual([]);
});
