import { expect, type Page } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { businessRebookingAdvice, type RebookingEvidence } from '../../src/lib/businessRebookingAdvice';
import { rebookingCopy } from '../../src/i18n/business-rebooking-copy';
test.use({serviceWorkers:'block'});
async function fixture(page: Page, locale='en') {
 const f=await p0OwnerFixture(page,{populated:true,locale});
 Object.assign(f.records.bookings[0],{guest_name:'Own returning client',status:'Completed',appointment_datetime:'2026-08-08T15:00:00Z'});
 const records=['2026-02-01','2026-04-01','2026-08-08'].map((date,index)=>({id:index===2?f.ids.booking:'55000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),salon_id:f.business.id,stylist_id:f.ids.professional,group_key:'1'.padStart(32,'0'),client_name:'Own returning client',status:'Completed',appointment_datetime:date+'T15:00:00Z',service_completed_at:null,unlinked_guest:false}));
 const proof:RebookingEvidence={salon_id:f.business.id,as_of:'2026-09-19T16:00:00Z',time_zone:'America/New_York',scope:'business',stylist_id:null,from:'2025-09-19',through:'2026-09-19',complete:true,record_count:3,records};
 const state={reads:0,denied:false,failed:false,hold:null as Promise<void>|null,data:businessRebookingAdvice(f.business.id,proof)};
 await page.route('**/api/salon/rebooking-advice',async route=>{state.reads++;expect(route.request().method()).toBe('GET');if(state.hold)await state.hold;return state.denied?route.fulfill({status:403,json:{code:'REBOOKING_ACCESS_DENIED'}}):state.failed?route.fulfill({status:503,json:{code:'REBOOKING_UNAVAILABLE',request_id:'99000000-0000-4000-8000-000000000182'}}):route.fulfill({json:state.data});});
 return{...f,state,proof};
}
for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
 test('Business rebooking advice shows exact own-client evidence and opens the existing record in '+locale,async({page},info)=>{
  const f=await fixture(page,locale),t=(key:Parameters<typeof rebookingCopy>[1])=>rebookingCopy(locale,key);
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/bookings');const region=page.getByRole('region',{name:t('title'),exact:true});
  await expect(region.getByText('Own returning client',{exact:true})).toBeVisible();await expect(region.getByText(t('countOne'),{exact:true})).toBeVisible();await expect(region.getByText(t('contact'),{exact:true})).toBeVisible();
  await expect(region.getByRole('link',{name:t('review'),exact:true})).toHaveAttribute('href','/salon/dashboard/bookings/'+f.ids.booking);
  await expect(region.getByRole('link',{name:t('updates'),exact:true})).toHaveAttribute('href','/salon/dashboard/messages/campaigns');
  const method=region.locator('details'),summary=method.locator('summary');await expect(summary).toHaveText(t('method'));await expect(method).toHaveJSProperty('open',false);
  await expect(region.getByText(t('definition'),{exact:true})).not.toBeVisible();
  expect((await region.getByRole('link',{name:t('review'),exact:true}).boundingBox())!.y).toBeLessThan((await summary.boundingBox())!.y);
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await summary.focus();await page.keyboard.press('Enter');await expect(method).toHaveJSProperty('open',true);
  for(const key of ['intro','definition','dateBasis','identity','consent']as const)await expect(method.getByText(t(key),{exact:true})).toBeVisible();
  const day=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
  await expect(method.getByText(rebookingCopy(locale,'period',{from:day(f.proof.from),to:day(f.proof.through),zone:f.proof.time_zone,time:new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:f.proof.time_zone}).format(new Date(f.proof.as_of))}),{exact:true})).toBeVisible();
  await summary.focus();await page.keyboard.press('Space');await expect(method).toHaveJSProperty('open',false);await expect(region.getByText('Own returning client',{exact:true})).toBeVisible();expect(f.state.reads).toBe(1);expect(f.actions).toEqual([]);
  await region.evaluate(element=>window.scrollTo(0,element.getBoundingClientRect().top+window.scrollY-110));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('rebooking-'+locale+'-'+width+'-viewport.png')});
  await region.getByRole('button',{name:t('refresh'),exact:true}).click();await expect(region.getByRole('link',{name:t('review'),exact:true})).toBeVisible();expect(f.state.reads).toBe(2);
  await region.getByRole('link',{name:t('review'),exact:true}).click();await expect(page).toHaveURL(new RegExp('/salon/dashboard/bookings/'+f.ids.booking+'$'));await expect(page.getByRole('heading',{name:/Own returning client/})).toBeVisible();
  expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
}
test('Business rebooking advice clears identities while refreshing and after a failed or denied read',async({page})=>{
 const f=await fixture(page);await page.goto('/salon/dashboard/bookings');const region=page.getByRole('region',{name:'Returning-client check-in',exact:true});await expect(region).toContainText('Own returning client');
 let release!:()=>void;f.state.hold=new Promise(resolve=>{release=resolve;});f.state.failed=true;
 await region.getByRole('button',{name:'Refresh client check-in',exact:true}).click();await expect(region.getByRole('link')).toHaveCount(0);await expect(region.getByText('Own returning client',{exact:true})).toHaveCount(0);release();f.state.hold=null;
 await expect(region.getByRole('alert')).toContainText('99000000-0000-4000-8000-000000000182');f.state.failed=false;f.state.denied=true;await region.getByRole('button',{name:'Refresh client check-in',exact:true}).click();await expect(region.getByRole('alert')).toHaveText(rebookingCopy('en','denied'));await expect(region.getByRole('link')).toHaveCount(0);expect(f.actions).toEqual([]);
});
test('Business rebooking advice does not request private history without that grant and labels an assigned staff scope',async({page})=>{
 const f=await fixture(page);let permitted=false;
 await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{bookings:true,client_history:permitted},records:f.records}}));
 await page.goto('/salon/dashboard/bookings');await expect(page.getByRole('heading',{name:'Bookings',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Returning-client check-in',exact:true})).toHaveCount(0);expect(f.state.reads).toBe(0);
 permitted=true;f.state.data=businessRebookingAdvice(f.business.id,{...f.proof,scope:'assigned_professional',stylist_id:f.ids.professional});await page.reload();const region=page.getByRole('region',{name:'Returning-client check-in',exact:true});await expect(region.getByText(rebookingCopy('en','scope'),{exact:true})).toBeVisible();await expect(region.locator('details')).toHaveJSProperty('open',false);await expect(region.getByRole('link',{name:'Review eligible email updates',exact:true})).toHaveCount(0);expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
});
test('Business rebooking advice distinguishes incomplete evidence, no history and a verified empty cohort',async({page})=>{
 const f=await fixture(page);f.state.data=businessRebookingAdvice(f.business.id,{...f.proof,complete:false,record_count:5001,records:[]});await page.goto('/salon/dashboard/bookings');const region=page.getByRole('region',{name:'Returning-client check-in',exact:true});await expect(region).toContainText(rebookingCopy('en','unavailable'));await expect(region).not.toContainText(rebookingCopy('en','empty'));
 f.state.data=businessRebookingAdvice(f.business.id,{...f.proof,record_count:0,records:[]});await region.getByRole('button',{name:'Refresh client check-in',exact:true}).click();await expect(region).toContainText(rebookingCopy('en','noHistory'));
 f.state.data=businessRebookingAdvice(f.business.id,{...f.proof,record_count:1,records:f.proof.records.slice(0,1)});await region.getByRole('button',{name:'Refresh client check-in',exact:true}).click();await expect(region).toContainText(rebookingCopy('en','empty'));await expect(region.getByRole('link')).toHaveCount(0);expect(f.actions).toEqual([]);
});
