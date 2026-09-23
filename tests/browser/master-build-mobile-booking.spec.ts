import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
test.use({serviceWorkers:'block'});
for(const [width,height]of [[390,844],[768,1024],[1440,1000],[844,390]])test(`Master mobile booking reviews destination and protects fee at ${width}px`,async({page,request},info)=>{
 const provider=process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL||'http://127.0.0.1:3105';expect(['localhost','127.0.0.1']).toContain(new URL(provider).hostname);
 const id=randomUUID(),quoteId=randomUUID(),slug=`p0-policy-${id}`;let checks=0,reservations=0;
 const seed=(version:number|null)=>request.post(`${provider}/__fixtures/p0-public-policy/${id}`,{headers:{'x-acceptance-fixture':'p0-public-policy'},data:{version,priced:true,mobile:true}});
 expect((await seed(1)).ok()).toBe(true);
 try{
  await page.setViewportSize({width,height});
  await page.route('**/api/booking-availability?**',r=>r.fulfill({json:{slots:[{value:'13:00',label:'1:00 PM',stylistId:null}],timeZone:'America/New_York'}}));
  await page.route('**/api/booking/travel-quote',r=>{
   const body=r.request().postDataJSON();checks++;expect(body.salon_id).toBe(id);expect(body.guest_email).toBe('fixture@example.test');expect(body.address.address_street).toBe('100 Sample Avenue');
   return checks===1?r.fulfill({status:409,json:{code:'TRAVEL_OUTSIDE_RADIUS',request_id:'TRAVEL-FIXTURE'}}):r.fulfill({json:{quote:{id:quoteId,address:body.address,fee_cents:1500,expires_at:new Date(Date.now()+900000).toISOString()}}});
  });
  await page.route('**/api/stripe/booking-checkout',r=>{
   const body=r.request().postDataJSON();reservations++;expect(body.expected_total).toBe(115);expect(body.expected_deposit).toBe(10);expect(body.travel_quote_id).toBe(quoteId);expect(body.service_visit_mode).toBe('mobile');
   return r.fulfill({json:{booking:{id,public_reference:'GC-TRAVEL',status:'Confirmed',estimated_total:115,deposit_amount:10,balance_due:105}}});
  });
  await page.goto(`/salon/${slug}/book`);
  if(width<1280)for(let step=0;step<3;step++)await page.getByRole('button',{name:'Continue',exact:true}).filter({visible:true}).click();
  const shown=(placeholder:string)=>page.getByPlaceholder(placeholder,{exact:true}).filter({visible:true});
  await shown('Full Name').fill('Fixture customer');await shown('name@example.com').fill('fixture@example.test');await shown('+1 (555) 123-4567').fill('3055550123');
  for(const [name,value]of [['Street address','100 Sample Avenue'],['City','New York'],['State','NY'],['ZIP code','10001']])await page.getByLabel(name,{exact:true}).filter({visible:true}).fill(value);
  const check=page.getByRole('button',{name:'Check address and travel fee',exact:true}).filter({visible:true});await check.click();
  await expect(page.getByRole('region',{name:'Appointment location',exact:true}).filter({visible:true}).getByRole('alert')).toContainText('outside the business’s travel radius');expect(reservations).toBe(0);
  await expect(page.getByLabel('Street address',{exact:true}).filter({visible:true})).toHaveValue('100 Sample Avenue');await check.click();
  await expect(page.getByRole('status').filter({hasText:'Address checked.'}).filter({visible:true})).toContainText('$15.00');
  const consent=page.getByRole('checkbox',{name:/I understand the reservation deposit/}).filter({visible:true});await consent.check();
  await page.getByLabel('Apartment or suite (optional)',{exact:true}).filter({visible:true}).fill('2');await expect(consent).not.toBeChecked();await check.click();
  await expect(page.getByRole('status').filter({hasText:'Address checked.'}).filter({visible:true})).toBeVisible();
  const agreements=page.getByRole('checkbox').filter({visible:true});await expect(agreements).toHaveCount(2);await agreements.nth(0).check();await consent.check();
  await page.screenshot({path:info.outputPath('mobile-destination-review.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(width<1280)await page.getByRole('button',{name:'Continue',exact:true}).filter({visible:true}).click();
  await page.getByRole('button',{name:'Pay $10.00 Deposit',exact:true}).filter({visible:true}).click();await expect(page.getByRole('heading',{name:'You’re All Set!',exact:true}).filter({visible:true})).toBeVisible();
  expect(checks).toBe(3);expect(reservations).toBe(1);
 }finally{expect((await seed(null)).ok()).toBe(true);}
});
