import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {assistantCatalogCopy} from '../../src/i18n/assistant-catalog-copy';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';

test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,900],['zh-CN',844,390]] as const){
 test(`Master catalog review publishes only confirmed own records and retains recovery in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const copy=assistantCatalogCopy(locale),t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  const cases=[
   {tool:'prepare_service_change',changes:{name:'Original service GC41',base_price:125,duration_min_hours:1.5,duration_max_hours:2,is_draft:false,size_options:[{label:'Small',price_add:20}],length_options:[{label:'Waist',price_add:30}],addons:[{label:'Scalp treatment',price_add:15}],included_items:['Original inclusion GC45'],style_materials:[{name:'Kanekalon (standard)',price:25,longevity_weeks:6,quality_grade:'Best'}]},shown:'Original service GC41'},
   {tool:'prepare_professional_change',changes:{name:'Original professional GC42',bio:'Reviewed biography',is_draft:false,assigned_service_ids:[f.ids.service]},shown:'Original professional GC42'},
   {tool:'prepare_product_change',changes:{name:'Original product GC43',price:35,is_visible:true,product_status:'Active',pickup_enabled:true},shown:'Original product GC43'},
   {tool:'prepare_promotion_change',changes:{title:'Original offer GC44',promotion_type:'percentage',discount_value:20,status:'Active',target_scope:'services',target_ids:[f.ids.service]},shown:'Original offer GC44'},
  ];
  let index=0,attempts=0,writes=0,activeId='';let release!:()=>void;
  const delayed=new Promise<void>(r=>{release=r;}),saved=new Set<string>();
  await page.route('**/api/salon/assistant',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);
   const body=route.request().postDataJSON();
   if(body.action==='confirm'){
    expect(body).toMatchObject({request_id:activeId,digest:'b'.repeat(64),confirm:true});attempts++;
    if(attempts===1){await delayed;return route.fulfill({status:503,json:{code:'ASSISTANT_UNAVAILABLE',request_id:'20000000-0000-4000-8000-000000000088'}});}
    if(!saved.has(activeId)){saved.add(activeId);writes++;}
    return route.fulfill({json:{verified:true,result:{tool:cases[index].tool,provider_action:false}}});
   }
   expect(body.action).toBe('plan');activeId=body.request_id;
   if(index===cases.length)return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'get_services_and_prices',risk_class:1,arguments:{query:'GC41'},execution_payload:{},before_summary:{},result:{services:[{name:'Original service GC41',base_price:125,duration_min_hours:1.5,duration_max_hours:2}],inventory_total:1},confirmed_at:null},assistant_message:'Original service GC41: $125, 1.5–2 h.'}});
   const c=cases[index];return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:c.tool,risk_class:4,digest:'b'.repeat(64),before_summary:{},confirmed_at:null,arguments:{record_id:null,changes_json:JSON.stringify(c.changes)},execution_payload:{tool:c.tool,record_id:null,changes:c.changes,values:c.changes,assignment_names:['Original service GC41'],target_names:['Original service GC41']}},preview_required:true}});
  });
  await page.goto('/salon/dashboard');
  const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  const open=async()=>{if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();};await open();
  const send=async(text:string)=>{await dialog.locator('textarea').fill(text);await dialog.getByRole('button',{name:t('Ask GC Assistant'),exact:true}).click();};
  for(index=0;index<cases.length;index++){
   await send(`Review publication of ${cases[index].shown}.`);
   const review=dialog.getByRole('region',{name:copy.review,exact:true});await expect(review).toBeVisible();
   await expect(review.getByText(cases[index].shown,{exact:true})).toHaveCount(2);
   await expect(review).not.toContainText('changes_json');await expect(review).not.toContainText(f.ids.service);
   if(index===1||index===3)await expect(review.getByText('Original service GC41',{exact:true})).toBeVisible();
   if(index===0){await expect(review).toContainText('Original inclusion GC45');await expect(review).toContainText('Kanekalon (standard)');await expect(review).toContainText(copy.price_add);await expect(review).toContainText(new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(25));await expect(review).not.toContainText('[object Object]');}
   expect(writes).toBe(index);await expect(page).toHaveURL(/\/salon\/dashboard$/);
   const confirm=dialog.getByRole('button',{name:t('Confirm this change'),exact:true});await confirm.click();
   if(index===0){await expect(confirm).toBeDisabled();release();await expect(dialog).toContainText('20000000-0000-4000-8000-000000000088');await expect(confirm).toBeEnabled();await expect(review).toBeVisible();await confirm.click();}
   await expect(dialog.getByText(t('Your change was saved and verified.'),{exact:true})).toHaveCount(index+1);expect(writes).toBe(index+1);
  }
  expect(attempts).toBe(5);await page.reload();await open();await send('Read the current saved service price and duration.');
  await expect(dialog.getByText('Original service GC41: $125, 1.5–2 h.',{exact:true})).toBeVisible();expect(writes).toBe(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('assistant-catalog.png')});
 });
}

