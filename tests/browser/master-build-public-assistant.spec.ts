import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {createStoredCustomerLocation} from '../../src/lib/location';
import {MASTER_BUILD_COPY} from '../../src/i18n/master-build-source-catalog';
import {gciaText} from '../../src/i18n/gcia-source-catalog';
test.use({serviceWorkers:'block'});
for(const [width,height]of [[390,844],[768,900],[1440,900],[844,390]]){
 test(`Master public assistant keeps the same question on recovery at ${width}x${height}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height});
  await page.addInitScript(stored=>{
   localStorage.setItem('girlz-culture-customer-location-v1',JSON.stringify(stored));
   localStorage.setItem('girlz-culture-mobile-location-prompt-v1',JSON.stringify({dismissedAt:Date.now(),outcome:'manual'}));
  },createStoredCustomerLocation({lat:40.81,lng:-73.94,label:'Harlem',source:'explicit'}));
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  const sent:Record<string,unknown>[]=[];
  await page.route('**/api/concierge/search',async route=>{
   sent.push(route.request().postDataJSON());
   if(sent.length===1){await held;return route.fulfill({status:503,json:{error:'Search temporarily unavailable. Reference PUBLIC-FIXTURE-1.'}});}
   return route.fulfill({json:{mode:'deterministic',salons:[],intent:{business_search:true,style:null,location:'Harlem'}}});
  });
  await page.goto('/site-access');
  await page.getByRole('button',{name:'GC AI Assistant',exact:true}).click();
  const panel=page.getByRole('dialog',{name:'Customer AI assistant'});
  await expect(panel.getByRole('heading',{name:'GC AI Assistant'})).toBeVisible();
  const composer=panel.locator('textarea');await composer.fill('Find businesses in Harlem');await composer.press('Enter');
  await expect(panel.locator('article')).toHaveCount(1);
  await expect(panel.locator('article')).toContainText('Find businesses in Harlem');await expect(composer).toHaveValue('');
  await expect(panel.getByRole('status')).toContainText('Searching');await composer.fill('Keep this unsent question');
  release();await expect(panel.getByRole('alert')).toContainText('PUBLIC-FIXTURE-1');
  await panel.getByRole('button',{name:'Retry this question'}).click();
  await expect(panel.locator('article')).toContainText("I couldn't find a match");
  expect(sent).toHaveLength(2);expect(sent[1]).toEqual(sent[0]);await expect(panel.locator('article')).toHaveCount(1);
  await expect(composer).toHaveValue('Keep this unsent question');
  await panel.getByRole('button',{name:'Close customer assistant'}).click();
  await page.getByRole('button',{name:'GC AI Assistant',exact:true}).click();
  await expect(panel.locator('article')).toHaveCount(1);await expect(composer).toHaveValue('Keep this unsent question');
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('public-assistant.png')});
 });
}

for(const [locale,column,width,height,question,answer]of [
 ['en',0,1440,900,'Deposit','The deposit is shown before booking.'],
 ['fr',1,390,844,'Acompte','L’acompte est affiché avant la réservation.'],
 ['es',2,768,900,'Depósito','El depósito se muestra antes de reservar.'],
 ['zh-CN',3,844,390,'订金','预订前会显示订金。'],
] as const){
 test(`Master public assistant keeps published help in ${locale} at ${width}x${height}`,async({page},testInfo)=>{
  const copy=(source:string)=>MASTER_BUILD_COPY.find(row=>row[0]===source)?.[column]||source;
  await page.setViewportSize({width,height});
  await page.addInitScript(stored=>{
   localStorage.setItem('girlz-culture-customer-location-v1',JSON.stringify(stored));
   localStorage.setItem('girlz-culture-mobile-location-prompt-v1',JSON.stringify({dismissedAt:Date.now(),outcome:'manual'}));
  },createStoredCustomerLocation({lat:40.81,lng:-73.94,label:'Harlem',source:'explicit'}));
  let calls=0;
  await page.route('**/api/concierge/knowledge',async route=>{
   const body=route.request().postDataJSON();expect(body.language).toBe(locale);calls++;
   const matches=calls===1&&locale!=='en'?[{question:'Wrong English question',answer:'UNTRANSLATED_ENGLISH',language:'en',title:'Help',href:'/help'}]:[{question,answer,language:locale,title:copy('Girlz Culture help'),href:'/help'}];
   await route.fulfill({json:{matches}});
  });
  await page.goto(`/site-access?lang=${locale}`);
  await page.getByRole('button',{name:copy('GC AI Assistant'),exact:true}).click();
  const panel=page.getByRole('dialog',{name:copy('Customer AI assistant')});
  await expect(panel.getByRole('button',{name:copy('Find a business'),exact:true})).toBeVisible();
  await expect(panel.getByText(copy('Only current Girlz Culture records and published help.'),{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:copy('Girlz Culture help'),exact:true}).click();
  const composer=panel.getByRole('textbox',{name:copy('Describe your beauty appointment')});
  await composer.fill(question);await composer.press('Enter');
  if(locale!=='en'){
   await expect(panel.locator('article')).toContainText(gciaText("I couldn't find that in the published Help center. Try a more specific question or contact support.",locale));
   await expect(panel).not.toContainText('UNTRANSLATED_ENGLISH');
   await expect(panel.locator('a[href="/help"]')).toHaveCount(0);
   await composer.fill(question);await composer.press('Enter');
  }
  await expect(panel.locator('article').last()).toContainText(`${question}: ${answer}`);
  await expect(composer).toHaveValue('');
  await expect(panel.locator('a[href="/help"]')).toBeVisible();
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`public-help-${locale}.png`)});
 });
}
