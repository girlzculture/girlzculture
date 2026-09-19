import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';
import { BUSINESS_MESSAGES_SOURCE_MESSAGES } from '../../src/i18n/business-messages-source-catalog';

test.use({serviceWorkers:'block'});

for(const [locale,width,height]of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]]as const){
 test(`Business messages retain drafts, originals and closed history in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});
  const t=(s:string)=>BUSINESS_MESSAGES_SOURCE_MESSAGES[locale]?.[s]||DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  const active={...f.records.bookings[0],id:f.ids.booking,guest_name:'Client One',appointment_datetime:'2030-03-10T15:00:00Z',salon:f.business,style:{name:'Save'},customer_id:'test-customer',duration_hours:2};
  const closed={...active,id:'22000000-0000-4000-8000-000000000099',guest_name:'Client Closed',status:'Cancelled'};
  const messages:Record<string,unknown>[]=[{id:'m-original',booking_id:active.id,sender_role:'customer',original_body:'Original Save $180 GCABC12',body:'Original Save $180 GCABC12',created_at:'2026-09-18T12:00:00Z'},{id:'m-closed',booking_id:closed.id,sender_role:'customer',original_body:'Retained cancelled conversation',body:'Retained cancelled conversation',created_at:'2026-09-18T12:00:00Z'}];
  const requests:Record<string,unknown>[]=[];let fail=true;const reference='55555555-5555-4555-8555-555555555555';
  await page.route('**/api/messages**',route=>{
   const req=route.request(),id=new URL(req.url()).searchParams.get('booking_id');
   if(req.method()==='GET' && id)for(const message of messages)if(message.booking_id===id && message.sender_role!=='salon')message.read_by_salon_at=new Date().toISOString();
   if(req.method()==='GET')return route.fulfill({json:id?{role:'salon',booking:id===active.id?active:closed,messages:messages.filter(m=>m.booking_id===id)}:{role:'salon',threads:[active,closed].map(booking=>({booking,messages:messages.filter(m=>m.booking_id===booking.id).slice().reverse()}))}});
   const input=req.postDataJSON();if(input.action==='translate_display')return route.fulfill({json:{translation:{translated_body:messages.find(m=>m.id===input.message_id)?.original_body,original:true}}});
   requests.push(input);if(fail){fail=false;return route.fulfill({status:503,json:{code:'MESSAGE_UNAVAILABLE',request_id:reference}});}
   expect(input.booking_id).toBe(active.id);const message={id:input.client_request_id,booking_id:input.booking_id,sender_role:'salon',body:input.body,original_body:input.body,created_at:new Date().toISOString()};messages.push(message);return route.fulfill({json:{message}});
  });
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/messages');
  const region=page.getByRole('region',{name:t('Messages workspace'),exact:true});await expect(region).toBeVisible();if(width<1024)expect(messages[0].read_by_salon_at).toBeUndefined();await page.screenshot({path:info.outputPath('messages-inbox.png')});
  await region.getByLabel(t('Search conversations'),{exact:true}).fill('Client One');await expect(page).toHaveURL(/messageSearch=Client\+One/);
  await region.getByRole('button',{name:/Client One.*Save/}).click();await expect(page).toHaveURL(/conversation=/);
  const composer=region.locator('#booking-message');await expect(composer).toBeEnabled();const original='  Original unchanged Save $180 GCABC12  ';
  await composer.fill(original);await page.goBack();await expect(page).not.toHaveURL(/conversation=/);await expect(region.getByRole('button',{name:t('Unread')+' (1)',exact:true})).toBeVisible();
  await region.getByRole('button',{name:/Client One.*Save/}).click();await expect(page).toHaveURL(/conversation=/);await expect(composer).toHaveValue(original);
  await region.getByRole('button',{name:t('Send message'),exact:true}).click();await expect(region.getByRole('alert')).toContainText(reference);await expect(composer).toHaveValue(original);
  if(locale==='en'){await region.getByRole('alert').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('messages-failed-send-reference-viewport.png')});await composer.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('messages-failed-send-draft-viewport.png')});}
  await region.getByRole('button',{name:t('Send message'),exact:true}).click();await expect(composer).toHaveValue('');expect(requests).toHaveLength(2);expect(requests[0].client_request_id).toBe(requests[1].client_request_id);expect(requests[1].body).toBe(original);
  await page.reload();await expect(region.locator('article').filter({hasText:original.trim()})).toBeVisible();await expect(page).toHaveURL(/messageSearch=Client\+One/);
  if(width<1024)await region.getByRole('button',{name:t('Back to conversations'),exact:true}).click();
  await region.getByLabel(t('Search conversations'),{exact:true}).fill('');await region.getByRole('button',{name:t('Closed conversations'),exact:true}).click();
  await region.getByRole('button',{name:/Client Closed.*Save/}).click();await expect(region.getByText('Retained cancelled conversation',{exact:true}).last()).toBeVisible();await expect(composer).toHaveCount(0);await expect(region.getByText(t('This conversation is closed. Its history is still available.'),{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('messages-closed.png')});expect(f.unexpected).toEqual([]);
 });
}

test('Business messages low-height workspace keeps a conversation visible',async({page},info)=>{
 const f=await p0OwnerFixture(page,{populated:true,locale:'zh-CN'}),t=(s:string)=>BUSINESS_MESSAGES_SOURCE_MESSAGES['zh-CN']?.[s]||DASHBOARD_SOURCE_MESSAGES['zh-CN']?.[s]||s;
 const booking={...f.records.bookings[0],id:f.ids.booking,guest_name:'Landscape client',appointment_datetime:'2030-03-10T15:00:00Z',salon:f.business,style:{name:'Silk Press'},customer_id:'own-fixture-customer',duration_hours:2};
 await page.route('**/api/messages**',route=>{expect(route.request().method()).toBe('GET');return route.fulfill({json:{role:'salon',threads:[{booking,messages:[{id:'own-message',booking_id:booking.id,sender_role:'customer',original_body:'Retained client message',body:'Retained client message',created_at:'2026-09-18T12:00:00Z'}]}]}});});
 await page.setViewportSize({width:844,height:390});await page.goto('/salon/dashboard/messages');const region=page.getByRole('region',{name:t('Messages workspace'),exact:true}),thread=region.getByRole('button',{name:/Landscape client.*Silk Press/});await expect(thread).toBeVisible();await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>window.scrollTo(0,0));const geometry=await thread.evaluate(el=>{const r=el.getBoundingClientRect(),header=document.querySelector('.gc-owner-header')!.getBoundingClientRect(),nav=document.querySelector('[data-owner-mobile-navigation]')!.getBoundingClientRect();return{top:r.top,bottom:r.bottom,visible:Math.min(r.bottom,nav.top)-Math.max(r.top,header.bottom),scrollY:window.scrollY};});
 await info.attach('conversation-geometry',{body:JSON.stringify(geometry),contentType:'application/json'});await page.screenshot({path:info.outputPath('messages-low-height-initial.png')});
 expect(geometry.scrollY).toBe(0);expect(geometry.visible,JSON.stringify(geometry)).toBeGreaterThanOrEqual(48);
 for(const control of [region.getByRole('button',{name:t('All'),exact:true}),region.getByRole('button',{name:t('Unread')+' (1)',exact:true}),region.getByRole('button',{name:t('Active conversations'),exact:true}),region.getByRole('button',{name:t('Closed conversations'),exact:true}),region.getByLabel(t('Search conversations'),{exact:true})])expect(await control.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
 await region.getByLabel(t('Search conversations'),{exact:true}).fill('Landscape');await expect(page).toHaveURL(/messageSearch=Landscape/);await expect(thread).toContainText('Retained client message');
 await region.getByRole('button',{name:t('Closed conversations'),exact:true}).click();await expect(thread).toHaveCount(0);await region.getByRole('button',{name:t('Active conversations'),exact:true}).click();await expect(thread).toBeVisible();await expect(region.getByLabel(t('Search conversations'),{exact:true})).toHaveValue('Landscape');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
});
