import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
import {BUSINESS_REVIEWS_SOURCE_MESSAGES} from '../../src/i18n/business-reviews-source-catalog';
test.use({serviceWorkers:'block'});

test('Business reviews stale editing keeps the draft while loading the current public reply',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true,locale:'en'}),row=f.records.reviews[0];row.salon_reply='First public response';row.reply_revision=1;
 const requests:Record<string,unknown>[]=[];
 await page.route(`**/api/salon/reviews/${f.ids.review}/reply`,route=>{const body=route.request().postDataJSON();requests.push(body);if(requests.length===1){row.salon_reply='Response from another device';row.reply_revision=2;return route.fulfill({status:409,json:{error:'This reply changed elsewhere. Your draft is kept; reload the current review before saving.',code:'REVIEW_REPLY_STALE'}});}expect(body.expected_revision).toBe(2);row.salon_reply=body.reply;row.reply_revision=3;return route.fulfill({json:{review:row,content_status:'published',message:'Your reply is now public.'}});});
 await page.goto(`/salon/dashboard/reviews/${f.ids.review}`);await page.getByRole('button',{name:'Edit reply',exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Reply as the salon',exact:true});await editor.fill('My retained considered response');await page.getByRole('button',{name:'Save reply',exact:true}).click();
 await expect(page.getByRole('region',{name:'Reviews workspace',exact:true}).getByRole('alert')).toContainText('changed elsewhere');await expect(editor).toHaveValue('My retained considered response');
 await page.getByRole('button',{name:'Review latest reply',exact:true}).click();await expect(page.getByRole('region',{name:'Public salon reply',exact:true})).toContainText('Response from another device');await expect(editor).toHaveValue('My retained considered response');
 await page.getByRole('button',{name:'Save reply',exact:true}).click();await expect(page.getByRole('region',{name:'Public salon reply',exact:true})).toContainText('My retained considered response');expect(requests[0].request_id).not.toBe(requests[1].request_id);expect(f.unexpected).toEqual([]);
});

test('Business reviews page and rating filters survive detail return and refresh',async({page},info)=>{
 const f=await p0OwnerFixture(page,{populated:true,locale:'en'}),base={...f.records.reviews[0]};f.records.reviews=Array.from({length:25},(_,index)=>({...base,id:`33000000-0000-4000-8000-${String(index+200).padStart(12,'0')}`,display_name:`Client ${String(index).padStart(2,'0')}`,rating_overall:index===24?3:5,created_at:new Date(Date.UTC(2030,0,25-index)).toISOString()}));
 await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/reviews');const region=page.getByRole('region',{name:'Reviews workspace',exact:true});
 await expect(region.getByRole('link',{name:'Open review',exact:true})).toHaveCount(20);await region.getByRole('navigation',{name:'Review pages',exact:true}).getByRole('button',{name:'Next',exact:true}).click();
 await expect(page).toHaveURL(/page=2/);await expect(region.getByRole('link',{name:'Open review',exact:true})).toHaveCount(5);await region.getByRole('link',{name:'Open review',exact:true}).last().click();await expect(page).toHaveURL(/reviews\/33000000-0000-4000-8000-000000000224/);await page.goBack();await expect(page).toHaveURL(/page=2/);await page.reload();await expect(region.getByRole('heading',{name:'Client 24',exact:true})).toBeVisible();
 await region.locator('summary').filter({hasText:'Rating and service filters'}).click();await region.getByRole('combobox',{name:'Rating',exact:true}).selectOption('3');await expect(page).toHaveURL(/rating=3/);await expect(region.getByRole('link',{name:'Open review',exact:true})).toHaveCount(1);await page.reload();await expect(region.getByRole('combobox',{name:'Rating',exact:true})).toHaveValue('3');
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('reviews-phone-inbox.png')});expect(f.unexpected).toEqual([]);
});

