import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Master location privacy and travel save readback refresh in ${locale}`,async({page},info)=>{
  const fixture=await p0OwnerFixture(page,{populated:true,locale});
  Object.assign(fixture.business,{service_location_type:'home',operator_type:'solo',subscription_tier:locale==='en'||locale==='es'?'Solo':'Solo Pro'});
  let settings={service_location_type:'home',home_address_public:false,public_neighborhood:'Harlem',offers_mobile:false,travel_radius_miles:null as number|null,travel_fee_cents:0,revision:1};
  let saves=0,fail=true;
  await page.route('**/api/salon/location',async route=>{
   if(route.request().method()==='GET')return route.fulfill({json:{settings}});
   const body=route.request().postDataJSON();expect(body.revision).toBe(settings.revision);saves++;
   if(fail){fail=false;return route.fulfill({status:503,json:{error:'Location settings could not be saved. Your edits are retained.',request_id:'LOCATION-RETRY'}});}
   settings={...settings,...body,revision:settings.revision+1};return route.fulfill({json:{settings,verified:true}});
  });
  const t=(source:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[source]||source;
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/my-page/address');
  const region=page.locator('section').filter({has:page.getByRole('heading',{name:t('Location & travel'),exact:true})}).last();
  await region.getByLabel(t('Public neighborhood'),{exact:true}).fill('Bedford-Stuyvesant');
  await region.getByLabel(t('I also travel to clients'),{exact:true}).check();
  await region.getByLabel(t('Travel radius (miles)'),{exact:true}).fill('12.5');
  await region.getByLabel(t('Travel fee ($)'),{exact:true}).fill('12.50');
  const save=region.getByRole('button',{name:t('Save and verify'),exact:true});await save.click();
  await expect(region.getByRole('alert')).toContainText(t('Location settings could not be saved. Your edits are retained.'));
  await expect(region.getByLabel(t('Public neighborhood'),{exact:true})).toHaveValue('Bedford-Stuyvesant');
  await expect(region.getByLabel(t('Travel fee ($)'),{exact:true})).toHaveValue('12.50');
  await save.click();await expect(region.getByRole('status')).toHaveText(t('Location settings saved and verified.'));
  expect(saves).toBe(2);expect(settings.travel_fee_cents).toBe(1250);expect(settings.home_address_public).toBe(false);
  await page.reload();await expect(region.getByLabel(t('Travel radius (miles)'),{exact:true})).toHaveValue('12.5');
  await expect(region.getByLabel(t('Public neighborhood'),{exact:true})).toHaveValue('Bedford-Stuyvesant');
  await expect(region.getByLabel(t('Show my home street address publicly'),{exact:true})).not.toBeChecked();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`private-location-${locale}.png`),fullPage:true});
 });
}
test('Master location staff cannot open owner privacy settings',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true});Object.assign(f.business,{service_location_type:'home'});let calls=0;
 await page.route('**/api/salon/workspace',r=>r.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{my_page:true},records:f.records}}));
 await page.route('**/api/salon/location',r=>{calls++;return r.fulfill({status:403,json:{error:'Owner-only access'}});});
 await page.goto('/salon/dashboard/my-page/address');await expect(page.getByText('Owner-only access',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Save and verify',exact:true})).toHaveCount(0);expect(calls).toBe(0);
});
