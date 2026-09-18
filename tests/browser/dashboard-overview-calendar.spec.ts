import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
test.use({serviceWorkers:'block'});
for(const [width,height] of [[390,844],[768,900],[1440,1000],[844,390]]){
 test(`Dashboard redesign calendar first and actual overview at ${width}x${height}`,async({page},info)=>{
  await page.clock.setFixedTime(new Date('2026-09-18T14:00:00Z'));
  const fixture=await p0OwnerFixture(page,{populated:true});
  fixture.records.bookings[0]={...fixture.records.bookings[0],appointment_datetime:'2026-09-18T17:00:00Z',duration_hours:2,guest_name:'Fixture client'};
  fixture.records.bookings.push({...fixture.records.bookings[0],id:'completed-record',status:'Completed',appointment_datetime:'2026-09-17T15:00:00Z',estimated_total:100});
  fixture.records.stylists.push({id:'professional-B',salon_id:fixture.business.id,name:'Second professional',is_active:true});
  fixture.records.salon_blockouts.push({id:'closure-A',salon_id:fixture.business.id,reason:'Fixture closure',starts_at:'2026-09-17T13:00:00Z',ends_at:'2026-09-19T04:00:00Z'});
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/availability');
  const calendar=page.getByRole('region',{name:'Appointment calendar',exact:true});await expect(calendar).toBeVisible();
  await expect(calendar.getByText('Fixture closure',{exact:true})).toHaveCount(2);
  await expect(calendar.getByText('Fixture client',{exact:true})).toHaveCount(2);
  await page.getByRole('combobox',{name:'Calendar professional',exact:true}).selectOption('professional-B');
  await expect(calendar.getByText('Fixture client',{exact:true})).toHaveCount(0);await expect(calendar.getByText('Fixture closure',{exact:true})).toHaveCount(2);
  await page.getByRole('combobox',{name:'Calendar professional',exact:true}).selectOption('');
  await calendar.getByRole('button',{name:'Day',exact:true}).click();await expect(calendar.getByText('Fixture client',{exact:true})).toHaveCount(1);
  await calendar.getByLabel('Calendar date',{exact:true}).fill('2026-09-19');await expect(calendar.getByText('Fixture closure',{exact:true})).toHaveCount(0);
  await calendar.getByLabel('Calendar date',{exact:true}).fill('2026-09-18');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:info.outputPath('calendar.png'),fullPage:true});
  await page.screenshot({path:info.outputPath('calendar-viewport.png')});
  await page.getByText('Calendar tools',{exact:true}).click();await page.getByRole('link',{name:'Store hours',exact:true}).click();await expect(page.getByRole('heading',{name:'Store hours',exact:true})).toBeVisible();
  await page.goto('/salon/dashboard');await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
  const summary=page.getByRole('combobox',{name:'Summary period',exact:true});await summary.selectOption('month');
  await expect(page.getByText('2 marketplace appointments · 0 business-added appointments. Completed value is not cash received. Identified clients exclude unnamed guests.',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Booking trends'})).toContainText('Sep');
  await summary.selectOption('today');await expect(page.getByText('1 marketplace appointments · 0 business-added appointments. Completed value is not cash received. Identified clients exclude unnamed guests.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:info.outputPath('overview.png'),fullPage:true});
  await page.screenshot({path:info.outputPath('overview-viewport.png')});
  expect(fixture.unexpected).toEqual([]);
 });
}
