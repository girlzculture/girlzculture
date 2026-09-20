import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height] of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Service assignments retain drafts on failure and persist verified selections in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});
  const t=(s:string)=>(DASHBOARD_SOURCE_MESSAGES as Record<string,Record<string,string>>)[locale]?.[s]||s;
  f.records.styles[0].name='Box Braids';f.records.stylists[0].name='Awa';
  const second='33000000-0000-4000-8000-000000000088';
  f.records.styles.push({...f.records.styles[0],id:second,name:'Silk Press'});
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/stylists?person='+f.ids.professional);
  const assignments=page.getByRole('region',{name:t('Assigned services'),exact:true});
  const all=assignments.getByRole('checkbox',{name:t('All current and future services'),exact:true});
  await expect(all).toBeChecked();await all.uncheck();
  await assignments.getByRole('checkbox',{name:'Box Braids',exact:true}).check();
  f.failNextSave();await assignments.getByRole('button',{name:t('Save service assignments'),exact:true}).click();
  await expect(assignments.getByRole('alert')).toContainText('P0-SAVE-FAILURE');
  await expect(assignments.getByRole('checkbox',{name:'Box Braids',exact:true})).toBeChecked();
  expect(f.records.stylists[0].assigned_service_ids).toBeUndefined();
  if(locale==='en'){
   await assignments.getByRole('alert').scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath('service-assignment-failure-draft-viewport.png')});
  }
  await assignments.getByRole('button',{name:t('Save service assignments'),exact:true}).click();
  await expect(assignments.getByRole('status')).toHaveText(t('Service assignments saved and verified.'));
  expect(f.records.stylists[0].assigned_service_ids).toEqual([f.ids.service]);
  await page.reload();await expect(all).not.toBeChecked();
  await expect(assignments.getByRole('checkbox',{name:'Box Braids',exact:true})).toBeChecked();
  await expect(assignments.getByRole('checkbox',{name:'Silk Press',exact:true})).not.toBeChecked();
  await assignments.getByRole('checkbox',{name:'Box Braids',exact:true}).uncheck();
  await assignments.getByRole('button',{name:t('Save service assignments'),exact:true}).click();
  await expect(assignments.getByRole('status')).toBeVisible();expect(f.records.stylists[0].assigned_service_ids).toEqual([]);
  await page.reload();await expect(all).not.toBeChecked();await all.check();
  await assignments.getByRole('button',{name:t('Save service assignments'),exact:true}).click();
  await expect(assignments.getByRole('status')).toBeVisible();expect(f.records.stylists[0].assigned_service_ids).toBeNull();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(f.unexpected).toEqual([]);
 });
}
