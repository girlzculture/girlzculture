import {intlLocale} from "../../src/i18n/catalog";
import {expect} from '@playwright/test';import{test}from './helpers/hydration';import{p0OwnerFixture}from './helpers/p0OwnerFixture';
import{DASHBOARD_SOURCE_MESSAGES}from '../../src/i18n/dashboard-source-catalog';
import{BUSINESS_BOOKINGS_SOURCE_MESSAGES}from '../../src/i18n/business-bookings-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]]as const){
 test(`Business bookings local-date filters retain context and real facts in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});const base={...f.records.bookings[0]};
  const t=(s:string)=>BUSINESS_BOOKINGS_SOURCE_MESSAGES[locale]?.[s]||DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  f.records.bookings.splice(0,1,{...base,appointment_datetime:'2030-01-01T03:00:00Z',guest_name:'Midnight Save',estimated_total:180,deposit_amount:25,balance_due:155},
   {...base,id:'33000000-0000-4000-8000-000000000051',appointment_datetime:'2030-01-01T18:00:00Z',guest_name:'Daytime Save',status:'Completed',estimated_total:150},
   {...base,id:'33000000-0000-4000-8000-000000000052',appointment_datetime:'2030-01-01T19:00:00Z',guest_name:'Unassigned Save',stylist_id:null,style_id:null,manual_service_name:'Custom service',status:'Completed',estimated_total:null},
   {...base,id:'33000000-0000-4000-8000-000000000053',appointment_datetime:'2030-01-01T20:00:00Z',guest_name:'Test excluded',payment_mode:'test',estimated_total:99999});
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/bookings?group=All');const region=page.getByRole('region',{name:t('Bookings workspace'),exact:true});await expect(region).toBeVisible();
  await expect(region.getByText('Test excluded',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  await region.locator('summary').filter({hasText:t('Date, staff and service filters')}).click();
  await region.getByLabel(t('From date'),{exact:true}).fill('2029-12-31');await region.getByLabel(t('To date'),{exact:true}).fill('2029-12-31');await region.getByRole('button',{name:t('Apply dates'),exact:true}).click();
  await expect(page).toHaveURL(/from=2029-12-31/);await expect(region.getByText('Midnight Save',{exact:true}).filter({visible:true})).toBeVisible();await expect(region.getByText('Daytime Save',{exact:true})).toHaveCount(0);
  for(const amount of [25,155]){const formatted=new Intl.NumberFormat(intlLocale(locale),{style:'currency',currency:'USD'}).format(amount);if(width>=1280)await expect(region.getByRole('cell',{name:formatted+' '+t('Not recorded'),exact:true})).toBeVisible();else await expect(region.getByText(formatted,{exact:true}).filter({visible:true})).toBeVisible();}
  await region.getByRole('combobox',{name:t('Staff filter'),exact:true}).selectOption(f.ids.professional);await region.getByRole('combobox',{name:t('Service filter'),exact:true}).selectOption(f.ids.service);
  await region.getByRole('searchbox',{name:t('Search bookings'),exact:true}).fill('Midnight');await region.getByRole('button',{name:t('Search'),exact:true}).click();
  await expect(page).toHaveURL(/q=Midnight/);const before=page.url();const desktop=width>=1280;
  if(desktop)await region.getByRole('link',{name:t('Open'),exact:true}).click();else await region.getByRole('button',{name:/Midnight Save/}).click();
  await expect(page).toHaveURL(new RegExp(`/bookings/${f.ids.booking}`));await page.goBack();await expect(page).toHaveURL(before);
  await page.reload();await expect(region.getByRole('combobox',{name:t('Staff filter'),exact:true})).toHaveValue(f.ids.professional);await expect(region.getByRole('searchbox',{name:t('Search bookings'),exact:true})).toHaveValue('Midnight');
  await region.getByLabel(t('From date'),{exact:true}).fill('2030-01-02');await region.getByRole('button',{name:t('Apply dates'),exact:true}).click();await expect(region.getByRole('alert')).toHaveText(t('End date must not precede start date.'));await expect(page).toHaveURL(before);
  if(locale==='en'){
   await region.getByRole('alert').scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath('bookings-invalid-date-viewport.png')});
  }
  await region.getByLabel(t('From date'),{exact:true}).fill('2029-12-31');await region.getByRole('button',{name:t('Apply dates'),exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('bookings-workspace.png'),fullPage:true});
  await region.getByRole('searchbox',{name:t('Search bookings'),exact:true}).fill('No match');await region.getByRole('button',{name:t('Search'),exact:true}).click();await expect(region.getByRole('heading',{name:t('No appointments match these filters'),exact:true})).toBeVisible();expect(f.unexpected).toEqual([]);
  if(locale==='en'){
   await region.getByRole('heading',{name:t('No appointments match these filters'),exact:true}).scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath('bookings-no-match-viewport.png')});
  }
 });
}

test('Business bookings pagination keeps records reachable and the phone list visible',async({page},info)=>{
 const f=await p0OwnerFixture(page,{populated:true,locale:'fr'});const base={...f.records.bookings[0]};
 f.records.bookings=Array.from({length:31},(_,index)=>({...base,id:`33000000-0000-4000-8000-${String(index+200).padStart(12,'0')}`,guest_name:`Client GC${String(index).padStart(2,'0')}`,appointment_datetime:new Date(Date.UTC(2030,0,1,15,index)).toISOString(),estimated_total:100}));
 await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/bookings?group=All');
 const region=page.getByRole('region',{name:'Espace réservations',exact:true});
 await expect(region.getByRole('heading',{name:'Client GC00',exact:true})).toBeInViewport();
 const first=await region.getByRole('heading',{name:'Client GC00',exact:true}).boundingBox();const bottom=await page.getByRole('navigation',{name:'Navigation mobile de l’entreprise',exact:true}).boundingBox();expect(first!.y+first!.height).toBeLessThan(bottom!.y);
 await expect(region.getByText('Vue liste',{exact:true})).toBeVisible();
 await expect(region.getByRole('heading',{name:'Client GC24',exact:true})).toHaveCount(1);await expect(region.getByRole('heading',{name:'Client GC25',exact:true})).toHaveCount(0);
 const nav=region.getByRole('navigation',{name:'Pages de rendez-vous',exact:true});await nav.getByRole('button').last().click();await expect(page).toHaveURL(/page=2/);
 await expect(region.getByRole('heading',{name:'Client GC25',exact:true})).toBeVisible();await expect(region.getByRole('heading',{name:'Client GC30',exact:true})).toBeVisible();await expect(region.getByRole('heading',{name:'Client GC00',exact:true})).toHaveCount(0);
 await page.reload();await expect(region.getByRole('heading',{name:'Client GC25',exact:true})).toBeVisible();await nav.getByRole('button').first().click();await expect(page).toHaveURL(/page=1/);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('bookings-phone.png')});
 expect(f.unexpected).toEqual([]);
});
