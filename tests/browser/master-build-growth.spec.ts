import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {MASTER_BUILD_COPY} from '../../src/i18n/master-build-source-catalog';
import {APPOINTMENT_WAITLIST_SOURCE_MESSAGES} from '../../src/i18n/appointment-waitlist-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Master growth controls save, retain failed edits and refresh in ${locale}`,async({page},info)=>{
  await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const column=locale==='en'?0:locale==='fr'?1:locale==='es'?2:3,t=(value:string)=>MASTER_BUILD_COPY.find(row=>row[0]===value)?.[column]||value;
  const service=randomUUID(),professional=randomUUID();let settings={revision:0,plan:'premium',reminder_hours:null as number[]|null,effective_reminder_hours:[24,2],reminder_limit:6,waitlist_mode:'targeted',waitlist_service_ids:[] as string[],waitlist_professional_ids:[] as string[],services:[{id:service,name:'Boho / Knotless Braids'}],professionals:[{id:professional,name:'Alma Aba'}]};
  const saves:Record<string,unknown>[]=[];let conflict=false;
  await page.route('**/api/salon/growth-settings',async route=>{
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();saves.push(body);if(saves.length===1)return route.fulfill({status:503,json:{code:'GROWTH_UNAVAILABLE',request_id:'55000000-0000-4000-8000-000000000001'}});if(conflict)return route.fulfill({status:409,json:{code:'GROWTH_STALE',request_id:'55000000-0000-4000-8000-000000000002'}});expect(body.revision).toBe(settings.revision);settings={...settings,...body,revision:body.revision+1,effective_reminder_hours:body.reminder_hours||[24,2]};return route.fulfill({json:{settings,verified:true}});}
   return route.fulfill({json:{settings}});
  });
  await page.goto('/salon/dashboard/settings/notifications');const form=page.getByRole('region',{name:t('Customer reminders & waitlist')});
  await form.getByRole('checkbox',{name:t('Use standard reminder timing')}).uncheck();
  const input=form.getByLabel(t('Hours before the appointment (comma separated)'),{exact:false});await input.fill('48, 3');
  await form.getByRole('checkbox',{name:'Boho / Knotless Braids',exact:true}).check();await form.getByRole('checkbox',{name:'Alma Aba',exact:true}).check();
  const save=form.locator('button[type="submit"],button:not([type])');await save.click();
  await expect(form.getByRole('alert')).toContainText('55000000-0000-4000-8000-000000000001');await expect(input).toHaveValue('48, 3');await save.click();
  await expect(form.getByRole('status')).toContainText(t('Reminder and waitlist settings saved and verified.'));
  expect(saves[1]).toEqual({revision:0,reminder_hours:[48,3],waitlist_service_ids:[service],waitlist_professional_ids:[professional]});
  await page.reload();await expect(input).toHaveValue('48, 3');await expect(form.getByRole('checkbox',{name:'Alma Aba',exact:true})).toBeChecked();
  conflict=true;await input.fill('72, 1');await save.click();await expect(form.getByRole('alert')).toContainText('55000000-0000-4000-8000-000000000002');await expect(input).toHaveValue('72, 1');
  await form.getByRole('button',{name:t('Reload saved settings'),exact:true}).click();await expect(input).toHaveValue('48, 3');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await form.screenshot({path:info.outputPath('business-growth-controls.png')});
 });
 test(`Master growth manual waitlist reviews before offering and recovers in ${locale}`,async({page})=>{
  await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const column=locale==='en'?0:locale==='fr'?1:locale==='es'?2:3,t=(value:string)=>MASTER_BUILD_COPY.find(row=>row[0]===value)?.[column]||APPOINTMENT_WAITLIST_SOURCE_MESSAGES[locale]?.[value]||value;
  const id=randomUUID(),source=randomUUID();let offered=false;const posts:Record<string,unknown>[]=[];
  await page.route('**/api/salon/waitlist',route=>route.fulfill({json:{requests:[{id,style_id:randomUUID(),stylist_id:null,starts_after:'2030-06-10T13:00:00Z',starts_before:'2030-06-10T20:00:00Z',status:'waiting',service_name:'Boho / Knotless Braids',customer_name:'Sample Client',open_offers:offered?1:0}]}}));
  await page.route('**/api/salon/waitlist/openings',route=>{const body=route.request().postDataJSON();posts.push(body);if(body.action==='review')return route.fulfill({json:{offered:false,openings:[{source_booking_id:source,appointment_at:'2030-06-10T14:00:00Z',time_zone:'America/New_York'}]}});
   if(posts.filter(row=>row.action==='offer').length===1)return route.fulfill({status:409,json:{code:'WAITLIST_OPENING_CHANGED',request_id:'55000000-0000-4000-8000-000000000003'}});
   offered=true;return route.fulfill({json:{offered:true,openings:[],offer_id:randomUUID()}});
  });
  await page.goto('/salon/dashboard/bookings?view=waitlist');const queue=page.getByRole('region',{name:t('Appointment waitlist'),exact:true});
  await queue.getByRole('button',{name:t('Check waitlist openings'),exact:true}).click();await queue.getByRole('button',{name:new RegExp(t('Review opening'))}).click();
  expect(posts).toEqual([{action:'review',request_id:id}]);
  await queue.getByRole('button',{name:t('Send opening offer'),exact:true}).click();await expect(queue.getByRole('alert')).toContainText('55000000-0000-4000-8000-000000000003');expect(offered).toBe(false);
  await queue.getByRole('button',{name:t('Send opening offer'),exact:true}).click();await expect(queue.getByRole('button',{name:t('Send opening offer'),exact:true})).toHaveCount(0);expect(offered).toBe(true);
  expect(posts.filter(row=>row.action==='offer')).toEqual([{action:'offer',request_id:id,source_booking_id:source},{action:'offer',request_id:id,source_booking_id:source}]);
  await page.reload();await expect(queue).toContainText('Sample Client');await expect(queue.getByRole('button',{name:t('Send opening offer'),exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}
