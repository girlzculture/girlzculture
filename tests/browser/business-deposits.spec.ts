import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { summarizeOperatingBooks, type OperatingBooks } from '../../src/lib/businessFinanceCore';
import { BOOKING_DEPOSIT_SOURCE_MESSAGES } from '../../src/i18n/booking-deposit-source-catalog';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});

for(const locale of ['en','fr','es','zh-CN']) test(`Deposit rules are discoverable from compact policies and preserve zero through eighty percent in ${locale}`,async({page},info)=>{
 const f=await p0OwnerFixture(page,{populated:true,locale});
 const t=(s:string)=>BOOKING_DEPOSIT_SOURCE_MESSAGES[locale]?.[s]||DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
 let rule={version:null as string|null,rate:20,threshold_amount:null,threshold_rate:null,repeat_incident_count:null,repeat_incident_rate:null,incident_window_days:365};let writes=0;
 await page.route('**/api/salon/deposit-rules',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{rule}});
  const body=route.request().postDataJSON();expect(body.expected_version).toBe(rule.version);expect(body.rule.rate).toBeLessThanOrEqual(80);
  rule={...body.rule,version:crypto.randomUUID()};writes++;return route.fulfill({json:{rule,verified:true}});
 });
 await page.setViewportSize({width:320,height:844});await page.goto('/salon/dashboard/my-page/business-policies');
 const heading=page.getByRole('heading',{name:t('Your Business Policies'),exact:true});await expect(heading).toBeVisible();
 expect((await heading.boundingBox())!.y).toBeLessThan(300);
 await expect(page.getByRole('link',{name:t('Back to My Page'),exact:true})).toHaveText('');
 await expect(page.getByRole('heading',{name:t('My Page'),exact:true})).toHaveCount(0);
 await expect(page.locator('[data-owner-workspace]').getByRole('link',{name:t('Girlz Culture Policies'),exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('compact-policy-phone.png')});
 await page.getByRole('link',{name:t('Booking deposits'),exact:true}).click();await page.getByRole('button',{name:t('Manage deposit settings'),exact:true}).click();
 const form=page.getByRole('form',{name:t('Booking deposit settings'),exact:true}),rate=form.getByLabel(t('Standard deposit (%)'),{exact:true});
 await expect(rate).toHaveAttribute('max','80');await rate.fill('80.01');await form.getByRole('button',{name:t('Save deposit settings'),exact:true}).click();
 expect(writes).toBe(0);expect(await rate.evaluate((el:HTMLInputElement)=>el.validity.rangeOverflow)).toBe(true);
 for(const value of [0,30,80]){
  const before=writes;await rate.fill(String(value));await expect(rate).not.toHaveAttribute('aria-invalid','true');await expect(page.locator('[data-inline-validation]')).toHaveCount(0);await form.getByRole('button',{name:t('Save deposit settings'),exact:true}).click();
  await expect.poll(()=>writes).toBe(before+1);await expect(page.getByRole('status').filter({hasText:t('Deposit settings saved. Existing bookings keep their original terms.')})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:t('Manage deposit settings'),exact:true}).click();await expect(rate).toHaveValue(String(value));
 }
 for(const [width,height] of [[320,844],[360,800],[390,844],[412,915],[768,1024],[1440,1000],[844,390],[1180,820]]){
  await page.setViewportSize({width,height});await form.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});await form.screenshot({path:info.outputPath('deposit-boundary-phone.png')});expect(f.unexpected).toEqual([]);
});

