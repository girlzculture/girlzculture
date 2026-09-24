import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {assistantOperationsCopy} from '../../src/i18n/assistant-operations-copy';
import {bookingCheckInReason} from '../../src/i18n/booking-check-in-reasons';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';

test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,900],['zh-CN',844,390]] as const){
 test(`Master booking progress requires explicit review and recovers safely in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const copy=assistantOperationsCopy(locale),t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  let writes=0,attempts=0,activeId='',status='Confirmed',incident='';let release!:()=>void;const delay=new Promise<void>(r=>{release=r;});
  let changes:Record<string,unknown>={},operation='';
  await page.route('**/api/salon/assistant',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);const body=route.request().postDataJSON();
   if(body.action==='confirm'){
    expect(body).toMatchObject({request_id:activeId,digest:'c'.repeat(64),confirm:true});attempts++;
    if(attempts===1){await delay;return route.fulfill({status:503,json:{code:'ASSISTANT_UNAVAILABLE',request_id:'20000000-0000-4000-8000-000000000099'}});}
    if(operation==='booking_service')status=changes.action==='check_in'?'Ready':changes.action==='start'?'In Progress':'Completed';else incident='no_show';
    writes++;return route.fulfill({json:{verified:true,result:{operation,status,incident,provider_action:false,notification_sent:false}}});
   }
   expect(body.action).toBe('plan');activeId=body.request_id;
   if(body.text==='Read saved results.')return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'get_bookings',risk_class:1,arguments:{},execution_payload:{},before_summary:{},result:{status,incident},confirmed_at:null},assistant_message:`GC-BOOK-51 · ${copy.Completed}; GC-BOOK-52 · ${copy.no_show}`}});
   const next=operation==='booking_attendance'?'No Show':changes.action==='check_in'?'Ready':changes.action==='start'?'In Progress':'Completed';
   return route.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'prepare_booking_progress',risk_class:4,digest:'c'.repeat(64),before_summary:{status},confirmed_at:null,arguments:{operation,record_id:f.ids.service,changes_json:JSON.stringify(changes)},execution_payload:{operation,record_name:operation==='booking_attendance'?'GC-BOOK-52':'GC-BOOK-51',changes,next_status:next,provider_action:false,notification_sent:false}},preview_required:true}});
  });
  await page.goto('/salon/dashboard');const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  const open=async()=>{if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();};await open();
  const send=async(text:string)=>{await dialog.locator('textarea').fill(text);await dialog.getByRole('button',{name:t('Ask GC Assistant'),exact:true}).click();};
  for(const action of ['check_in','start','complete','confirm']){
   operation=action==='confirm'?'booking_attendance':'booking_service';
   changes=action==='confirm'?{action,kind:'no_show',reason:'Owner verified missed appointment'}:{action,reason_code:action==='check_in'?'customer_arrived_early':null,reason_detail:action==='check_in'?'Owner verified actual arrival':null,attested:true};
   const previousWrites=writes;await send(`Review ${action} for ${action==='confirm'?'GC-BOOK-52':'GC-BOOK-51'}.`);
   await expect(dialog.getByRole('heading',{name:copy[operation as 'booking_service'|'booking_attendance'],exact:true}).last()).toBeVisible();
   await expect(dialog.getByText(operation==='booking_service'?copy.booking_only:copy.incident_only,{exact:true}).last()).toBeVisible();
   if(action==='check_in')await expect(dialog.getByText(bookingCheckInReason('customer_arrived_early',locale),{exact:true})).toBeVisible();
   if(action==='confirm'){await expect(dialog.getByText(copy.incident_kind,{exact:true})).toBeVisible();await expect(dialog.getByText('Owner verified missed appointment',{exact:true})).toBeVisible();}
   expect(writes).toBe(previousWrites);
   const confirm=dialog.getByRole('button',{name:t('Confirm this change'),exact:true});await confirm.click();
   if(action==='check_in'){
    await expect(confirm).toBeDisabled();release();await expect(dialog).toContainText('20000000-0000-4000-8000-000000000099');await expect(confirm).toBeEnabled();
    await expect(dialog.getByText('GC-BOOK-51',{exact:true})).toBeVisible();expect(writes).toBe(0);await confirm.click();
   }
   await expect(dialog.getByText(t('Your change was saved and verified.'),{exact:true})).toHaveCount(previousWrites+1);expect(writes).toBe(previousWrites+1);
  }
  expect(attempts).toBe(5);expect(status).toBe('Completed');expect(incident).toBe('no_show');
  await page.reload();await open();await send('Read saved results.');await expect(dialog.getByText(`GC-BOOK-51 · ${copy.Completed}; GC-BOOK-52 · ${copy.no_show}`,{exact:true})).toBeVisible();expect(writes).toBe(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('assistant-booking-progress.png')});
 });
}
