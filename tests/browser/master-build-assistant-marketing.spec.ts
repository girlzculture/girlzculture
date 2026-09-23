import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {assistantMarketingCopy} from '../../src/i18n/assistant-marketing-copy';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,900],['zh-CN',844,390]] as const){
 test(`Master marketing review keeps four copies and explicit approval in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const copy=assistantMarketingCopy(locale),t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  const copies={en:{title:'Own braids',body:'Reviewed service for your next visit',tags:['#Braids']},fr:{title:'Nos tresses',body:'Votre service pour une prochaine visite',tags:['#Tresses']},es:{title:'Nuestras trenzas',body:'Tu servicio para la próxima visita',tags:['#Trenzas']},'zh-CN':{title:'我们的编发',body:'为您的下次到访选择服务',tags:['#编发']}};
  const source={photo_urls:[],service_id:f.ids.service,promotion_id:null,booking_id:null},snapshot={service:{id:f.ids.service,name:'Original service GC51'},business:{name:'Original Business Name',time_zone:'America/New_York'},photos:[]};
  let index=0,attempts=0,writes=0,activeId='';const saved=new Set<string>();let release!:()=>void;const delay=new Promise<void>(resolve=>{release=resolve;});
  const operations=['marketing_draft','marketing_publish','marketing_cancel'] as const;
  await page.route('**/api/salon/assistant',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);const body=route.request().postDataJSON();
   if(body.action==='confirm'){
    expect(body).toMatchObject({request_id:activeId,digest:'c'.repeat(64),confirm:true,marketing_reviewed:index===1});attempts++;
    if(attempts===1){await delay;return route.fulfill({status:503,json:{code:'ASSISTANT_UNAVAILABLE',request_id:'20000000-0000-4000-8000-000000000099'}});}
    if(!saved.has(activeId)){saved.add(activeId);writes++;}return route.fulfill({json:{verified:true,result:{status:['draft','scheduled','cancelled'][index],copies,external_posting:false}}});
   }
   expect(body.action).toBe('plan');activeId=body.request_id;
   if(index===3)return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'get_marketing_records',risk_class:1,arguments:{record_id:null},result:{total:1,posts:[{status:'cancelled'}]},confirmed_at:null},assistant_message:copy.read.replace('{count}','1')}});
   const operation=operations[index],changes=index===0?{source,copies}:index===1?{scheduled_at:'2098-01-01T12:00:00Z',expires_at:'2098-01-02T12:00:00Z'}:{};
   return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'prepare_marketing_change',risk_class:4,digest:'c'.repeat(64),before_summary:{},confirmed_at:null,arguments:{operation,record_id:index?f.ids.service:null,changes_json:JSON.stringify(changes)},execution_payload:{operation,changes,copies,snapshot,external_posting:false}},preview_required:true}});
  });
  await page.goto('/salon/dashboard');const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  const open=async()=>{if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();};await open();
  const send=async(text:string)=>{await dialog.locator('textarea').fill(text);await dialog.getByRole('button',{name:t('Ask GC Assistant'),exact:true}).click();};
  for(index=0;index<3;index++){
   await send(`Review ${operations[index]}.`);await expect(dialog.getByRole('heading',{name:copy[operations[index]],exact:true})).toBeVisible();await expect(dialog.getByText(copy.scope,{exact:true})).toHaveCount(1);
   for(const c of Object.values(copies))await expect(dialog.getByText(c.body,{exact:true})).toHaveCount(1);expect(writes).toBe(index);
   const confirm=dialog.getByRole('button',{name:t('Confirm this change'),exact:true});
   if(index===1){await expect(confirm).toBeDisabled();await dialog.getByRole('checkbox',{name:copy.review,exact:true}).check();await expect(confirm).toBeEnabled();}
   await confirm.click();
   if(index===0){await expect(confirm).toBeDisabled();release();await expect(dialog).toContainText('20000000-0000-4000-8000-000000000099');await expect(confirm).toBeEnabled();await confirm.click();}
   await expect(dialog.getByText(t('Your change was saved and verified.'),{exact:true})).toHaveCount(index+1);expect(writes).toBe(index+1);
  }
  expect(attempts).toBe(4);await page.reload();await open();await send('Read my saved marketing posts.');await expect(dialog.getByText(copy.read.replace('{count}','1'),{exact:true})).toBeVisible();expect(writes).toBe(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('assistant-marketing.png')});
 });
}
