import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {assistantTeamCopy} from '../../src/i18n/assistant-team-copy';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,900],['zh-CN',844,390]] as const){
 test(`Master team review from Overview retains permissions and agreements and exact failed-request retry in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const copy=assistantTeamCopy(locale),t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  const cases=[{operation:'permissions',changes:{permissions:{bookings:true,earnings:false}}},{operation:'arrangement',changes:{effective_from:'2026-09-24',kind:'commission',basis:'after_discount',percent:50,amount_cents:null,period:null}}];
  let index=0,attempts=0,writes=0,activeId='';const saved=new Set<string>();let release!:()=>void;const delay=new Promise<void>(r=>{release=r;});
  await page.route('**/api/salon/assistant',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);const body=route.request().postDataJSON();
   if(body.action==='confirm'){
    expect(body).toMatchObject({request_id:activeId,digest:'c'.repeat(64),confirm:true});attempts++;
    if(attempts===1){await delay;return route.fulfill({status:503,json:{code:'ASSISTANT_UNAVAILABLE',request_id:'20000000-0000-4000-8000-000000000099'}});}
    if(!saved.has(activeId)){saved.add(activeId);writes++;}return route.fulfill({json:{verified:true,result:{operation:cases[index].operation,values:cases[index].changes,provider_action:false}}});
   }
   expect(body.action).toBe('plan');activeId=body.request_id;
   if(index===cases.length)return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'get_team_controls',risk_class:1,arguments:{},execution_payload:{},before_summary:{},result:{members:[{name:'Original professional GC51',permissions:{bookings:true,earnings:false}}]},confirmed_at:null},assistant_message:copy.read}});
   const c=cases[index];return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'prepare_team_controls',risk_class:4,digest:'c'.repeat(64),before_summary:{},confirmed_at:null,arguments:{operation:c.operation,record_id:f.ids.service,changes_json:JSON.stringify(c.changes)},execution_payload:{...c,name:'Original professional GC51',values:c.changes}},preview_required:true}});
  });
  await page.goto('/salon/dashboard');const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  const open=async()=>{if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();};await open();
  const send=async(text:string)=>{await dialog.locator('textarea').fill(text);await dialog.getByRole('button',{name:t('Ask GC Assistant'),exact:true}).click();};
  for(index=0;index<cases.length;index++){
   await send(`Review ${cases[index].operation}.`);const preview=dialog.getByRole('region',{name:copy.review,exact:true});
   await expect(preview.getByRole('heading',{name:copy[cases[index].operation],exact:true})).toBeVisible();expect(writes).toBe(index);
   await expect(preview).toContainText(index===0?copy.permissions_notice:copy.arrangement_notice);
   await expect(preview.getByText('Original professional GC51',{exact:true})).toBeVisible();
   if(index===0){await expect(preview.getByText(copy.bookings,{exact:true})).toBeVisible();await expect(preview.getByText(copy.yes,{exact:true})).toBeVisible();await expect(preview.getByText(copy.earnings,{exact:true})).toBeVisible();await expect(preview.getByText(copy.no,{exact:true})).toBeVisible();}else{await expect(preview.getByText(copy.after_discount,{exact:true})).toBeVisible();await expect(preview.getByText('50',{exact:true})).toBeVisible();}
   await expect(preview).not.toContainText(f.ids.service);await expect(preview).not.toContainText('changes_json');
   const confirm=dialog.getByRole('button',{name:t('Confirm this change'),exact:true});await confirm.click();
   if(index===0){await expect(confirm).toBeDisabled();release();await expect(dialog).toContainText('20000000-0000-4000-8000-000000000099');await expect(confirm).toBeEnabled();await expect(preview).toBeVisible();await confirm.click();}
   await expect(dialog.getByText(t('Your change was saved and verified.'),{exact:true})).toHaveCount(index+1);expect(writes).toBe(index+1);await expect(page).toHaveURL(/\/salon\/dashboard$/);
  }
  expect(attempts).toBe(3);await page.reload();await open();await send('Read my team permissions.');await expect(dialog.getByText(copy.read,{exact:true})).toBeVisible();expect(writes).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('assistant-team.png')});
 });
}
