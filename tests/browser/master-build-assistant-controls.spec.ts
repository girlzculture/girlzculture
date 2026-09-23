import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {assistantControlsCopy} from '../../src/i18n/assistant-controls-copy';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,900],['zh-CN',844,390]] as const){
 test(`Master controls review from Overview retains settings and exact failed-request retry in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const copy=assistantControlsCopy(locale),t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  const cases=[{section:'deposits',changes:{rate:20,threshold_amount:200,threshold_rate:30}},{section:'growth',changes:{reminder_hours:[48,2],waitlist_service_ids:[f.ids.service]}},{section:'rebooking',changes:{enabled:true,absence_days:60,minimum_visits:2,service_ids:[f.ids.service]}}];
  let index=0,attempts=0,writes=0,activeId='';const saved=new Set<string>();let release!:()=>void;const delay=new Promise<void>(r=>{release=r;});
  await page.route('**/api/salon/assistant',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);const body=route.request().postDataJSON();
   if(body.action==='confirm'){
    expect(body).toMatchObject({request_id:activeId,digest:'c'.repeat(64),confirm:true});attempts++;
    if(attempts===1){await delay;return route.fulfill({status:503,json:{code:'ASSISTANT_UNAVAILABLE',request_id:'20000000-0000-4000-8000-000000000099'}});}
    if(!saved.has(activeId)){saved.add(activeId);writes++;}return route.fulfill({json:{verified:true,result:{section:cases[index].section,values:cases[index].changes,provider_action:false}}});
   }
   expect(body.action).toBe('plan');activeId=body.request_id;
   if(index===cases.length)return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'get_business_controls',risk_class:1,arguments:{section:'deposits'},execution_payload:{},before_summary:{},result:{section:'deposits',values:{rate:20}},confirmed_at:null},assistant_message:`${copy.rate}: 20%.`}});
   const c=cases[index];return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'prepare_business_controls',risk_class:4,digest:'c'.repeat(64),before_summary:{},confirmed_at:null,arguments:{section:c.section,changes_json:JSON.stringify(c.changes)},execution_payload:{...c,values:c.changes,names:{waitlist_service_ids:['Original service GC51'],service_ids:['Original service GC51']}}},preview_required:true}});
  });
  await page.goto('/salon/dashboard');const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  const open=async()=>{if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();};await open();
  const send=async(text:string)=>{await dialog.locator('textarea').fill(text);await dialog.getByRole('button',{name:t('Ask GC Assistant'),exact:true}).click();};
  for(index=0;index<cases.length;index++){
   await send(`Review ${cases[index].section} settings.`);const preview=dialog.getByRole('region',{name:copy.review,exact:true});
   await expect(preview.getByRole('heading',{name:copy[cases[index].section],exact:true})).toBeVisible();expect(writes).toBe(index);
   await expect(preview).toContainText(index===0?copy.deposit_notice:index===1?copy.growth_notice:copy.contact_notice);
   if(index>0)await expect(preview.getByText('Original service GC51',{exact:true})).toBeVisible();
   await expect(preview).not.toContainText(f.ids.service);await expect(preview).not.toContainText('changes_json');
   const confirm=dialog.getByRole('button',{name:t('Confirm this change'),exact:true});await confirm.click();
   if(index===0){await expect(confirm).toBeDisabled();release();await expect(dialog).toContainText('20000000-0000-4000-8000-000000000099');await expect(confirm).toBeEnabled();await expect(preview).toBeVisible();await confirm.click();}
   await expect(dialog.getByText(t('Your change was saved and verified.'),{exact:true})).toHaveCount(index+1);expect(writes).toBe(index+1);await expect(page).toHaveURL(/\/salon\/dashboard$/);
  }
  expect(attempts).toBe(4);await page.reload();await open();await send('Read my saved deposit rate.');await expect(dialog.getByText(`${copy.rate}: 20%.`,{exact:true})).toBeVisible();expect(writes).toBe(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('assistant-settings.png')});
 });
}