for(const [locale,width,height] of [['en',1440,1000],['fr',390,844],['es',768,900],['zh-CN',844,390]] as const){
 test(`Deposit rules retain input, retry identity and saved values in ${locale} at ${width}x${height}`,async({page},info)=>{
  const fixture=await p0OwnerFixture(page,{populated:true,locale});const t=(s:string)=>BOOKING_DEPOSIT_SOURCE_MESSAGES[locale]?.[s]||s;
  const books:OperatingBooks={sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]};
  await page.route('**/api/salon/finances**',route=>{const url=new URL(route.request().url());if(url.searchParams.has('options'))return route.fulfill({json:{stylists:fixture.records.stylists}});return route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(fixture.business.id,books,{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:fixture.business.time_zone}),evidence:{},stylists:fixture.records.stylists,arrangements:[]}});});
  let rule={version:null as string|null,rate:10,threshold_amount:null as number|null,threshold_rate:null as number|null,repeat_incident_count:null as number|null,repeat_incident_rate:null as number|null,incident_window_days:365};const attempts:Record<string,unknown>[]=[];let fail=true;
  await page.route('**/api/salon/deposit-rules',async route=>{
   if(route.request().method()==='GET'){await route.fulfill({json:{rule}});return;}
   const input=route.request().postDataJSON();attempts.push(input);
   if(fail){fail=false;await route.fulfill({status:503,json:{code:'DEPOSIT_UNAVAILABLE',request_id:'99000000-0000-4000-8000-000000000083'}});return;}
   rule={...input.rule,version:'99000000-0000-4000-8000-000000000084'};await route.fulfill({json:{rule,verified:true}});
  });
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings?finance=settings');
  await page.getByRole('button',{name:t('Manage deposit settings'),exact:true}).click();
  const form=page.getByRole('form',{name:t('Booking deposit settings')});await form.getByLabel(t('Standard deposit (%)'),{exact:true}).fill('20');
  await form.getByLabel(t('Higher rate above service price (USD)'),{exact:true}).fill('300');await form.getByLabel(t('Higher-price deposit (%)'),{exact:true}).fill('40');
  await form.getByLabel(t('Repeat incidents at this business'),{exact:true}).fill('2');await form.getByLabel(t('Repeat-incident deposit (%)'),{exact:true}).fill('50');
  await form.getByRole('button',{name:t('Save deposit settings')}).click();await expect(page.getByRole('alert').filter({hasText:'99000000-0000-4000-8000-000000000083'})).toBeVisible();
  await expect(form.getByLabel(t('Standard deposit (%)'),{exact:true})).toHaveValue('20');await form.getByRole('button',{name:t('Save deposit settings')}).click();
  await expect(page.getByRole('status').filter({hasText:t('Deposit settings saved. Existing bookings keep their original terms.')})).toBeVisible();expect(attempts).toHaveLength(2);expect(attempts[0]).toEqual(attempts[1]);expect(attempts[0]).not.toHaveProperty('salon_id');
  await page.reload();await page.getByRole('button',{name:t('Manage deposit settings'),exact:true}).click();await expect(form.getByLabel(t('Standard deposit (%)'),{exact:true})).toHaveValue('20');await expect(form.getByLabel(t('Repeat-incident deposit (%)'),{exact:true})).toHaveValue('50');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await form.screenshot({path:info.outputPath('deposit-settings.png')});expect(fixture.unexpected).toEqual([]);
 });
}

test('Attendance change requires review, retains failed explanation and sends one stable retry',async({page},info)=>{
 const fixture=await p0OwnerFixture(page,{populated:true});const id=fixture.ids.booking;
 const booking=fixture.records.bookings.find(row=>row.id===id)!;booking.appointment_datetime=new Date(Date.now()-2*86400000).toISOString();
 let incident:Record<string,unknown>|null=null,fail=true;const writes:Record<string,unknown>[]=[];
 await page.route(`**/api/salon/bookings/${id}/attendance`,async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:{incident}});return;}
  const body=route.request().postDataJSON();writes.push(body);
  if(fail){fail=false;await route.fulfill({status:503,json:{code:'INCIDENT_UNAVAILABLE',request_id:'99000000-0000-4000-8000-000000000085'}});return;}
  incident={kind:body.kind,status:'confirmed',evidence:body.reason};await route.fulfill({json:{incident,verified:true,booking_status:'No Show'}});
 });
 await page.setViewportSize({width:390,height:844});await page.goto(`/salon/dashboard/bookings/${id}`);
 const section=page.getByRole('region',{name:'Appointment attendance'});await section.getByRole('button',{name:'View attendance'}).click();
 await section.getByRole('textbox',{name:'What did you verify?',exact:true}).fill('Fixture absence verified after appointment end');
 await section.getByRole('button',{name:'Review attendance change'}).click();expect(writes).toHaveLength(0);await section.getByRole('button',{name:'Confirm this change',exact:true}).click();
 await expect(section.getByRole('alert')).toContainText('99000000-0000-4000-8000-000000000085');await expect(section.getByRole('textbox',{name:'What did you verify?',exact:true})).toHaveValue('Fixture absence verified after appointment end');
 await section.getByRole('button',{name:'Confirm this change',exact:true}).click();await expect(section.getByRole('status')).toContainText('Attendance saved');expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1]);
 await expect(section).toContainText('No-show');await page.reload();await section.getByRole('button',{name:'View attendance'}).click();await expect(section).toContainText('Fixture absence verified after appointment end');await section.screenshot({path:info.outputPath('attendance.png')});
});
