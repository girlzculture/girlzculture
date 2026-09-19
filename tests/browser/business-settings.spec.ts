import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});
for (const [locale,width,height] of [['en',390,844],['es',1440,1000]] as const) {
 test(`Business settings opens the existing assistant appearance controls in ${locale}`,async({page})=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  Object.assign(f.business,{gc_assistant_avatar:'woman'});let saves=0;
  const t=(text:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[text]||text;
  await page.route('**/api/salon/assistant/appearance',async route=>{
   expect(route.request().method()).toBe('PATCH');expect(route.request().postDataJSON()).toEqual({avatar:'cat'});saves++;
   Object.assign(f.business,{gc_assistant_avatar:'cat'});await route.fulfill({json:{avatar:'cat',business_id:f.business.id,verified:true}});
  });
  await page.goto('/salon/dashboard/settings');
  const launcher=page.getByRole('button',{name:t('Assistant appearance'),exact:true});
  await launcher.click();
  const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  await expect(dialog.getByRole('button',{name:t('Friendly woman'),exact:true})).toBeFocused();
  await dialog.getByRole('button',{name:t('Smiling cat'),exact:true}).click();
  await expect(dialog.getByText(t('Assistant appearance saved.'),{exact:true})).toBeVisible();expect(saves).toBe(1);
  await dialog.getByRole('button',{name:t('Close GC Assistant'),exact:true}).click();await expect(launcher).toBeFocused();
  await page.reload();await launcher.click();await expect(dialog.getByRole('button',{name:t('Smiling cat'),exact:true})).toBeFocused();
  await expect(dialog.getByRole('button',{name:t('Smiling cat'),exact:true})).toHaveAttribute('aria-pressed','true');expect(saves).toBe(1);
 });
}
for (const focus of ['account','notifications'] as const) {
 test(`Business settings saves only ${focus} fields and retains the other preferences`, async ({page}) => {
  const f=await p0OwnerFixture(page,{populated:true});
  const business=Object.assign(f.business,{email:'owner@example.test',phone:'+12125550128',notification_preferences:{in_app:true,email:true,sms:true,reviews:true,marketing:false}});
  const patches:Record<string,unknown>[]=[];
  await page.route('**/api/salon/profile',async route=>{
   if(route.request().method()==='PATCH'){
    const patch=route.request().postDataJSON();patches.push(patch);Object.assign(f.business,patch);
    return route.fulfill({json:{salon:f.business,verified:true}});
   }
   return route.fulfill({json:{salon:f.business,vanity_request:null}});
  });
  await page.goto(`/salon/dashboard/settings/${focus}`);
  if(focus==='account'){
   await page.getByLabel('Business Phone / SMS Number').fill('+12125550129');
   await page.getByRole('button',{name:'Save account details',exact:true}).click();
   await expect.poll(()=>patches.length).toBe(1);
   expect(Object.keys(patches[0]).sort()).toEqual(['email','phone']);
   expect(business.notification_preferences.reviews).toBe(true);
   await page.reload();await expect(page.getByLabel('Business Phone / SMS Number')).toHaveValue('+12125550129');
  }else{
   await page.getByLabel('New reviews and replies').uncheck();
   await page.getByRole('button',{name:'Save Settings',exact:true}).click();
   await expect.poll(()=>patches.length).toBe(1);
   expect(Object.keys(patches[0])).toEqual(['notification_preferences']);
   expect(business.email).toBe('owner@example.test');expect(business.phone).toBe('+12125550128');
   await page.reload();await expect(page.getByLabel('New reviews and replies')).not.toBeChecked();
  }
 });
}

for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Business settings opens its form directly with usable navigation in ${locale}`,async({page},info)=>{
  await p0OwnerFixture(page,{locale,populated:true});await page.setViewportSize({width,height});
  const t=(text:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[text]||text;
  await page.goto('/salon/dashboard/settings');
  const nav=page.getByRole('navigation',{name:t('Settings & Team'),exact:true});
  await expect(page.getByLabel(t('Login Email'),{exact:true})).toBeVisible();
  await expect(nav.getByRole('link',{name:t('Account details'),exact:true})).toHaveAttribute('aria-current','page');
  await nav.getByRole('link',{name:t('Notifications'),exact:true}).click();
  await expect(page).toHaveURL(/settings\/notifications$/);
  await expect(page.getByRole('button',{name:t('Save Settings'),exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`settings-${locale}.png`),fullPage:true});
 });
}

test('Business settings retains entered contact details after a failed save and retry',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true});Object.assign(f.business,{email:'owner@example.test',phone:'+12125550128'});let attempts=0;
 await page.route('**/api/salon/profile',async route=>{
  if(route.request().method()!=='PATCH')return route.fulfill({json:{salon:f.business}});
  attempts++;if(attempts===1)return route.fulfill({status:503,json:{error:'Settings could not be saved.',request_id:'SETTINGS-RETRY'}});
  Object.assign(f.business,route.request().postDataJSON());return route.fulfill({json:{salon:f.business,verified:true}});
 });
 await page.goto('/salon/dashboard/settings/account');await page.getByLabel('Business Phone / SMS Number').fill('+12125550129');
 const save=page.getByRole('button',{name:'Save account details',exact:true});await save.click();
 await expect(page.getByText('Settings could not be saved.',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Business Phone / SMS Number')).toHaveValue('+12125550129');await expect(save).toBeEnabled();
 await save.click();await expect.poll(()=>attempts).toBe(2);await page.reload();await expect(page.getByLabel('Business Phone / SMS Number')).toHaveValue('+12125550129');
});

for(const directAccount of [false,true])test(`Business settings staff without profile permission ${directAccount?'cannot edit a direct account URL':'defaults to permitted notification controls'}`,async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true});const patches:Record<string,unknown>[]=[];
 Object.assign(f.business,{email:'owner@example.test',phone:'+12125550128',notification_preferences:{in_app:true,email:true,sms:true,reviews:true,marketing:false}});
 await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{settings:true,my_page:false},records:f.records}}));
 await page.route('**/api/salon/profile',route=>{if(route.request().method()==='PATCH'){const patch=route.request().postDataJSON();patches.push(patch);expect(Object.keys(patch)).toEqual(['notification_preferences']);Object.assign(f.business,patch);}return route.fulfill({json:{salon:f.business,verified:true}});});
 await page.goto(`/salon/dashboard/settings${directAccount?'/account':''}`);
 const nav=page.getByRole('navigation',{name:'Settings & Team',exact:true});await expect(nav).toBeVisible();
 await expect(nav.getByRole('link',{name:'Account details',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Assistant appearance',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Save account details',exact:true})).toHaveCount(0);
 if(directAccount){
  await expect.poll(async()=>{const phone=page.getByLabel('Business Phone / SMS Number',{exact:true});return await phone.count()===0||!await phone.isEditable();}).toBe(true);
  expect(patches).toEqual([]);
 }else{
  await expect(page.getByRole('button',{name:'Save Settings',exact:true})).toBeVisible();await page.getByLabel('New reviews and replies').uncheck();await page.getByRole('button',{name:'Save Settings',exact:true}).click();await expect.poll(()=>patches.length).toBe(1);expect(Object.keys(patches[0])).toEqual(['notification_preferences']);await page.reload();await expect(page.getByLabel('New reviews and replies')).not.toBeChecked();
 }
});
