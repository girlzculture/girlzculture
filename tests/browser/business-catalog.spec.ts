import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {BUSINESS_CATALOG_SOURCE_MESSAGES} from '../../src/i18n/business-catalog-source-catalog';

test.use({serviceWorkers:'block'});
for(const [locale,width,height] of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Business catalog distinguishes featured/popular, retains filters and verifies saves in ${locale}`,async({page},info)=>{
  await page.clock.setFixedTime(new Date('2026-09-18T14:00:00Z'));
  const f=await p0OwnerFixture(page,{populated:true,locale});
  const t=(s:string)=>BUSINESS_CATALOG_SOURCE_MESSAGES[locale]?.[s]||s;
  f.records.styles[0].name='Box Braids';
  f.records.styles[0].price_display_max=250;
  f.records.styles[0].duration_max_hours=4;
  f.records.styles.push({...f.records.styles[0],id:'22000000-0000-4000-8000-000000000099',name:'Silk Press',is_featured:true});
  f.records.bookings.push({...f.records.bookings[0],id:'completed',status:'Completed',appointment_datetime:'2026-09-17T14:00:00Z'});
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/styles');
  const featured=page.getByRole('region',{name:t('Featured services'),exact:true});
  await expect(featured).toContainText('Silk Press');await expect(featured).not.toContainText('Box Braids');
  const braids=page.getByRole('article',{name:'Box Braids',exact:true});
  const popular=t('Popular · {value0} completed appointments').replace('{value0}','1');
  await expect(braids).toContainText(popular);
  await expect(page.getByRole('article',{name:'Silk Press',exact:true})).not.toContainText(popular);
  await expect(braids).toContainText('180');await expect(braids).toContainText('250');
  f.failNextSave();await braids.getByRole('checkbox',{name:t('Feature service'),exact:true}).click();
  await expect(page.getByText('P0-SAVE-FAILURE',{exact:false})).toBeVisible();
  await expect(braids.getByRole('checkbox',{name:t('Feature service'),exact:true})).not.toBeChecked();
  await braids.getByRole('checkbox',{name:t('Feature service'),exact:true}).click();
  await expect(featured).toContainText('Box Braids');
  await page.getByRole('button',{name:t('Service list view'),exact:true}).click();
  await page.getByRole('combobox',{name:t('Sort services'),exact:true}).selectOption('price');
  await page.getByRole('textbox',{name:t('Search services'),exact:true}).fill('Box');
  await expect(page).toHaveURL(/q=Box/);
  await braids.getByRole('link',{name:t('Edit service'),exact:true}).click();
  await expect(page.getByRole('textbox',{name:t('Description'),exact:true})).toHaveValue('Original service prose — $180 GCABC12');
  await page.goBack();
  await expect(page.getByRole('textbox',{name:t('Search services'),exact:true})).toHaveValue('Box');
  await expect(page.getByRole('button',{name:t('Service list view'),exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('combobox',{name:t('Sort services'),exact:true})).toHaveValue('price');
  await page.reload();await expect(braids.getByRole('checkbox',{name:t('Feature service'),exact:true})).toBeChecked();
  await page.getByRole('textbox',{name:t('Search services'),exact:true}).fill('');
  await page.getByRole('button',{name:t('Service grid view'),exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:info.outputPath('catalog-viewport.png')});
  expect(f.actions.filter(a=>a.table==='styles').map(a=>a.values)).toEqual([{is_featured:true},{is_featured:true}]);
  expect(f.unexpected).toEqual([]);
 });
}
