import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { SUBSCRIPTION_PAYMENT_SOURCE_MESSAGES as messages } from '../../src/i18n/subscription-payment-source-catalog';

test.use({ serviceWorkers: 'block' });
const saved = (last4 = '4242') => ({ status: 'available', updateAllowed: true, updatePending: false, billingMode: 'test', paymentMethod: { type: 'card', brand: 'visa', last4, expMonth: 10, expYear: 2030 } });
for (const [locale, width, height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const) {
  test(`Subscription payment method verifies return and refresh in ${locale}`, async ({page},info) => {
    const f = await p0OwnerFixture(page,{populated:true,locale});
    Object.assign(f.records.subscriptions[0],{stripe_customer_id:'cus_fixture',stripe_subscription_id:'sub_fixture'});
    await page.setViewportSize({width,height});
    let current = saved(), completions = 0;
    await page.route('**/api/stripe/portal',async route => {
      expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({action:'complete',session_id:'cs_test_fixture'});
        completions++; current = saved('1881'); return route.fulfill({json:{updated:true,...current}});
      }
      return route.fulfill({json:current});
    });
    await page.goto('/salon/dashboard/subscription?payment_method_session=cs_test_fixture');
    const t = (value:string) => messages[locale]?.[value] || value;
    const panel = page.getByRole('region',{name:t('Subscription payment method'),exact:true});
    await expect(panel).toContainText('1881');
    await expect(panel).toContainText(t('Your subscription payment method was saved and verified.'));
    expect(completions).toBe(1); await expect(page).not.toHaveURL(/payment_method_session/);
    await page.reload(); await expect(panel).toContainText('1881'); expect(completions).toBe(1);
    await expect(panel).not.toContainText('4242');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await panel.screenshot({path:info.outputPath(`payment-method-${locale}.png`)});
  });
}
for (const catalogTiming of ['during verification', 'after verification'] as const) {
  test(`Subscription payment method preserves one return when the catalog arrives ${catalogTiming}`, async ({ page }) => {
    const f = await p0OwnerFixture(page, { populated: true });
    Object.assign(f.records.subscriptions[0], { stripe_customer_id: 'cus_fixture', stripe_subscription_id: 'sub_fixture' });
    let releaseCatalog!: () => void, releaseCompletion!: () => void;
    const catalogGate = new Promise<void>(resolve => { releaseCatalog = resolve; });
    const completionGate = new Promise<void>(resolve => { releaseCompletion = resolve; });
    let completions = 0;
    let current = saved();
    const publishedHeading = 'Published subscription payment settings';
    const success = 'Your subscription payment method was saved and verified.';
    const publishedSuccess = 'Your subscription payment method is verified and saved.';
    await page.route('**/api/i18n?*', async route => {
      await catalogGate;
      return route.fulfill({ json: {
        locale: new URL(route.request().url()).searchParams.get('locale'),
        messages: {}, sourceMessages: { 'Subscription payment method': publishedHeading, [success]: publishedSuccess },
      } });
    });
    await page.route('**/api/stripe/portal', async route => {
      if (route.request().method() === 'POST') {
        expect(route.request().postDataJSON()).toEqual({ action: 'complete', session_id: 'cs_test_fixture' });
        completions++;
        await completionGate;
        current = saved('1881');
        return route.fulfill({ json: { updated: true } });
      }
      return route.fulfill({ json: current });
    });
    try {
      await page.goto('/salon/dashboard/subscription?payment_method_session=cs_test_fixture');
      await expect.poll(() => completions).toBe(1);
      const originalPanel = page.getByRole('region', { name: 'Subscription payment method', exact: true });
      const publishedPanel = page.getByRole('region', { name: publishedHeading, exact: true });
      if (catalogTiming === 'during verification') {
        releaseCatalog();
        await expect(publishedPanel).toBeVisible();
        await expect(publishedPanel.getByRole('button', { name: 'Refresh payment status' })).toBeDisabled();
        expect(completions).toBe(1);
        await expect(publishedPanel).not.toContainText(success);
        await expect(publishedPanel).not.toContainText(publishedSuccess);
        releaseCompletion();
      } else {
        releaseCompletion();
        await expect(originalPanel).toContainText(success);
        await expect(originalPanel).toContainText('1881');
        releaseCatalog();
      }
      await expect(publishedPanel).toContainText(publishedSuccess);
      await expect(publishedPanel).toContainText('1881');
      await expect(publishedPanel.getByRole('button', { name: 'Refresh payment status' })).toBeEnabled();
      await expect(page).not.toHaveURL(/payment_method_session/);
      expect(completions).toBe(1);
    } finally {
      releaseCatalog();
      releaseCompletion();
    }
  });
}

