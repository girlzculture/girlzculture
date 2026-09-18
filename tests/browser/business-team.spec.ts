import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';

test.use({serviceWorkers:'block'});
for(const [locale,width,height] of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Business team preserves identities, full specialties, selection and schedule navigation in ${locale}`,async({page},info)=>{
  await page.clock.setFixedTime(new Date('2026-09-18T14:00:00Z'));
  const f=await p0OwnerFixture(page,{populated:true,locale});
  const t=(s:string)=>(DASHBOARD_SOURCE_MESSAGES as Record<string,Record<string,string>>)[locale]?.[s]||s;
  Object.assign(f.records.stylists[0],{name:'Awa',bio:'Original Awa biography',specialties:['Box Braids','Boho / Goddess Braids','Loc Retwist','Scalp Care','Protective Styles','Silk Press']});
  const second='33000000-0000-4000-8000-000000000099';
  f.records.stylists.push({...f.records.stylists[0],id:second,name:'Marie',bio:'Original Marie biography',specialties:['Color'],availability:{Mon:{open:'10:00',close:'16:00'}}});
  f.records.bookings.push({...f.records.bookings[0],id:'complete',status:'Completed',estimated_total:123.45,appointment_datetime:'2026-09-17T14:00:00Z'});
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/stylists');
  await expect(page.getByRole('navigation',{name:t('Team workspace'),exact:true})).toBeVisible();
  const awa=page.getByRole('article',{name:'Awa',exact:true});
  if(width===390)await expect(awa).toBeInViewport();await expect(awa.getByText('Silk Press',{exact:true})).toBeVisible();
  await awa.getByRole('button',{name:t('View professional'),exact:true}).click();
  const detail=page.getByRole('complementary',{name:t('Selected professional'),exact:true});
  await expect(detail.getByText('Original Awa biography',{exact:true})).toBeVisible();
  await page.reload();await expect(detail.getByText('Original Awa biography',{exact:true})).toBeVisible();
  await page.getByRole('article',{name:'Marie',exact:true}).getByRole('button',{name:t('View professional'),exact:true}).click();
  await expect(detail.getByText('Original Marie biography',{exact:true})).toBeVisible();await expect(detail).not.toContainText('Original Awa biography');
  await detail.getByRole('link',{name:t('Edit working hours'),exact:true}).click();
  await expect(page.getByRole('combobox',{name:t('Professional'),exact:true})).toHaveValue(second);
  await page.goBack();await expect(detail).toContainText('Original Marie biography');
  const nav=page.getByRole('navigation',{name:t('Team workspace'),exact:true});
  const choose=async(value:string,label:string)=>{if(width<640)await nav.getByRole('combobox',{name:t('Team view'),exact:true}).selectOption(value);else await nav.getByRole('button',{name:t(label),exact:true}).click();};
  await choose('performance','Performance');
  await expect(page.getByRole('region',{name:t('Team performance'),exact:true})).toContainText('123');
  await choose('onboarding','Onboarding');
  await expect(page.getByRole('region',{name:t('Team onboarding'),exact:true})).toContainText(t('Profile readiness uses saved information. It does not certify training or create a staff login.'));
  await choose('members','Team Members');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:info.outputPath('team-viewport.png')});
  expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
}
