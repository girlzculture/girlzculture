import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {MASTER_BUILD_COPY} from '../../src/i18n/master-build-source-catalog';
import {REBOOKING_COPY} from '../../src/lib/businessRebookingReminders';
test.use({serviceWorkers:'block'});
for(const [locale,column,width,height]of [['en',0,390,844],['fr',1,768,900],['es',2,1440,1000],['zh-CN',3,844,390]] as const){
 test(`Master rebooking review, scoped save, recovery and refresh in ${locale}`,async({page},info)=>{
  const identityErrors:string[]=[];page.on('console',message=>{if(message.type()==='error'&&/same key|unique.*key/i.test(message.text()))identityErrors.push(message.text());});
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});const t=(s:string)=>MASTER_BUILD_COPY.find(row=>row[0]===s)?.[column]||s;
  let settings={salon_id:f.business.id,revision:0,enabled:false,effective_enabled:false,absence_days:42,minimum_visits:1,service_ids:[] as string[],plan:'premium',automatic:true,segmented:true,is_demo:false,email_available:true,services:[{id:f.ids.service,name:'Save'}],attempts:[]};
  const saves:Record<string,unknown>[]=[];let stale=false;
  await page.route('**/api/salon/rebooking-settings',async route=>{
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();saves.push(body);if(saves.length===1)return route.fulfill({status:503,json:{code:'REBOOKING_UNAVAILABLE',request_id:'66000000-0000-4000-8000-000000000001'}});if(stale)return route.fulfill({status:409,json:{code:'REBOOKING_STALE',request_id:'66000000-0000-4000-8000-000000000002'}});expect(body.revision).toBe(settings.revision);settings={...settings,...body,revision:body.revision+1,effective_enabled:body.enabled};return route.fulfill({json:{settings,verified:true}});}
   return route.fulfill({json:{settings}});
  });
  await page.goto('/salon/dashboard/settings/notifications');const panel=page.getByRole('region',{name:t('Rebooking reminders'),exact:true});
  const enabled=panel.getByRole('checkbox',{name:t('Send automatic rebooking reminders'),exact:true}),days=panel.getByRole('spinbutton',{name:t('Days since the last completed appointment'),exact:true}),visits=panel.getByRole('spinbutton',{name:t('Minimum completed visits in the last year'),exact:true}),save=panel.locator('button:not([type])');
  await enabled.check();await days.fill('60');await visits.fill('3');await panel.getByRole('checkbox',{name:'Save',exact:true}).check();
  await expect(save).toBeDisabled();await expect(panel).toContainText(REBOOKING_COPY[locale].body);
  await panel.getByRole('checkbox',{name:t('I reviewed the reminder and authorize sending under these settings.'),exact:true}).check();await save.click();
  await expect(panel.getByRole('alert')).toContainText('66000000-0000-4000-8000-000000000001');await expect(days).toHaveValue('60');await expect(enabled).toBeChecked();await save.click();
  await expect(panel.getByRole('status')).toHaveText(t('Rebooking settings saved and verified.'));
  expect(saves[1]).toEqual({revision:0,enabled:true,absence_days:60,minimum_visits:3,service_ids:[f.ids.service],reviewed:true});
  await page.reload();await expect(days).toHaveValue('60');await expect(visits).toHaveValue('3');await expect(enabled).toBeChecked();
  stale=true;await enabled.uncheck();await save.click();await expect(panel.getByRole('alert')).toContainText('66000000-0000-4000-8000-000000000002');await expect(enabled).not.toBeChecked();
  await panel.getByRole('button',{name:t('Reload saved settings'),exact:true}).click();await expect(enabled).toBeChecked();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await panel.screenshot({path:info.outputPath('rebooking-controls.png')});
  settings={...settings,plan:'starter',automatic:false,segmented:false,effective_enabled:false};stale=false;await page.reload();await expect(panel.getByRole('spinbutton')).toHaveCount(0);await enabled.uncheck();await save.click();
  await expect(panel.getByRole('status')).toHaveText(t('Rebooking settings saved and verified.'));expect(saves.at(-1)).toEqual({revision:1,enabled:false,absence_days:60,minimum_visits:1,service_ids:[],reviewed:false});await expect(enabled).toBeDisabled();expect(f.unexpected).toEqual([]);expect(identityErrors).toEqual([]);
 });
}
