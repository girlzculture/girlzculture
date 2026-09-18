import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { BUSINESS_CLIENT_SOURCE_MESSAGES } from '../../src/i18n/business-client-source-catalog';
import type { ClientCard } from '../../src/lib/businessClientCore';
test.use({serviceWorkers:'block'});
for(const [locale,width,height] of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Private client record retains drafts, formula facts, photos and saved values in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale}),id=f.ids.booking;
  const t=(value:string)=>BUSINESS_CLIENT_SOURCE_MESSAGES[locale]?.[value]||value;
  let card:ClientCard={card_id:'card-A',revision:0,booking_id:id,scope:'this_business_only',scope_stylist_id:null,source_locale:'en',preferences:'Original preference',notes:'Original note',cautions:'Original caution',permissions:{client_history:true,client_formulas:true,client_notes:true,client_cautions:true,client_photos:true,client_spend:true,client_edit:true},visits:[{booking_id:id,date:String(f.records.bookings[0].appointment_datetime),name:'Box Braids',status:'Confirmed',duration_hours:4,size:'Medium',length:'Waist',options:{},formula:{instructions:'Original exact formula 4 / 27',duration_minutes:240},formula_locale:'en',agreed_amount:100}],visit_count:1,capped_at:200,photos:[],spend:{completed_agreed_cents:10000,recorded_payment_cents:2000,currency:'USD',basis:'linked_bookings_and_recorded_chair_payments',period:'all_time'}};
  let fail=true;const attempts:Record<string,unknown>[]=[];
  const endpoint=`**/api/salon/bookings/${id}/client-record`;
  await page.route(endpoint,async route=>{
   if(route.request().method()==='GET')return route.fulfill({json:{card}});
   const input=route.request().postDataJSON();attempts.push(input);
   if(fail){fail=false;return route.fulfill({status:503,json:{code:'CLIENT_UNAVAILABLE',request_id:'99000000-0000-4000-8000-000000000005'}});}
   card={...card,...input.patch,revision:card.revision+1,visits:card.visits.map(v=>({...v,formula:input.patch.formula}))};
   return route.fulfill({json:{verified:true,card}});
  });
  const photoId='99000000-0000-4000-8000-000000000006';
  await page.route(`**/api/salon/bookings/${id}/client-record/photos`,async route=>{
   expect(route.request().method()).toBe('POST');expect(route.request().postDataBuffer()?.toString()).toContain('Private work GC123');
   card={...card,photos:[{id:photoId,booking_id:id,caption:'Private work GC123',source_locale:locale,created_at:'2026-09-18T12:00:00Z'}]};
   return route.fulfill({json:{verified:true,card}});
  });
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=','base64');
  await page.route(`**/api/salon/bookings/${id}/client-record/photos/${photoId}`,route=>{
   expect(route.request().headers().authorization).toMatch(/^Bearer /);
   if(route.request().method()==='DELETE'){card={...card,photos:[]};return route.fulfill({json:{removed:true,id:photoId}});}
   return route.fulfill({contentType:'image/png',body:png});
  });
  await page.setViewportSize({width,height});await page.goto(`/salon/dashboard/bookings/${id}`);
  const region=page.getByRole('region',{name:t('Client history and formulas'),exact:true});
  await region.getByRole('button',{name:t('Open client record'),exact:true}).click();
  const preferences=region.getByRole('textbox',{name:t('Client preferences'),exact:true}),formula=region.getByRole('textbox',{name:t('Exact service instructions'),exact:true});
  await expect(preferences).toHaveValue('Original preference');await formula.fill('Medium waist-length box braids — 4 / 27');
  await preferences.fill('No excessive tightness');await region.getByRole('spinbutton',{name:t('Actual duration (minutes)'),exact:true}).fill('240');
  await region.getByRole('button',{name:t('Save client record'),exact:true}).click();
  await expect(region.getByText('99000000-0000-4000-8000-000000000005',{exact:true})).toBeVisible();
  await expect(formula).toHaveValue('Medium waist-length box braids — 4 / 27');
  await region.getByRole('button',{name:t('Save client record'),exact:true}).click();await expect(region.getByText(t('Client record saved and verified.'),{exact:true})).toBeVisible();
  expect(attempts).toHaveLength(2);expect(attempts[0].request_id).toEqual(attempts[1].request_id);
  await region.getByLabel(t('Add a work photo (JPG, PNG or WebP, up to 10 MB)'),{exact:true}).setInputFiles({name:'work.png',mimeType:'image/png',buffer:png});
  await region.getByRole('textbox',{name:t('Work photo caption'),exact:true}).fill('Private work GC123');await region.getByRole('button',{name:t('Save private photo'),exact:true}).click();
  await expect(region.getByRole('img',{name:'Private work GC123',exact:true})).toHaveAttribute('src',/^blob:/);
  await page.reload();await region.getByRole('button',{name:t('Open client record'),exact:true}).click();await expect(preferences).toHaveValue('No excessive tightness');await expect(formula).toHaveValue('Medium waist-length box braids — 4 / 27');
  await expect(region.getByRole('img',{name:'Private work GC123',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await region.screenshot({path:info.outputPath('client-record.png')});
  await region.getByRole('button',{name:t('Remove photo'),exact:true}).click();await region.getByRole('button',{name:t('Confirm photo removal'),exact:true}).click();await expect(region.getByText(t('No private work photos saved.'),{exact:true})).toBeVisible();
  expect(f.unexpected).toEqual([]);
 });
}

test('client field restrictions and revoked access remove private content',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true});let revoked=false;
 await page.route(`**/api/salon/bookings/${f.ids.booking}/client-record`,route=>revoked?route.fulfill({status:403,json:{code:'CLIENT_ACCESS_DENIED',request_id:'99000000-0000-4000-8000-000000000009'}}):route.fulfill({json:{card:{card_id:'card',revision:1,booking_id:f.ids.booking,scope:'assigned_stylist_only',source_locale:'en',permissions:{client_history:true,client_formulas:true,client_notes:true,client_cautions:false,client_photos:false,client_spend:false,client_edit:false},notes:'Permitted own note',preferences:'Permitted preference',cautions:null,photos:[],visits:[],visit_count:0,capped_at:200,spend:null}}}));
 await page.goto(`/salon/dashboard/bookings/${f.ids.booking}`);const region=page.getByRole('region',{name:'Client history and formulas',exact:true});await region.getByRole('button',{name:'Open client record',exact:true}).click();
 await expect(region.getByRole('textbox',{name:'Private client notes',exact:true})).toBeDisabled();await expect(region.getByRole('textbox',{name:'Allergies, sensitivities and cautions',exact:true})).toHaveCount(0);await expect(region.getByRole('button',{name:'Save client record',exact:true})).toHaveCount(0);await expect(region.getByText('Private work photos',{exact:true})).toHaveCount(0);
 revoked=true;await region.getByRole('button',{name:'Reload saved client record',exact:true}).click();await expect(region.getByText('This client record is not available to your current account.',{exact:true})).toBeVisible();await expect(region.getByRole('textbox',{name:'Private client notes',exact:true})).toHaveCount(0);
 expect(f.unexpected).toEqual([]);
});
