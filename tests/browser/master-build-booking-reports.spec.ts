import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {MASTER_BUILD_COPY} from '../../src/i18n/master-build-source-catalog';
import {summarizeOperatingBooks,type OperatingBooks} from '../../src/lib/businessFinanceCore';
test.use({serviceWorkers:'block'});
for(const [locale,index,width,height] of [['en',0,390,844],['fr',1,768,900],['es',2,1440,1000],['zh-CN',3,844,390]] as const){
 test(`Master booking report preserves entitlement and scoped facts in ${locale} at ${width}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});const t=(source:string)=>MASTER_BUILD_COPY.find(row=>row[0]===source)?.[index]||source;
  const books:OperatingBooks={sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]};
  await page.route('**/api/salon/finances?*',route=>{const u=new URL(route.request().url());if(u.searchParams.has('options'))return route.fulfill({json:{stylists:f.records.stylists}});return route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(f.business.id,books,{from:u.searchParams.get('from')!,to:u.searchParams.get('to')!,timeZone:f.business.time_zone}),evidence:{},stylists:f.records.stylists,arrangements:[]}});});
  let level='advanced',reads=0,fail=true;const totals={bookings:3,completed:2,cancelled:1,no_shows:0,completed_value_cents:22500,missing_prices:0};
  await page.route('**/api/salon/booking-report?*',route=>{reads++;expect(new URL(route.request().url()).search).toBe('?month=2026-09');if(fail){fail=false;return route.fulfill({status:503,json:{code:'REPORT_UNAVAILABLE',request_id:'11000000-0000-4000-8000-000000000099'},headers:{'X-Request-ID':'11000000-0000-4000-8000-000000000099'}});}return route.fulfill({json:{report:{salon_id:f.business.id,month:'2026-09-01',through:'2026-09-30',plan:level==='basic'?'starter':'premium',level,scope:'business',is_demo:false,time_zone:f.business.time_zone,as_of:'2026-09-23T12:00:00Z',totals,sources:level==='basic'?[{name:'platform',bookings:2},{name:'off_platform',bookings:1}]:[{name:'platform',bookings:2},{name:'walk_in',bookings:1}],daily:level==='basic'?null:[{day:'2026-09-02',bookings:3,completed:2}],services:level==='basic'?null:[{name:'Save',bookings:3,completed:2}],team:level==='advanced'?[{name:'Cancel',bookings:3,completed:2}]:null,comparison:level==='advanced'?{month:'2026-08-01',totals:{...totals,bookings:2,completed_value_cents:10000},sources:[{name:'platform',bookings:2}]}:null}}});});
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings?finance=reports&finance_from=2026-09-01&finance_to=2026-09-30');
  const report=page.getByRole('region',{name:t('Monthly appointment report'),exact:true});
  await expect(report.getByRole('alert')).toContainText('11000000-0000-4000-8000-000000000099');
  await report.getByRole('alert').getByRole('button').click();await expect(report).toContainText(t('Advanced reporting'));
  await expect(report).toContainText(new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(225));
  await report.locator('summary').filter({hasText:t('Services in this month')}).click();
  await expect(report.locator('dt[data-no-translate]').filter({hasText:/^Save$/})).toHaveText('Save');
  await report.locator('summary').filter({hasText:t('Team appointment comparison')}).click();
  await expect(report.locator('dt[data-no-translate]').filter({hasText:/^Cancel$/})).toHaveText('Cancel');
  await expect(report).toContainText('2026-08');expect(reads).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await report.screenshot({path:info.outputPath('booking-report.png')});
  level='basic';await page.reload();await expect(report).toContainText(t('Basic reporting'));
  await expect(report.locator('summary')).toHaveCount(0);await expect(report).not.toContainText('2026-08');
  await expect(report).toContainText(t('Outside the platform'));expect(f.unexpected).toEqual([]);
 });
}
