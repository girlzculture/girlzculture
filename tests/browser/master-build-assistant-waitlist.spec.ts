import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {assistantWaitlistCopy} from '../../src/i18n/assistant-waitlist-copy';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';

test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,900],['zh-CN',844,390]] as const){
 test(`Master waitlist review shows the actual notification before one confirmed offer in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const copy=assistantWaitlistCopy(locale),t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  let plans=0,attempts=0,writes=0,activeId='';const saved=new Set<string>();let release!:()=>void;const delay=new Promise<void>(resolve=>{release=resolve;});
  const payload={operation:'waitlist_offer',record_id:f.ids.service,source_booking_id:f.ids.service,stylist_id:f.ids.service,customer_name:'Own client GC51',service_name:'Original service GC51',professional_name:'Own professional GC51',appointment_at:'2030-06-10T14:00:00Z',time_zone:'America/New_York',notification_locale:'es',notification_copy:{title:'Horario disponible',body:'Aún no se ha confirmado ninguna cita. Revisa y acepta la oferta.'},booking_created:false,payment_action:false,notification_queued:true};
  await page.route('**/api/salon/assistant',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);const body=route.request().postDataJSON();
   if(body.action==='confirm'){
    expect(body).toMatchObject({request_id:activeId,digest:'d'.repeat(64),confirm:true});attempts++;
    if(attempts===1){await delay;return route.fulfill({status:503,json:{code:'ASSISTANT_UNAVAILABLE',request_id:'20000000-0000-4000-8000-000000000099'}});}
    if(!saved.has(activeId)){saved.add(activeId);writes++;}return route.fulfill({json:{verified:true,result:{operation:'waitlist_offer',offer_id:f.ids.service,booking_created:false,payment_action:false,notification_queued:true}}});
   }
   expect(body.action).toBe('plan');plans++;activeId=body.request_id;
   if(plans>1)return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'get_appointment_waitlist',risk_class:1,arguments:{record_id:null},result:{total:1,requests:[{status:'offered'}]},confirmed_at:null},assistant_message:copy.read.replace('{count}','1')}});
   return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'prepare_booking_progress',risk_class:4,digest:'d'.repeat(64),before_summary:{},confirmed_at:null,arguments:{operation:'waitlist_offer',record_id:f.ids.service,changes_json:JSON.stringify({source_booking_id:f.ids.service,stylist_id:f.ids.service})},execution_payload:payload},preview_required:true}});
  });
  await page.goto('/salon/dashboard');const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  const open=async()=>{if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();};await open();
  const send=async(text:string)=>{await dialog.locator('textarea').fill(text);await dialog.getByRole('button',{name:t('Ask GC Assistant'),exact:true}).click();};
  await send('Review the available opening for my waiting client.');await expect(dialog.getByRole('heading',{name:copy.title,exact:true})).toBeVisible();
  for(const value of [copy.notice,copy.notification,payload.customer_name,payload.service_name,payload.professional_name,payload.notification_copy.title,payload.notification_copy.body])await expect(dialog.getByText(value,{exact:true})).toBeVisible();
  const displayedTime=new Intl.DateTimeFormat(locale,{dateStyle:'full',timeStyle:'short',timeZone:payload.time_zone}).format(new Date(payload.appointment_at));await expect(dialog.getByText(displayedTime,{exact:true})).toBeVisible();expect(writes).toBe(0);
  const confirm=dialog.getByRole('button',{name:t('Confirm this change'),exact:true});await confirm.click();await expect(confirm).toBeDisabled();release();
  await expect(dialog).toContainText('20000000-0000-4000-8000-000000000099');await expect(confirm).toBeEnabled();await confirm.click();
  await expect(dialog.getByText(t('Your change was saved and verified.'),{exact:true})).toBeVisible();expect(writes).toBe(1);expect(attempts).toBe(2);
  await page.reload();await open();await send('Read my saved waitlist.');await expect(dialog.getByText(copy.read.replace('{count}','1'),{exact:true})).toBeVisible();expect(writes).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('assistant-waitlist.png')});
 });
}
