import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { businessScheduleOpportunities } from '../../src/lib/businessScheduleOpportunities';
import { scheduleCopy } from '../../src/i18n/business-schedule-copy';
import { intlLocale } from '../../src/i18n/catalog';
test.use({ serviceWorkers: 'block' });
function result(f: Awaited<ReturnType<typeof p0OwnerFixture>>) {
 const hours=Object.fromEntries(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=>[day,{open:'09:00',close:'17:00',closed:day!=='Mon'}]));
 return businessScheduleOpportunities(f.business.id,{salon:{id:f.business.id,hours},timeZone:'America/New_York',roster:[{id:f.ids.professional,salon_id:f.business.id,name:'Save',is_active:true,availability:hours}],bookings:[{id:f.ids.booking,salon_id:f.business.id,stylist_id:f.ids.professional,appointment_datetime:'2026-09-21T13:00:00Z',blocked_until:'2026-09-21T15:00:00Z',status:'Confirmed'}],intents:[],blockouts:[]},Date.parse('2026-09-21T12:00:00Z'));
}
for (const [locale,width,height] of [['en',1440,1000],['fr',390,844],['es',768,1024],['zh-CN',844,390]] as const) {
 test(`Business schedule opportunities opens the exact reviewed calendar in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale}),data=result(f);let writes=0;
  await page.route('**/api/salon/schedule-opportunities',route=>{if(route.request().method()!=='GET')writes++;return route.fulfill({json:data});});
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings?finance_from=2026-08-01&finance_to=2026-08-31');
  const t=(key:Parameters<typeof scheduleCopy>[1],values:Record<string,string>={})=>scheduleCopy(locale,key,values);
  const n=(value:number)=>new Intl.NumberFormat(intlLocale(locale)).format(value),region=page.getByRole('region',{name:t('title'),exact:true});
  await expect(region.getByText(t('totals',{free:n(360),booked:n(120),held:n(0),capacity:n(480)}),{exact:true})).toBeVisible();
  await expect(region.getByText(t('share',{percent:n(25)}),{exact:true})).toBeVisible();
  await expect(region.getByText('Save',{exact:true})).toBeVisible();
  await expect(region.getByRole('link',{name:t('review'),exact:true})).toHaveAttribute('href',`/salon/dashboard/availability?date=2026-09-21&stylist=${f.ids.professional}`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await region.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`schedule-${locale}.png`),fullPage:true});
  await region.getByRole('link',{name:t('review'),exact:true}).click();await expect(page).toHaveURL(/date=2026-09-21/);await expect(page).toHaveURL(new RegExp(`stylist=${f.ids.professional}`));
  const calendar=page.locator('section').filter({has:page.locator('input[type="date"][value="2026-09-21"]')}).last();
  await expect(calendar.locator('input[type="date"]')).toHaveValue('2026-09-21');
  // Assert the exact validated identifier, not just a translated option label.
  expect(await page.locator('select').evaluateAll((elements,id)=>elements.some(element=>(element as HTMLSelectElement).value===id),f.ids.professional)).toBe(true);
  await page.reload();await expect(page.locator('input[type="date"][value="2026-09-21"]')).toHaveValue('2026-09-21');expect(writes).toBe(0);expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
}
test('Business schedule opportunities clears stale evidence during a gated failed refresh and recovers with exact reference',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true}),data=result(f);let reads=0,release!:()=>void,entered!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;}),requested=new Promise<void>(resolve=>{entered=resolve;});
 const reference='55000000-0000-4000-8000-000000000001';
 await page.route('**/api/salon/schedule-opportunities',async route=>{reads++;if(reads===2){entered();await held;return route.fulfill({status:503,json:{code:'SCHEDULE_UNAVAILABLE',request_id:reference,error:'Schedule opportunities could not be verified. Refresh to check the current calendar.'}});}return route.fulfill({json:data});});
 await page.goto('/salon/dashboard/earnings');const region=page.getByRole('region',{name:'Schedule opportunities',exact:true});await expect(region.getByRole('link',{name:'Review this calendar',exact:true})).toBeVisible();
 await region.getByRole('button',{name:'Refresh schedule',exact:true}).click();await requested;await expect(region.getByRole('link')).toHaveCount(0);await expect(region.getByText(/360 free professional-minutes/)).toHaveCount(0);
 release();await expect(region.getByRole('alert')).toContainText(reference);await expect(region.getByRole('link')).toHaveCount(0);await region.getByRole('button',{name:'Refresh schedule',exact:true}).click();await expect(region.getByRole('link',{name:'Review this calendar',exact:true})).toBeVisible();expect(f.unexpected).toEqual([]);
});
test('Business schedule opportunities does not request calendar data for a finance-only role',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true});let reads=0;
 await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{earnings:true},records:f.records}}));
 await page.route('**/api/salon/schedule-opportunities',route=>{reads++;return route.fulfill({json:result(f)});});
 await page.goto('/salon/dashboard/earnings');await expect(page.getByRole('heading',{name:'Completed sales by day',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Schedule opportunities',exact:true})).toHaveCount(0);expect(reads).toBe(0);expect(f.unexpected).toEqual([]);
});
test('Business schedule opportunities labels an assigned professional scope and missing hours honestly',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true});let reads=0;
 await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{earnings:true,availability:true},records:f.records}}));
 await page.route('**/api/salon/schedule-opportunities',route=>{reads++;return reads===1?route.fulfill({json:{...result(f),scope:'assigned_professional'}}):route.fulfill({status:409,json:{code:'SCHEDULE_HOURS_UNAVAILABLE'}});});
 await page.goto('/salon/dashboard/earnings');const region=page.getByRole('region',{name:'Schedule opportunities',exact:true});await expect(region.getByText(scheduleCopy('en','own'),{exact:true})).toBeVisible();await region.getByRole('button',{name:'Refresh schedule',exact:true}).click();await expect(region.getByRole('alert')).toContainText(scheduleCopy('en','hours'));await expect(region.getByRole('link')).toHaveCount(0);expect(f.unexpected).toEqual([]);
});
