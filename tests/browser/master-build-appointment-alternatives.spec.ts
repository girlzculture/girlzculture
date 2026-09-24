import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {MASTER_BUILD_COPY} from '../../src/i18n/master-build-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,900],['zh-CN',844,390]] as const){
 test(`Master appointment alternatives retain exact request and scoped original names in ${locale}`,async({page})=>{
  await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const payloads:Record<string,unknown>[]=[];
  await page.route('**/api/salon/assistant',async route=>{
   payloads.push(route.request().postDataJSON());
   return route.fulfill({status:409,json:{code:'ASSISTANT_AVAILABILITY_CONFLICT',request_id:'MASTER-EXACT-CONFLICT',alternatives:[{start:'2026-09-24T20:00:00.000Z',time_zone:'America/New_York',professional_name:'Aisha',service_name:'Boho / Knotless Braids',duration_minutes:60,buffer_minutes:15}]}});
  });
  await page.goto('/salon/dashboard');
  await page.getByRole('button',{name:'GC Assistant',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  const question='Create a walk-in for Alma Aba, Thursday September 24 at 3:30 PM, any service and any professional';
  await dialog.locator('textarea').fill(question);await dialog.locator('textarea').press('Enter');
  const index=locale==='fr'?1:locale==='es'?2:locale==='zh-CN'?3:0;
  const label=MASTER_BUILD_COPY.find(row=>row[0]==='Available alternatives')![index];
  const alternatives=dialog.getByRole('region',{name:label});await expect(alternatives).toBeVisible();
  await expect(alternatives).toContainText('Aisha');await expect(alternatives).toContainText('Boho / Knotless Braids');
  await expect(alternatives).toContainText('60');await expect(alternatives).toContainText('15');
  await expect(dialog.locator('article')).toContainText(question);await expect(dialog.locator('article')).toContainText('MASTER-EXACT-CONFLICT');
  expect(payloads).toHaveLength(1);expect(payloads[0].text).toBe(question);expect(payloads[0].locale).toBe(locale);
  expect(await alternatives.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 });
}
