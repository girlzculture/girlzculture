import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { summarizeOperatingBooks, type OperatingBooks } from '../../src/lib/businessFinanceCore';
import { BOOKING_DEPOSIT_SOURCE_MESSAGES } from '../../src/i18n/booking-deposit-source-catalog';
test.use({serviceWorkers:'block'});

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
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings');
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
