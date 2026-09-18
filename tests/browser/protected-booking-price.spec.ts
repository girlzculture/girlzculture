import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
test.use({serviceWorkers:'block'});
for(const width of [390,1440])test(`Published offer preserves deposit and requires changed-price review at ${width}px`,async({page,request},info)=>{
 const provider=process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL||'http://127.0.0.1:3105';expect(['localhost','127.0.0.1']).toContain(new URL(provider).hostname);
 const id=randomUUID(),slug=`p0-policy-${id}`,offer=randomUUID();
 const seed=(version:number|null)=>request.post(`${provider}/__fixtures/p0-public-policy/${id}`,{headers:{'x-acceptance-fixture':'p0-public-policy'},data:{version,priced:true}});
 expect((await seed(1)).ok()).toBe(true);let attempts=0;
 try{
  await page.setViewportSize({width,height:width===390?844:1000});
  await page.route('**/api/booking-availability?**',route=>route.fulfill({json:{slots:[{value:'13:00',label:'1:00 PM',stylistId:null}],timeZone:'America/New_York'}}));
  await page.route('**/api/promotions/salon?**',route=>route.fulfill({json:{promotion:{id:offer,salon_id:id,title:'Fixture 20 percent',target_scope:'salon',promotion_type:'percentage',discount_value:20,status:'Active',is_active:true}}}));
  await page.route('**/api/stripe/booking-checkout',async route=>{
   const body=route.request().postDataJSON();attempts++;
   expect(body.salon_id).toBe(id);expect(body.salon_promotion_id).toBe(offer);expect(body.expected_total).toBe(80);expect(body.expected_deposit).toBe(attempts===1?10:40);
   const terms={subtotal:100,deposit:40,rate:40,version:id,basis:'eligible_service_subtotal_before_discounts',repeat_incident_applied:false};
   if(attempts===1){await route.fulfill({status:409,json:{code:'BOOKING_PRICE_CHANGED',error:'Review the current booking price and deposit before continuing.',deposit_terms:terms,total:80,discount:0,salon_promotion_discount:20}});return;}
   await route.fulfill({json:{booking:{id,public_reference:'GC-PRICE',status:'Confirmed',estimated_total:80,deposit_amount:40,balance_due:40,deposit_rule_snapshot:terms}}});
  });
  await page.goto(`/salon/${slug}/book?promotion=${offer}`);await expect(page.locator('b').filter({hasText:'Fixture 20 percent'})).toBeVisible();
  if(width<1280)for(let step=0;step<3;step++)await page.getByRole('button',{name:'Continue',exact:true}).filter({visible:true}).click();
  await page.getByPlaceholder('Full Name',{exact:true}).filter({visible:true}).fill('Fixture customer');await page.getByPlaceholder('name@example.com',{exact:true}).filter({visible:true}).fill('fixture@example.test');await page.getByPlaceholder('+1 (555) 123-4567',{exact:true}).filter({visible:true}).fill('3055550123');
  const agreements=page.getByRole('checkbox').filter({visible:true});await expect(agreements).toHaveCount(2);await agreements.nth(0).check();await agreements.nth(1).check();
  if(width<1280)await page.getByRole('button',{name:'Continue',exact:true}).filter({visible:true}).click();
  await page.getByRole('button',{name:'Pay $10.00 Deposit',exact:true}).filter({visible:true}).click();await expect(page.getByText('Review the current booking price and deposit before continuing.',{exact:true})).toBeVisible();
  await expect(page.getByPlaceholder('Full Name',{exact:true}).filter({visible:true})).toHaveValue('Fixture customer');
  const platform=page.getByRole('checkbox',{name:/I understand the reservation deposit/}).filter({visible:true});await expect(platform).not.toBeChecked();expect(attempts).toBe(1);await platform.check();
  if(width<1280)await page.getByRole('button',{name:'Continue',exact:true}).filter({visible:true}).click();
  await page.getByRole('button',{name:'Pay $40.00 Deposit',exact:true}).filter({visible:true}).click();await expect(page.getByRole('heading',{name:'You’re All Set!',exact:true}).filter({visible:true})).toBeVisible();
  const evidence=page.getByRole('region',{name:'Agreed booking price'}).filter({visible:true});for(const [label,amount] of [['Original price','$100.00'],['Offer savings','$20.00'],['Required deposit','$40.00'],['Agreed balance after deposit','$40.00']])await expect(evidence.locator('div').filter({has:page.getByText(label,{exact:true})})).toContainText(amount);
  expect(attempts).toBe(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await evidence.screenshot({path:info.outputPath('protected-booking-price.png')});
 }finally{expect((await seed(null)).ok()).toBe(true);}
});
