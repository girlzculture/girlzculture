import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {BUSINESS_RESCHEDULE_SOURCE_MESSAGES} from '../../src/i18n/business-reschedule-source-catalog';
import {rescheduleLocalTimestamp} from '../../src/lib/bookingRescheduleCore';
test.use({serviceWorkers:'block'});
for(const [locale,width,height] of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Business substitution keeps the appointment and failed draft until approval in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});const booking=f.records.bookings[0],before={...booking};
  const t=(s:string)=>BUSINESS_RESCHEDULE_SOURCE_MESSAGES[locale]?.[s]||s;
  const local=rescheduleLocalTimestamp(booking.appointment_datetime,String(f.business.time_zone));
  let saved:Record<string,unknown>|null=null;const requests:Record<string,unknown>[]=[];
  await page.route(`**/api/salon/bookings/${f.ids.booking}/reschedule**`,async route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.method()==='GET')return route.fulfill({json:url.searchParams.has('date')?{slots:[{value:local.slice(11),label:'1:00 PM',stylistId:'professional-substitute',stylistName:'Save — Other professional'}]}:{proposals:saved?[saved]:[]}});
   const body=request.postDataJSON();requests.push(body);
   if(requests.length===1)return route.fulfill({status:503,json:{code:'RESCHEDULE_UNAVAILABLE',request_id:'GC-PROPOSAL-LOCAL-23'}});
   saved={id:'proposal-1',status:'Pending',reason:body.reason,expires_at:'2099-01-01T12:00:00Z',options:body.options};return route.fulfill({status:201,json:{proposal:saved,warnings:[]}});
  });
  await page.setViewportSize({width,height});await page.goto(`/salon/dashboard/bookings/${f.ids.booking}`);
  const region=page.getByRole('region',{name:t('Appointment change proposal'),exact:true});await expect(region).toBeVisible();
  await expect(region.getByText('Save',{exact:true})).toBeVisible();
  await region.getByRole('button',{name:t('Another professional, same time'),exact:true}).click();
  await region.getByRole('checkbox',{name:/Save — Other professional/}).check();
  await region.getByRole('textbox',{name:t('Reason for proposing a change'),exact:true}).fill('Original reason — Save $180 GCABC12');
  await region.getByRole('textbox',{name:t('Optional message to the customer'),exact:true}).fill('Please approve another professional.');
  const send=region.getByRole('button',{name:t('Send proposal for customer approval'),exact:true});await send.click();
  await expect(region.getByRole('alert')).toContainText('GC-PROPOSAL-LOCAL-23');
  await expect(region.getByRole('textbox',{name:t('Reason for proposing a change'),exact:true})).toHaveValue('Original reason — Save $180 GCABC12');
  await expect(region.getByRole('checkbox',{name:/Save — Other professional/})).toBeChecked();await send.click();
  await expect(region.getByRole('status')).toContainText(t('Proposal saved. The appointment changes only after customer approval; price and deposit stay the same.'));
  expect(requests).toHaveLength(2);expect(requests[0].client_request_id).toBe(requests[1].client_request_id);expect(requests[1].change_kind).toBe('substitution');expect(requests[1].options).toEqual([{local,stylistId:'professional-substitute'}]);expect(booking).toEqual(before);
  await page.reload();await expect(region.getByText('Original reason — Save $180 GCABC12',{exact:true})).toBeVisible();
  await region.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('appointment-substitution.png')});expect(f.unexpected).toEqual([]);
 });
}
for(const response of ['accept','decline'] as const){
 test(`Business substitution customer can ${response} explicitly without changing the booked facts early`,async({page})=>{
  await p0OwnerFixture(page,{populated:true});const appointment='2030-09-25T14:00:00.000Z';const booking={id:'booking-guest',status:'Confirmed',appointment_datetime:appointment,duration_hours:3,estimated_total:100,deposit_amount:10,balance_due:90,deposit_status:'Paid',guest_name:'Guest original',public_reference:'GCABC12'};
  let action:Record<string,unknown>|undefined;let accepted=false;
  const proposal={id:'proposal-guest',status:'Pending',message:'Original proposal',reason:'Substitution',expires_at:'2030-09-24T14:00:00Z',options:[{id:'option-other',appointment_datetime:appointment,stylist:{name:'Other professional'}}]};
  await page.route('**/api/guest/bookings/manage**',async route=>{if(route.request().method()==='POST'){action=route.request().postDataJSON();accepted=action?.action==='accept_reschedule';return route.fulfill({json:{status:'Confirmed',manage_url:'/booking/manage/fixture-result'}});}return route.fulfill({json:{booking,salon:{id:'business-a',name:'Original business',time_zone:'America/New_York',slug:'original'},style:{name:'Original service'},stylist:{name:accepted?'Other professional':'Original professional'},proposals:action?[]:[proposal],access_expires_at:'2030-09-25T14:00:00Z'}});});
  await page.goto('/booking/manage/fixture-only');const region=page.locator('section').filter({has:page.getByRole('heading',{name:'The business proposed an appointment change',exact:true})});await expect(region).toBeVisible();
  await expect(page.getByText('Original professional',{exact:false}).first()).toBeVisible();await expect(region.getByRole('button',{name:'Accept selected option',exact:true})).toBeDisabled();
  if(response==='accept'){await region.getByRole('radio').check();await region.getByRole('button',{name:'Accept selected option',exact:true}).click();}else await region.getByRole('button',{name:'Decline proposal',exact:true}).click();
  await expect(page).toHaveURL(/\/booking\/manage\/fixture-result$/);await expect(page.getByText(response==='accept'?'Other professional':'Original professional',{exact:false}).first()).toBeVisible();expect(action?.action).toBe(`${response}_reschedule`);expect(action?.proposal_id).toBe('proposal-guest');expect(booking.estimated_total).toBe(100);expect(booking.deposit_amount).toBe(10);expect(booking.balance_due).toBe(90);
 });
}

