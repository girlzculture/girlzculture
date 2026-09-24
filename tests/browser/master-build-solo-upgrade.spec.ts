import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';

test.use({serviceWorkers:'block'});
for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:900},{width:844,height:390}]){
 test(`Master Solo Pro to Starter review preserves access and grants team on verified readback at ${viewport.width}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true});await page.setViewportSize(viewport);
  Object.assign(f.business,{subscription_tier:'Solo Pro',operator_type:'solo'});f.records.subscriptions=[{status:'active',tier:'Solo Pro'}];
  const calls:Record<string,unknown>[]=[];
  await page.route('**/api/stripe/subscription/change',async route=>{
   const body=route.request().postDataJSON();calls.push(body);expect(body.plan).toBe('Starter');
   if(!body.confirm)return route.fulfill({json:{requiresConfirmation:true,currentPlan:'Solo Pro',requestedPlan:'Starter',message:'Fixture verified plan review',preview:{unusedPeriodCredit:4950,proratedCharge:4950,tax:0,amountDueNow:0,currency:'usd',renewalAmount:9900,renewalDate:'2026-10-23'}}});
   Object.assign(f.business,{subscription_tier:'Starter',operator_type:'team'});f.records.subscriptions=[{status:'active',tier:'Starter'}];
   return route.fulfill({json:{changed:true,plan:'Starter',status:'active',message:'Fixture confirmed Starter entitlement'}});
  });
  await page.goto('/salon/dashboard/subscription');
  await expect(page.getByRole('button',{name:'Upgrade to Starter',exact:true})).toBeVisible();
  expect(await page.getByRole('link',{name:'Stylists',exact:true}).count()).toBe(0);
  await page.getByRole('button',{name:'Upgrade to Starter',exact:true}).click();
  await expect(page.getByText('Fixture verified plan review',{exact:true})).toBeVisible();expect(calls).toEqual([{plan:'Starter'}]);
  expect(f.business.subscription_tier).toBe('Solo Pro');
  const confirm=page.getByRole('button',{name:/Confirm.*upgrade/i});await expect(confirm).toBeVisible();await confirm.click();
  const active=page.locator('section,article').filter({has:page.getByRole('heading',{name:'Starter',exact:true})});
  await expect(active.getByRole('button',{name:'Current active plan',exact:true})).toBeVisible();
  expect(calls).toEqual([{plan:'Starter'},{plan:'Starter',confirm:true}]);
  await page.reload();await expect(active.getByRole('button',{name:'Current active plan',exact:true})).toBeVisible();
  await page.goto('/salon/dashboard/stylists');await expect(page.getByText('Your independent plan has one calendar.',{exact:false})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Stylists',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('starter-team.png')});
  expect(f.unexpected).toEqual([]);
 });
}