test('Subscription payment method cancellation preserves default and removes only verified return state',async({page})=>{
  const f=await p0OwnerFixture(page,{populated:true});Object.assign(f.records.subscriptions[0],{stripe_customer_id:'cus_fixture'});
  const calls:unknown[]=[];
  await page.route('**/api/stripe/portal',route=>{
    if(route.request().method()==='POST'){calls.push(route.request().postDataJSON());return route.fulfill({json:{cancelled:true,updated:false}});}
    return route.fulfill({json:saved()});
  });
  await page.goto('/salon/dashboard/subscription?payment_method_cancel=11000000-0000-4000-8000-000000000003');
  const panel=page.getByRole('region',{name:'Subscription payment method',exact:true});
  await expect(panel).toContainText('Your existing method is unchanged.');await expect(panel).toContainText('4242');
  expect(calls).toEqual([{action:'cancel',attempt_id:'11000000-0000-4000-8000-000000000003'}]);
  await page.reload();await expect(panel).toContainText('4242');expect(calls).toHaveLength(1);
});
test('Subscription payment method pending and failure never masquerade as success and can recover',async({page})=>{
  const f=await p0OwnerFixture(page,{populated:true});Object.assign(f.records.subscriptions[0],{stripe_customer_id:'cus_fixture'});
  let mode='pending',count=0;
  const ref='11000000-0000-4000-8000-000000000009';
  await page.route('**/api/stripe/portal',route=>{
    if(route.request().method()==='POST'){
      count++;
      if(mode==='failure')return route.fulfill({status:502,json:{error:'Unable to verify billing payment settings.',request_id:ref}});
      return route.fulfill({json:mode==='pending'?{updated:false,pending:true}:{updated:true}});
    }
    return route.fulfill({json:saved(mode==='success'?'1881':'4242')});
  });
  await page.goto('/salon/dashboard/subscription?payment_method_session=cs_test_fixture');
  const panel=page.getByRole('region',{name:'Subscription payment method',exact:true});
  await expect(panel).toContainText('still being verified');await expect(panel).not.toContainText('saved and verified');expect(count).toBe(1);
  mode='failure';await panel.getByRole('button',{name:'Refresh payment status'}).click();await expect(panel.getByRole('alert')).toContainText(ref);
  await expect(panel).not.toContainText('4242');await expect(page).toHaveURL(/payment_method_session/);
  mode='success';await panel.getByRole('button',{name:'Refresh payment status'}).click();await expect(panel).toContainText('saved and verified');await expect(panel).toContainText('1881');expect(count).toBe(3);
});
test('Subscription payment method blocks scheduled-plan edits and never opens untrusted URLs',async({page})=>{
  const f=await p0OwnerFixture(page,{populated:true});Object.assign(f.records.subscriptions[0],{stripe_customer_id:'cus_fixture'});
  let scheduled=true,posts=0;
  await page.route('**/api/stripe/portal',route=>{
    if(route.request().method()==='POST'){posts++;return route.fulfill({json:{url:'https://untrusted.invalid/payment'}});}
    return route.fulfill({json:{...saved(),updateAllowed:!scheduled,warning:scheduled?'A scheduled plan change requires billing support review before updating this payment method.':undefined}});
  });
  await page.goto('/salon/dashboard/subscription');const panel=page.getByRole('region',{name:'Subscription payment method',exact:true});
  await expect(panel).toContainText('scheduled plan change');await expect(panel.getByRole('button',{name:'Manage payment method'})).toBeDisabled();expect(posts).toBe(0);
  scheduled=false;await panel.getByRole('button',{name:'Refresh payment status'}).click();await expect(panel.getByRole('button',{name:'Manage payment method'})).toBeEnabled();
  await panel.getByRole('button',{name:'Manage payment method'}).click();await expect(panel.getByRole('alert')).toContainText('invalid payment settings link');await expect(page).toHaveURL(/\/salon\/dashboard\/subscription$/);expect(posts).toBe(1);
});

for (const [parameter,outcome] of [['payment_method_session','expired'],['payment_method_cancel','expired'],['payment_method_session','cancelled']] as const) {
  test(`Subscription payment method clears terminal ${outcome} return from ${parameter}`,async({page})=>{
    const f=await p0OwnerFixture(page,{populated:true});Object.assign(f.records.subscriptions[0],{stripe_customer_id:'cus_fixture'});
    let posts=0;
    await page.route('**/api/stripe/portal',route=>{
      if(route.request().method()==='POST'){posts++;return route.fulfill({json:{updated:false,cancelled:outcome==='cancelled',expired:outcome==='expired',...saved()}});}
      return route.fulfill({json:saved()});
    });
    await page.goto(`/salon/dashboard/subscription?${parameter}=${parameter==='payment_method_session'?'cs_test_fixture':'11000000-0000-4000-8000-000000000003'}`);
    const panel=page.getByRole('region',{name:'Subscription payment method',exact:true});
    await expect(panel).toContainText(outcome==='expired'?'Payment method update expired.':'Payment method update cancelled.');
    await expect(panel).toContainText('4242');await expect(panel).not.toContainText('still being verified');
    await expect(page).not.toHaveURL(/payment_method_(session|cancel)/);
    await expect(panel.getByRole('button',{name:'Manage payment method'})).toBeEnabled();
    await page.reload();await expect(panel).toContainText('4242');expect(posts).toBe(1);
  });
}
