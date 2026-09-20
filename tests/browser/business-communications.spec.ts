import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {buildAuthStorageKeys} from '../../src/lib/authSessionCore';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});

for(const [locale,width,height]of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]]as const){
 test(`Business communications preserve consent, failed drafts and refresh in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{role:'customer',seedSession:false,locale});
  const t=(source:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[source]||source;
  const booking={id:f.ids.booking,customer_id:f.session.user.id,salon_id:f.business.id,appointment_datetime:'2030-09-24T15:00:00Z',duration_hours:2,status:'Confirmed',salon:{name:'Only This Business',time_zone:'America/New_York'},style:{name:'Braids $180'}};
  await page.setViewportSize({width,height});
  await page.addInitScript(({key,session})=>{localStorage.setItem(key,JSON.stringify(session));},{key:buildAuthStorageKeys(f.provider).customer,session:f.session});
  await page.route(`${f.provider}/rest/v1/**`,route=>{const table=new URL(route.request().url()).pathname.split('/').at(-1);if(table==='customers')return route.fulfill({json:[{id:f.session.user.id,name:'Test Customer',email:f.session.user.email}]});if(table==='bookings')return route.fulfill({json:[booking]});if(table==='product_orders')return route.fulfill({json:[]});return route.fallback();});
  await page.route('**/api/customer/favorites',route=>route.fulfill({json:{salons:[]}}));
  await page.route('**/api/support',route=>route.fulfill({json:{categories:[]}}));
  await page.route('**/api/messages**',route=>route.fulfill({json:new URL(route.request().url()).searchParams.has('booking_id')?{booking,messages:[],role:'customer'}:{threads:[{booking,messages:[]}],role:'customer'}}));
  await page.route('**/api/customer/bookings/*/attendance',route=>route.fulfill({json:{incidents:[]}}));
  let preferences={email_enabled:true,sms_enabled:true,push_enabled:true,reminders:true,follow_up:false,marketing:false,locale,consent_version:1,revision:0,scope:'business'};
  const attempts:Record<string,unknown>[]=[];let fail=true;const reference='21000000-0000-4000-8000-000000000001';
  await page.route('**/api/customer/bookings/*/communications',route=>{if(route.request().method()==='GET')return route.fulfill({json:{preferences}});const body=route.request().postDataJSON();attempts.push(body);if(fail){fail=false;return route.fulfill({status:503,json:{code:'COMMUNICATION_UNAVAILABLE',request_id:reference}});}expect(body.expected_revision).toBe(preferences.revision);preferences={...body.choices,scope:'business',revision:preferences.revision+1};return route.fulfill({json:{preferences}});});
  await page.goto(`/account?tab=inbox&booking=${booking.id}`);
  await page.getByRole('button',{name:t('Communication preferences'),exact:true}).click();
  await expect(page.getByText(t('These choices apply to your appointments with this business only.'),{exact:true})).toBeVisible();
  const marketing=page.getByRole('checkbox',{name:t('Promotions and business news'),exact:true});const followup=page.getByRole('checkbox',{name:t('Thank-you and rebooking messages'),exact:true});
  await expect(marketing).not.toBeChecked();await expect(followup).not.toBeChecked();expect(attempts).toHaveLength(0);
  await marketing.check();await page.getByRole('checkbox',{name:t('Text message updates'),exact:true}).uncheck();
  const save=page.getByRole('button',{name:t('Save communication preferences'),exact:true});await save.click();
  await expect(page.getByRole('alert').filter({hasText:reference})).toBeVisible();await expect(marketing).toBeChecked();await expect(followup).not.toBeChecked();
  await save.click();await expect(page.getByText(t('Communication preferences saved.'),{exact:true})).toBeVisible();
  expect(attempts).toHaveLength(2);expect(attempts[1].request_id).toBe(attempts[0].request_id);expect(preferences.sms_enabled).toBe(false);
  await page.reload();await page.getByRole('button',{name:t('Communication preferences'),exact:true}).click();await expect(marketing).toBeChecked();await expect(followup).not.toBeChecked();await expect(page.getByRole('checkbox',{name:t('Text message updates'),exact:true})).not.toBeChecked();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await info.attach(`communications-${locale}-${width}`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  expect(f.unexpected).toEqual([]);
 });
}

test('Business communications opt-out requires an explicit click and clears its narrow capability afterward',async({page})=>{
 await p0OwnerFixture(page,{seedSession:false});let writes=0;
 await page.route('**/api/communications/unsubscribe',route=>{writes++;expect(route.request().method()).toBe('POST');expect(route.request().postDataJSON()).toEqual({token:'synthetic-opt-out-only'});return route.fulfill({json:{unsubscribed:true}});});
 await page.goto('/communications/unsubscribe#synthetic-opt-out-only');await expect(page.getByRole('heading',{name:'Stop optional business messages'})).toBeVisible();expect(writes).toBe(0);
 await page.getByRole('button',{name:'Unsubscribe',exact:true}).click();await expect(page.getByText('You are unsubscribed from promotional and rebooking messages covered by this link. Your bookings are unchanged.',{exact:true})).toBeVisible();expect(writes).toBe(1);expect(new URL(page.url()).hash).toBe('');
});