test('Business reviews moderation hold never invents a published reply',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true,locale:'en'});
 const draft='Thank you for visiting. We will follow up respectfully.';
 await page.route(`**/api/salon/reviews/${f.ids.review}/reply`,route=>route.fulfill({json:{review:f.records.reviews[0],content_status:'pending',message:'Your reply is pending platform moderation and is not public yet.'}}));
 await page.goto(`/salon/dashboard/reviews/${f.ids.review}`);
 await page.getByRole('textbox',{name:'Reply as the salon',exact:true}).fill(draft);
 await page.getByRole('button',{name:'Save reply',exact:true}).click();
 await expect(page.getByText('Your reply is pending platform moderation and is not public yet.',{exact:true})).toBeVisible();
 await expect(page.getByText('Salon reply',{exact:true})).toHaveCount(0);
 expect(f.records.reviews[0].salon_reply).toBeUndefined();
 expect(f.unexpected).toEqual([]);
});

for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]]as const){
 test(`Business reviews preserve public facts and reviewed reply state in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});
  const t=(s:string)=>BUSINESS_REVIEWS_SOURCE_MESSAGES[locale]?.[s]||DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  const original='Original customer review — Save $180',draft='Thank you Save — original $180 facts.',edited='Thank you Save. Your $180 appointment matters to us.';
  f.records.reviews[0].reply_revision=0;
  f.records.reviews.push({...f.records.reviews[0],id:'33000000-0000-4000-8000-000000000099',display_name:'Removed customer',moderation_status:'Hidden',rating_overall:1});
  const requests:Record<string,unknown>[]=[];let fail=true,held=true;
  const reference='55555555-5555-4555-8555-555555555555';
  await page.route(`**/api/salon/reviews/${f.ids.review}/reply`,async route=>{
   const body=route.request().postDataJSON();requests.push(body);if(fail){fail=false;return route.fulfill({status:503,json:{error:'The review reply could not be saved.',reference}});}
   const row=f.records.reviews[0];expect(body.expected_revision).toBe(row.reply_revision);
   row.reply_revision=Number(row.reply_revision)+1;
   if(held)row.reply_queue=[{status:'Pending',submitted_reply:body.reply}];else{row.salon_reply=body.reply;row.reply_queue=[];}
   return route.fulfill({json:{review:row,content_status:held?'pending':'published',message:held?'Your reply is pending platform moderation and is not public yet.':'Your reply is now public.'}});
  });
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/reviews');
  const region=page.getByRole('region',{name:t('Reviews workspace'),exact:true});await expect(region).toBeVisible();
  await expect(region.getByRole('group',{name:t('Review status filters'),exact:true}).getByRole('button',{name:new RegExp(t('Recent')+' 1')})).toBeVisible();
  await region.getByRole('searchbox',{name:t('Search reviews'),exact:true}).fill('Save');await region.getByRole('button',{name:t('Search'),exact:true}).click();await expect(page).toHaveURL(/q=Save/);
  if(width>=1280)await region.getByRole('button',{name:t('Open review'),exact:true}).click();else await region.getByRole('link',{name:t('Open review'),exact:true}).click();
  const editor=region.getByRole('textbox',{name:t('Reply as the salon'),exact:true});await editor.fill(draft);await region.getByRole('button',{name:t('Save reply'),exact:true}).click();
  await expect(region.getByRole('alert')).toContainText(reference);await expect(editor).toHaveValue(draft);
  await region.getByRole('button',{name:t('Save reply'),exact:true}).click();await expect(region.getByRole('region',{name:t('Unpublished reply'),exact:true})).toContainText(draft);
  expect(requests[0].request_id).toBe(requests[1].request_id);
  await expect(region.getByRole('region',{name:t('Public salon reply'),exact:true})).toHaveCount(0);
  await page.reload();await expect(region.getByRole('region',{name:t('Unpublished reply'),exact:true})).toContainText(draft);
  held=false;await region.getByRole('button',{name:t('Edit reply'),exact:true}).click();await editor.fill(edited);await region.getByRole('button',{name:t('Save reply'),exact:true}).click();
  await expect(region.getByRole('region',{name:t('Public salon reply'),exact:true})).toContainText(edited);await expect(region.getByRole('region',{name:t('Unpublished reply'),exact:true})).toHaveCount(0);
  expect(requests[2].request_id).not.toBe(requests[1].request_id);expect(f.records.reviews[0].written_review).toBe(original);
  await page.reload();await expect(region.getByRole('region',{name:t('Public salon reply'),exact:true})).toContainText(edited);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('reviews-workspace.png'),fullPage:true});expect(f.unexpected).toEqual([]);
 });
}
