import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {buildAuthStorageKeys} from '../../src/lib/authSessionCore';
import {APPOINTMENT_WAITLIST_SOURCE_MESSAGES as messages} from '../../src/i18n/appointment-waitlist-source-catalog';
test.use({serviceWorkers:'block'});
for(const [width,height]of [[390,844],[844,390],[768,1024],[1440,1000]])test(`Appointment waitlist join, refresh, review and leave at ${width}x${height}`,async({page,request},info)=>{
 const fixture=await p0OwnerFixture(page,{role:'customer',seedSession:false});
 await page.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:buildAuthStorageKeys(fixture.provider).customer,session:fixture.session});
 const id=randomUUID(),slug=`p0-policy-${id}`,offer=randomUUID();
 const provider=process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL||'http://127.0.0.1:3105';
 expect(['localhost','127.0.0.1']).toContain(new URL(provider).hostname);
 const seeded=await request.post(`${provider}/__fixtures/p0-public-policy/${id}`,{headers:{'x-acceptance-fixture':'p0-public-policy'},data:{version:1,priced:true}});expect(seeded.ok()).toBe(true);
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);let joined:Record<string,unknown>|null=null;let left=false;let tries=0;
 const entry=()=>({id:joined!.id,style_id:joined!.style_id,stylist_id:null,starts_after:`${date}T13:00:00Z`,starts_before:`${date}T21:00:00Z`,status:left?'cancelled':'waiting',business_name:'Waitlist Fixture',service_name:'Silk Press',slug,time_zone:'America/New_York',offers:left?[]:[{id:offer,appointment_at:`${date}T14:00:00Z`,expires_at:new Date(Date.now()+3600000).toISOString(),stylist_id:null,status:'offered',booking_id:null}]});
 await page.route('**/api/customer/waitlist',async route=>{
  expect(route.request().headers().authorization).toBe(`Bearer ${fixture.session.access_token}`);
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();
   expect(body).not.toHaveProperty('customer_id');
   if(body.action==='join'){tries++;if(tries===1)return route.fulfill({status:503,json:{code:'WAITLIST_UNAVAILABLE',request_id:'55000000-0000-4000-8000-000000000001'}});joined=body;}
   else {expect(body).toEqual({action:'leave',id:joined!.id});left=true;}
  }
  await route.fulfill({json:{requests:joined?[entry()]:[]}});
 });
 await page.setViewportSize({width,height});await page.goto(`/salon/${slug}/book?date=${date}`);
 if(width<1280)for(let step=0;step<2;step++)await page.getByRole('button',{name:'Continue',exact:true}).filter({visible:true}).click();
 const join=page.getByRole('button',{name:'Join waitlist',exact:true}).filter({visible:true});await expect(join).toBeVisible();await join.click();
 await expect(page.locator('section').filter({has:page.getByRole('heading',{name:'Join the appointment waitlist'})}).filter({visible:true}).getByRole('alert')).toContainText('55000000-0000-4000-8000-000000000001');await join.click();
 await expect(page.getByRole('link',{name:'Request saved. Manage your waitlist'}).filter({visible:true})).toBeVisible();expect(tries).toBe(2);
 await page.getByRole('link',{name:'Request saved. Manage your waitlist'}).filter({visible:true}).click();
 await expect(page.getByText('Waitlist Fixture',{exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('link',{name:'Review opening'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('waitlist-customer.png'),fullPage:true});
 await page.getByRole('link',{name:'Review opening'}).click();await expect(page).toHaveURL(new RegExp(`waitlist_offer=${offer}`));
 if(width<1280)for(let step=0;step<2;step++)await page.getByRole('button',{name:'Continue',exact:true}).filter({visible:true}).click();
 await expect(page.locator('input[type="date"]').filter({visible:true})).toHaveValue(date);
 if(width===1440){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const current=new URL(page.url());current.searchParams.set('date',today);await page.goto(current.toString());
  const input=page.locator('input[type="date"]').filter({visible:true});await expect(input).toHaveValue(today);
  expect(await input.evaluate((node:HTMLInputElement)=>node.validity.rangeUnderflow)).toBe(false);
 }

 await page.goto('/account/waitlist');await page.getByRole('button',{name:'Leave waitlist'}).click();await expect(page.getByText('Cancelled',{exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('link',{name:'Review opening'})).toHaveCount(0);
 await request.post(`${provider}/__fixtures/p0-public-policy/${id}`,{headers:{'x-acceptance-fixture':'p0-public-policy'},data:{version:null}});
});
for(const [locale,width,height]of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const)test(`Appointment waitlist business queue in ${locale}`,async({page},info)=>{
 await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
 await page.route('**/api/salon/waitlist',route=>route.fulfill({json:{requests:[{id:randomUUID(),style_id:randomUUID(),stylist_id:null,starts_after:'2030-01-04T14:00:00Z',starts_before:'2030-01-04T20:00:00Z',status:'waiting',service_name:'Boho Braids',customer_name:'Own Client',open_offers:1}]}}));
 await page.goto('/salon/dashboard/bookings?view=waitlist');
 await expect(page.getByRole('heading',{name:messages[locale]?.['Appointment waitlist']||'Appointment waitlist'})).toBeVisible();await expect(page.getByText('Own Client',{exact:true})).toBeVisible();await expect(page.getByText('Boho Braids',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:messages[locale]?.['Leave waitlist']||'Leave waitlist'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('waitlist-business.png'),fullPage:true});
});
