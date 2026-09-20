import { expect, type Page } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { businessBookingMoney } from '../../src/lib/businessBookingMoney';
import { operatingBooksFromData, type BusinessFinanceData } from '../../src/lib/businessFinanceData';
import { summarizeOperatingBooks } from '../../src/lib/businessFinanceCore';
import { bookingMoneyCopy } from '../../src/i18n/business-booking-money-copy';
import { intlLocale } from '../../src/i18n/catalog';
test.use({serviceWorkers:'block'});
const reference='17900000-0000-4000-8000-000000000090';
async function fixture(page:Page,locale='en') {
 const f=await p0OwnerFixture(page,{locale,populated:true}),calls:string[]=[];
 const period={from:'2026-03-08',to:'2026-03-14',timeZone:f.business.time_zone};
 const offer='17900000-0000-4000-8000-000000000020';
 const bookings=[0,1].map(index=>({id:`17900000-0000-4000-8000-00000000001${index}`,salon_id:f.business.id,stylist_id:f.ids.professional,name:'Booked service',created_at:'2026-03-01T12:00:00Z',appointment_datetime:'2026-03-09T12:00:00Z',service_completed_at:null,status:index?'No-show':'Cancelled',booking_origin:'platform',source:'platform',estimated_total:180,subtotal_before_promotion:200,deposit_amount:18,deposit_status:'Paid',payment_mode:'live',payment_verified_at:'2026-03-01T12:00:00Z',verified_charge:true,refund_status:index?'Succeeded':null,refund_amount:index?8:0,refund_completed_at:index?'2026-03-10T12:00:00Z':null,verified_refund:Boolean(index),operating_compensation:{kind:'none',version:null},salon_promotion_id:offer,promotion_snapshot:{promotion_id:offer,title:'Saved booking offer GC179',discount_amount:20,adjusted_total:180,subtotal_before_promotion:200},promotion_discount_amount:20}));
 const data:BusinessFinanceData={scope:{kind:'business',stylist_id:null},bookings,sales:[],receipts:[],expenses:[],arrangements:[],obligations:[],compensation_payments:[],stylists:[]};
 const {books}=operatingBooksFromData(f.business.id,data);const state={fail:false,incomplete:false};
 await page.route('**/api/salon/finances?*',route=>{const url=new URL(route.request().url());if(url.searchParams.has('options'))return route.fulfill({json:{stylists:[],products:[]}});return route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(f.business.id,books,period),evidence:{},stylists:[],arrangements:[]}});});
 await page.route('**/api/salon/booking-money?*',route=>{
  expect(route.request().method()).toBe('GET');expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);calls.push(route.request().method());
  if(state.fail)return route.fulfill({status:503,json:{code:'BOOKING_MONEY_UNAVAILABLE',request_id:reference},headers:{'X-Request-ID':reference}});
  const source=structuredClone(data);if(state.incomplete)source.bookings[0].promotion_snapshot={};
  return route.fulfill({json:businessBookingMoney(f.business.id,books,source,source.bookings,period)});
 });
 return {...f,calls,state,period};
}
for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Business booking money separates current cancellation and no-show evidence in ${locale}`,async({page},info)=>{
  const f=await fixture(page,locale),t=(source:string,values:Record<string,string>={})=>bookingMoneyCopy(locale,source,values),money=(value:number)=>new Intl.NumberFormat(intlLocale(locale),{style:'currency',currency:'USD'}).format(value);
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings?finance_from=2026-03-08&finance_to=2026-03-14');const panel=page.getByRole('region',{name:t('Booking outcomes and offers'),exact:true});
  await expect(panel.getByRole('heading',{name:t('Cancelled appointments'),exact:true})).toBeVisible();await expect(panel.getByRole('heading',{name:t('No-shows'),exact:true})).toBeVisible();await expect(panel.getByText(t('Net recorded receipts retained: {value}',{value:money(18)}),{exact:true})).toBeVisible();await expect(panel.getByText(t('Net recorded receipts retained: {value}',{value:money(10)}),{exact:true})).toBeVisible();await expect(panel.getByText('Saved booking offer GC179',{exact:true})).toBeVisible();await expect(panel).not.toContainText(/customer_id|cus_|private@/);
  await page.reload();await expect(panel.getByText('Saved booking offer GC179',{exact:true})).toBeVisible();await panel.getByRole('button',{name:t('Refresh booking evidence'),exact:true}).click();await expect(panel.getByText(t('Net recorded receipts retained: {value}',{value:money(10)}),{exact:true})).toBeVisible();expect(f.calls.length).toBeGreaterThanOrEqual(3);expect(f.calls.every(value=>value==='GET')).toBe(true);expect(f.unexpected).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await panel.screenshot({path:info.outputPath(`booking-money-${locale}-${width}.png`)});
  const headerBottom=await page.locator('.gc-owner-header').evaluate(element=>element.getBoundingClientRect().bottom);
  await panel.evaluate((element,offset)=>window.scrollBy(0,element.getBoundingClientRect().top-offset),headerBottom+16);
  await page.screenshot({path:info.outputPath(`booking-money-${locale}-${width}-outcomes-viewport.png`)});
  await panel.getByRole('heading',{name:t('Recorded business-offer usage'),exact:true}).evaluate((element,offset)=>window.scrollBy(0,element.getBoundingClientRect().top-offset),headerBottom+16);
  await page.screenshot({path:info.outputPath(`booking-money-${locale}-${width}-offers-viewport.png`)});
 });
}
test('Business booking money clears stale positive figures on failure and safely recovers with exact reference',async({page})=>{
 const f=await fixture(page);await page.goto('/salon/dashboard/earnings?finance_from=2026-03-08&finance_to=2026-03-14');const panel=page.getByRole('region',{name:'Booking outcomes and offers',exact:true});await expect(panel.getByText('Saved booking offer GC179',{exact:true})).toBeVisible();f.state.fail=true;await panel.getByRole('button',{name:'Refresh booking evidence',exact:true}).click();await expect(panel.getByRole('alert')).toContainText(reference);await expect(panel.getByText('Saved booking offer GC179',{exact:true})).toHaveCount(0);await expect(panel.getByText('No business-offer use is recorded for this appointment cohort.',{exact:true})).toHaveCount(0);f.state.fail=false;await panel.getByRole('button',{name:'Refresh booking evidence',exact:true}).click();await expect(panel.getByText('Saved booking offer GC179',{exact:true})).toBeVisible();expect(f.calls.every(value=>value==='GET')).toBe(true);
});
test('Business booking money marks incomplete promotion evidence unavailable rather than zero usage',async({page})=>{
 const f=await fixture(page);f.state.incomplete=true;await page.goto('/salon/dashboard/earnings?finance_from=2026-03-08&finance_to=2026-03-14');const panel=page.getByRole('region',{name:'Booking outcomes and offers',exact:true});await expect(panel.getByRole('status')).toContainText('1 bookings have incomplete offer evidence.');await expect(panel.getByText('No business-offer use is recorded for this appointment cohort.',{exact:true})).toHaveCount(0);await expect(panel.getByText('Saved booking offer GC179',{exact:true})).toHaveCount(0);
});
test('Business booking money requires full finance and booking permissions together',async({page})=>{
 const f=await fixture(page);await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{earnings:true},records:f.records}}));await page.goto('/salon/dashboard/earnings?finance_from=2026-03-08&finance_to=2026-03-14');await expect(page.getByRole('heading',{name:'Completed sales by day',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Booking outcomes and offers',exact:true})).toHaveCount(0);expect(f.calls).toEqual([]);
});
