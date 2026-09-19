import { expect, test } from "@playwright/test";
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
import {intlLocale} from '../../src/i18n/catalog';

// Owner-fixture routes must remain authoritative after production-page reloads.
test.use({serviceWorkers:'block'});

for (const viewport of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1440,height:1000}]) {
  test(`subscription reporting does not infer old charges from the new catalog at ${viewport.width}x${viewport.height}`,async({page},testInfo)=>{
    await page.setViewportSize(viewport);
    await page.goto("/internal/acceptance/admin-workflows/subscriptions");
    const recorded=page.locator("article").filter({has:page.getByText("Recorded monthly base value",{exact:true})});
    await expect(recorded).toContainText("$0.00");
    await expect(recorded).toContainText("1 unknown amounts excluded");
    await expect(recorded).toContainText("not collected revenue");
    const collected=page.locator("article").filter({has:page.getByText("Actually collected",{exact:true})});
    await expect(collected).toContainText("$129.50");
    await expect(page.getByRole("heading",{name:"Subscription records"})).toBeVisible();
    await expect(page.locator("main")).not.toContainText("$109.00");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath("recorded-subscription-amount.png"),fullPage:true});
  });
}
for (const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const) {
 test(`subscription reporting keeps complete billing evidence readable at ${width}x${height}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});
  const t=(s:string)=>(DASHBOARD_SOURCE_MESSAGES as Record<string,Record<string,string>>)[locale]?.[s]||s;
  const reference='in_fixture_original_reference_123456789012345678901234567890';
  f.records.billing_events=[{id:'55000000-0000-4000-8000-000000000022',salon_id:f.business.id,event_date:'2026-09-18T15:00:00Z',event_type:'invoice.payment_failed',previous_plan:'Growth',new_plan:'Premium',amount_collected:12950,amount_refunded:2100,amount_credited:750,payment_status:'Failed',failure_reason:'Original payment explanation',stripe_invoice_id:reference}];
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/subscription');
  const history=page.getByRole('region',{name:t('Stripe billing history'),exact:true});
  await expect(history).toBeVisible();await history.scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('subscription-history.png')});
  const geometry=await history.evaluate(el=>{const outer=el.getBoundingClientRect();return {width:el.clientWidth,scroll:el.scrollWidth,outerLeft:outer.left,outerRight:outer.right,viewport:innerWidth};});
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width+1);
  expect(geometry.outerLeft).toBeGreaterThanOrEqual(0);expect(geometry.outerRight).toBeLessThanOrEqual(width);
  const visibleRecord=width<1024?history.getByRole('article'):history.getByRole('row').filter({hasText:reference});
  await expect(visibleRecord).toHaveCount(1);
  for(const text of ['invoice.payment_failed','Growth → Premium','Original payment explanation',reference])await expect(visibleRecord).toContainText(text);
  for(const amount of [129.5,21,7.5])await expect(visibleRecord).toContainText(new Intl.NumberFormat(intlLocale(locale),{style:'currency',currency:'USD'}).format(amount));
  await expect(visibleRecord).toContainText(t('Failed'));
  f.records.billing_events=[];await page.reload();
  const empty=history.getByText(t('No signed Stripe billing events have been received for this salon yet.'),{exact:true});
  await expect(empty).toBeVisible();
  expect(await history.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
}
test('subscription reporting does not reveal billing records to staff without subscription access',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true});
 f.records.billing_events=[{id:'55000000-0000-4000-8000-000000000023',event_type:'PRIVATE BILLING FIXTURE',stripe_invoice_id:'in_private_fixture'}];
 await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{products:true,subscription:false},records:f.records}}));
 await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/subscription');
 await expect(page.getByText('Access not assigned',{exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Stripe billing history',exact:true})).toHaveCount(0);
 await expect(page.getByText('PRIVATE BILLING FIXTURE',{exact:true})).toHaveCount(0);
 expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
});
