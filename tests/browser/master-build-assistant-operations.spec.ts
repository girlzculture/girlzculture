import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {assistantOperationsCopy} from '../../src/i18n/assistant-operations-copy';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,900],['zh-CN',844,390]] as const){
 test(`Master assistant reviewed operations from Overview retain exact retry and readback in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const copy=assistantOperationsCopy(locale),t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  const cases=[
   {tool:'prepare_stock_change',operation:'stock_restock',record_id:f.ids.product,changes:{kind:'product',quantity:2,cost_cents:0,note:'Counted stock GC27'},text:'Restock two bottles already received.',shown:'Counted stock GC27'},
   {tool:'prepare_client_card_change',operation:'client_card',record_id:f.ids.booking,changes:{locale,patch:{notes:'Original private care note GC28',formula:{technique:'Boho'}}},text:'Save this private formula after review.',shown:'Original private care note GC28'},
   {tool:'prepare_photo_change',operation:'photo_details',record_id:null,changes:{url:'/pwa-icon-192.png',category:'services',title:'Original gallery GC29',caption:'Saved owner wording',featured:true,source_locale:locale},text:'Update this saved photo caption after review.',shown:'Original gallery GC29'},
   {tool:'prepare_review_reply',operation:'review_reply',record_id:f.ids.review,changes:{reply:'Original reviewed reply GC30'},text:'Prepare this reply; do not publish until I confirm.',shown:'Original reviewed reply GC30'},
  ];
  let index=0,attempts=0,writes=0;let activeId='',stock=10;let release!:()=>void;const delayed=new Promise<void>(r=>{release=r;});
  const ids=new Set<string>();const saved:Record<string,unknown>[]=[];
  await page.route('**/api/salon/assistant',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);const body=route.request().postDataJSON();
   if(body.action==='confirm'){
    expect(body).toMatchObject({request_id:activeId,digest:'a'.repeat(64),confirm:true});attempts++;
    if(attempts===1){await delayed;return route.fulfill({status:409,json:{code:'ASSISTANT_PREVIEW_STALE',request_id:'20000000-0000-4000-8000-000000000077'}});}
    if(!ids.has(activeId)){ids.add(activeId);saved.push(cases[index].changes);writes++;if(index===0)stock+=2;}
    return route.fulfill({json:{verified:true,result:{operation:cases[index].operation,provider_action:false}}});
   }
   expect(body.action).toBe('plan');activeId=body.request_id;
   if(index===cases.length)return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'get_business_stock',risk_class:1,arguments:{query:'oil'},execution_payload:{},before_summary:{},result:{products:[{id:f.ids.product,name:'Original oil',inventory_quantity:stock}],supplies:[]},confirmed_at:null},assistant_message:`Original oil: ${stock}.`}});
   const current=cases[index];return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:current.tool,risk_class:4,digest:'a'.repeat(64),before_summary:{},confirmed_at:null,arguments:{operation:current.operation,record_id:current.record_id,changes_json:JSON.stringify(current.changes)},execution_payload:{operation:current.operation,changes:current.changes,record_name:index===0?'Original oil':undefined}},preview_required:true}});
  });
  await page.goto('/salon/dashboard');
  const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});const open=async()=>{if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();};await open();
  const send=async(text:string)=>{await dialog.locator('textarea').fill(text);await dialog.getByRole('button',{name:t('Ask GC Assistant'),exact:true}).click();};
  for(index=0;index<cases.length;index++){
   await send(cases[index].text);await expect(dialog.getByText(copy[cases[index].operation as keyof typeof copy],{exact:true})).toBeVisible();await expect(dialog.getByText(cases[index].shown,{exact:true})).toBeVisible();expect(writes).toBe(index);if(index===2)await expect.poll(()=>dialog.getByAltText(copy.photo).evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
   await expect(dialog).not.toContainText('changes_json');await expect(page).toHaveURL(/\/salon\/dashboard$/);
   const confirm=dialog.getByRole('button',{name:t('Confirm this change'),exact:true});await confirm.click();
   if(index===0){await expect(confirm).toBeDisabled();release();await expect(dialog).toContainText('20000000-0000-4000-8000-000000000077');await expect(confirm).toBeEnabled();await expect(dialog.getByText(cases[index].shown,{exact:true})).toBeVisible();await confirm.click();}
   await expect(dialog.getByText(t('Your change was saved and verified.'),{exact:true})).toHaveCount(index+1);await expect(confirm).toHaveCount(0);expect(writes).toBe(index+1);
  }
  expect(attempts).toBe(5);expect(saved).toHaveLength(4);expect(stock).toBe(12);
  await page.reload();await open();await send('Show the current saved oil stock.');await expect(dialog.getByText('Original oil: 12.',{exact:true})).toBeVisible();expect(writes).toBe(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('assistant-operations.png')});
 });
}