test('Business substitution customer conflict preserves the selected option and expiry closes the proposal',async({page})=>{
 await page.clock.install({time:new Date('2030-09-24T13:59:30Z')});await p0OwnerFixture(page,{populated:true});let attempts=0;
 await page.route('**/api/guest/bookings/manage**',async route=>{
  if(route.request().method()==='POST'){attempts++;return route.fulfill({status:409,json:{error:'That time or professional is no longer available. Ask the salon for another option.'}});}
  return route.fulfill({json:{booking:{id:'booking-guest',status:'Confirmed',appointment_datetime:'2030-09-25T14:00:00Z',duration_hours:3,estimated_total:100,deposit_amount:10,balance_due:90,deposit_status:'Paid',guest_name:'Guest original',public_reference:'GCABC12'},salon:{id:'business-a',name:'Original business',time_zone:'America/New_York',slug:'original'},style:{name:'Original service'},stylist:{name:'Original professional'},proposals:[{id:'proposal-guest',status:'Pending',message:'Original proposal',expires_at:'2030-09-24T14:00:00Z',options:[{id:'option-other',appointment_datetime:'2030-09-25T14:00:00Z',stylist:{name:'Other professional'}}]}],access_expires_at:'2030-09-25T14:00:00Z'}});
 });
 await page.goto('/booking/manage/fixture-only');const accept=page.getByRole('button',{name:'Accept selected option',exact:true});await page.getByRole('radio').check();await accept.click();await expect(page.getByText('That time or professional is no longer available. Ask the salon for another option.',{exact:true})).toBeVisible();await expect(page.getByRole('radio')).toBeChecked();expect(attempts).toBe(1);
 await page.clock.runFor(31_000);await expect(accept).toHaveCount(0);expect(attempts).toBe(1);await expect(page.getByText(/Original professional/).first()).toBeVisible();
});
