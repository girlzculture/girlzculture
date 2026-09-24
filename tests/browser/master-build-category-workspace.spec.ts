import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';

test.use({serviceWorkers:'block'});
const categories=[['Hair Salon & Braiding','Stylists','Services & Pricing'],['Nail Studio','Technicians','Services & Pricing'],['Massage & Wellness','Therapists','Services & Pricing'],['Aesthetics Clinic','Practitioners','Treatments & Pricing'],['Tattoo Studio','Artists','Services & Pricing'],['Lash & Brow Bar','Technicians','Services & Pricing'],['Barbershop','Barbers','Services & Pricing']];
for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,900],['zh-CN',844,390]] as const){
 for(const [category,team,services] of categories){
 test(`Master category workspace ${category} labels in ${locale}`,async({page})=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const t=(s:string)=>(DASHBOARD_SOURCE_MESSAGES as Record<string,Record<string,string>>)[locale]?.[s]||s;
  Object.assign(f.business,{subscription_tier:'Starter',operator_type:'team'});f.records.subscriptions=[{status:'active',tier:'Starter'}];
   Object.assign(f.business,{business_type:category,name:'Authored Salon Name'});
   await page.goto('/salon/dashboard');
   const health=page.locator('section').filter({has:page.getByRole('heading',{name:t('Page health'),exact:true})});
   await expect(health.locator('a[href="/salon/dashboard/stylists"]')).toHaveText(t(team));
   await expect(health.locator('a[href="/salon/dashboard/styles"]')).toHaveText(t(services));
   await page.goto('/salon/dashboard/stylists');
   await expect(page.getByRole('heading',{name:t(team),exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:t(team==='Stylists'?'Add Stylist':'Add professional'),exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(f.unexpected).toEqual([]);
 });
 }
 test(`Master category workspace Solo completion in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const t=(s:string)=>(DASHBOARD_SOURCE_MESSAGES as Record<string,Record<string,string>>)[locale]?.[s]||s;
  Object.assign(f.business,{subscription_tier:'Solo Pro',operator_type:'solo',business_type:'Hair Salon & Braiding',name:'Authored Salon Name',description:'Description',phone:'2125550100',address_street:'Private fixture',cover_photo_url:'/pwa/icon-192.png'});
  f.records.subscriptions=[{status:'active',tier:'Solo Pro'}];f.records.stylists=[];
  await page.goto('/salon/dashboard');
  const health=page.locator('section').filter({has:page.getByRole('heading',{name:t('Page health'),exact:true})});
  await expect(health).toContainText('100%');await expect(page.locator('a[href="/salon/dashboard/stylists"]')).toHaveCount(0);
  await page.goto('/salon/dashboard/my-page');
  await expect(page.locator('a[href="/salon/dashboard/stylists"]')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Authored Salon Name',exact:true})).toBeVisible();
  await page.reload();await expect(page.locator('a[href="/salon/dashboard/stylists"]')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('solo-category-workspace.png')});expect(f.unexpected).toEqual([]);
 });
}
