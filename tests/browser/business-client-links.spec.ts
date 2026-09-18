import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {BUSINESS_CLIENT_SOURCE_MESSAGES} from '../../src/i18n/business-client-source-catalog';
import type {ClientCard, ClientLinks} from '../../src/lib/businessClientCore';
test.use({serviceWorkers:'block'});
for(const [locale,width,height] of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Returning guest link is reviewed, retained on failure, persisted and reversible in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});const id=f.ids.booking;
  const target='10000000-0000-4000-8000-000000000022',link='10000000-0000-4000-8000-000000000023',reference='10000000-0000-4000-8000-000000000024';
  const t=(s:string)=>BUSINESS_CLIENT_SOURCE_MESSAGES[locale]?.[s]||s;
  let linked=false,revision=0,fail=true;const writes:Record<string,unknown>[]=[];
  const date='2026-09-10T15:00:00Z';
  const card=():ClientCard=>({card_id:'guest-card',revision:1,booking_id:id,scope:'this_business_only',scope_stylist_id:null,source_locale:'en',preferences:'Guest preference',notes:'Guest original GC123',cautions:'Guest original sensitivity',permissions:{client_history:true,client_formulas:true,client_notes:true,client_cautions:true,client_photos:true,client_spend:true,client_edit:true},can_link_visits:true,visits:[],visit_count:linked?3:1,capped_at:200,photos:[],spend:null,related_profiles:linked?[{card_id:'prior-card',booking_id:target,date,source_locale:'fr',preferences:'Pas trop serré 240',notes:'Prior original 4 / 27',cautions:'Prior sensitivity GC456'}]:[]});
  await page.route(`**/api/salon/bookings/${id}/client-record`,route=>route.fulfill({json:{card:card()}}));
  await page.route(`**/api/salon/bookings/${id}/client-record/links*`,route=>{
   if(route.request().method()==='GET'){
    const data:ClientLinks={revision,links:linked?[{id:link,from_name:'Guest GC123',from_date:date,to_name:'Returning GC123',to_date:date}]:[],candidates:linked?[]:[{booking_id:target,name:'Returning GC123',date,service:'Box Braids 4 / 27'}]};return route.fulfill({json:data});
   }
   const input=route.request().postDataJSON();writes.push(input);expect(input.revision).toBe(revision);
   if(fail){fail=false;return route.fulfill({status:503,json:{code:'CLIENT_UNAVAILABLE',request_id:reference}});}
   linked=input.action==='link';revision++;return route.fulfill({json:{verified:true,card:card()}});
  });
  await page.setViewportSize({width,height});await page.goto(`/salon/dashboard/bookings/${id}`);
  const region=page.getByRole('region',{name:t('Client history and formulas'),exact:true});await region.getByRole('button',{name:t('Open client record'),exact:true}).click();
  const links=region.getByRole('region',{name:t('Link returning guest visits'),exact:true});
  expect((await links.getByRole('textbox',{name:t('Find a client at this business'),exact:true}).boundingBox())?.width).toBeGreaterThan(160);await links.getByRole('textbox',{name:t('Find a client at this business'),exact:true}).fill('Returning');await links.getByRole('button',{name:t('Search / reload links'),exact:true}).click();
  await links.getByRole('button',{name:t('Review link'),exact:true}).click();expect(writes).toHaveLength(0);
  await links.getByRole('button',{name:t('Confirm client link'),exact:true}).click();await expect(links.getByText(reference,{exact:true})).toBeVisible();
  await expect(links.getByRole('group',{name:t('Review client link'),exact:true})).toContainText('Returning GC123');
  await links.getByRole('button',{name:t('Confirm client link'),exact:true}).click();await expect(links.getByText(t('Client link saved and verified.'),{exact:true})).toBeVisible();
  expect(writes).toHaveLength(2);expect(writes[0].request_id).toEqual(writes[1].request_id);expect(writes[1].target).toBe(target);
  await expect(region.getByRole('textbox',{name:t('Private client notes'),exact:true})).toHaveValue('Guest original GC123');await expect(region.getByText('Prior sensitivity GC456',{exact:true})).toBeVisible();
  await page.reload();await region.getByRole('button',{name:t('Open client record'),exact:true}).click();await expect(region.getByText('Prior original 4 / 27',{exact:true})).toBeVisible();
  await expect(region.getByRole('textbox',{name:t('Allergies, sensitivities and cautions'),exact:true})).toHaveValue('Guest original sensitivity');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await region.screenshot({path:info.outputPath('linked-client-record.png')});
  await links.getByRole('button',{name:t('Search / reload links'),exact:true}).click();await links.getByRole('button',{name:t('Review unlink'),exact:true}).click();expect(writes).toHaveLength(2);
  await links.getByRole('button',{name:t('Confirm unlink'),exact:true}).click();await expect(region.getByText('Prior sensitivity GC456',{exact:true})).toHaveCount(0);
  await expect(region.getByRole('textbox',{name:t('Private client notes'),exact:true})).toHaveValue('Guest original GC123');expect(writes[2].target).toBe(link);expect(f.unexpected).toEqual([]);
 });
}
