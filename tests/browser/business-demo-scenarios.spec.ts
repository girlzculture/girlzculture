import { expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test } from './helpers/hydration';
import { BUSINESS_DEMO_SCENARIOS, demoSummary } from '../../src/components/dashboard/demo/businessDemoScenarios';
import { BUSINESS_DEMO_COPY } from '../../src/i18n/business-demo-copy';
import { intlLocale } from '../../src/i18n/catalog';

test.use({ serviceWorkers: 'block' });

async function expectTouchTarget(control: Locator) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box, 'The visible control must have a rendered bounding box').not.toBeNull();
  expect(box?.height).toBeGreaterThanOrEqual(44);
}

async function isolate(page: Page, locale: string, baseURL: string) {
  const unexpected: string[] = [];
  await page.context().addCookies([{ name: 'gc_locale', value: locale, url: baseURL }, { name: 'gc_site_access', value: 'marketplace-demo', url: baseURL }]);
  await page.addInitScript(language => localStorage.setItem('girlz-culture-locale', language), locale);
  // Root providers read language and public location configuration on every page.
  // Allow only these exact GETs; no business/session fixture or API catch-all.
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/i18n' && route.request().method() === 'GET') return route.fulfill({ json: { locale: url.searchParams.get('locale'), messages: {}, sourceMessages: {} } });
    if (route.request().method() === 'GET' && url.pathname === '/api/config' && url.searchParams.get('keys') === 'search.default_radius_miles,search.location_retention_days') return route.fulfill({ json: { revision: 1, config: {} } });
    if (route.request().method() === 'GET' && url.pathname === '/api/location/resolve' && !url.search) return route.fulfill({ json: { location: null, available: false } });
    unexpected.push(`${route.request().method()} ${url.pathname}`);
    await route.abort('blockedbyclient');
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (/^\/(?:auth|rest)\/v1\//.test(url.pathname) || /(?:stripe|openai|supabase)\./.test(url.hostname)) {
      unexpected.push(`${route.request().method()} ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    return route.fallback();
  });
  return unexpected;
}

for (const [locale, width, height, index] of [['en', 390, 844, 0], ['fr', 768, 1024, 1], ['es', 1440, 1000, 2], ['zh-CN', 844, 390, 3]] as const) {
  test(`Business demo scenarios stay read-only and accessible in ${locale} at ${width}x${height}`, async ({ page, baseURL }, info) => {
    const unexpected = await isolate(page, locale, baseURL!);
    const copy = BUSINESS_DEMO_COPY[locale], scenario = BUSINESS_DEMO_SCENARIOS[index];
    await page.setViewportSize({ width, height });
    await page.goto(`/site-access/business-demo?scenario=${scenario.id}&view=overview`);
    await expect(page.getByRole('heading', { name: scenario.name, exact: true })).toBeVisible();
    await expect(page.getByRole('note')).toContainText(copy.readOnly);
    await expect(page.getByRole('note')).toContainText(copy.period);
    // Streamed Next markup can retain a hidden copy of the workspace. Interact
    // with the accessible main, not the hidden server segment's CSS matches.
    const explanation = page.getByRole('main').locator('details').filter({ has: page.locator('summary').filter({ hasText: copy.details }) }), explainControl = explanation.locator('summary');
    await explainControl.focus();await page.keyboard.press('Enter');await expect(explanation).toHaveAttribute('open','');
    for (const text of [copy.notice,copy.disclaimer,copy.names,copy.calendarNote])await expect(explanation).toContainText(text);
    await expectTouchTarget(explainControl);
    await page.keyboard.press('Space');await expect(explanation).not.toHaveAttribute('open','');
    const chooser = page.getByRole('combobox', { name: copy.choose, exact: true });
    await expect(chooser).toHaveValue(scenario.id);
    await expect(chooser.locator('option')).toHaveCount(4);
    const summary = page.getByRole('region', { name: copy.totals, exact: true });
    await expect(summary).toContainText(new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: 'USD' }).format(demoSummary(scenario).valueCents / 100));
    await expect(summary).toContainText(copy.valueNote);
    const nav = page.getByRole('navigation', { name: copy.pages, exact: true });
    await expect(nav.getByRole('button')).toHaveCount(4);
    for (const control of [chooser, ...await nav.getByRole('button').all()]) await expectTouchTarget(control);

    await nav.getByRole('button', { name: copy.services, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`scenario=${scenario.id}&view=services$`));
    const menu = page.getByRole('region', { name: copy.menu, exact: true });
    await expect(menu.getByRole('article')).toHaveCount(scenario.services.length);
    for (const service of scenario.services) await expect(menu.getByRole('heading', { name: service.name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`demo-services-${locale}.png`), fullPage: false });
    await nav.getByRole('button', { name: copy.team, exact: true }).click();
    const team = page.getByRole('region', { name: copy.sampleTeam, exact: true });
    await expect(team.getByRole('article')).toHaveCount(scenario.team.length);
    for (const professional of scenario.team) await expect(team.getByRole('heading', { name: professional.name, exact: true })).toBeVisible();

    await nav.getByRole('button', { name: copy.calendar, exact: true }).click();
    const calendar = page.getByRole('region', { name: copy.sampleCalendar, exact: true });
    await page.getByRole('combobox', { name: copy.professional, exact: true }).selectOption(scenario.team[0].id);
    const first = scenario.appointments.find(item => item.professionalId === scenario.team[0].id)!;
    await expect(calendar.getByText(first.client, { exact: true })).toBeVisible();
    for (const item of scenario.appointments.filter(item => item.professionalId !== scenario.team[0].id)) await expect(calendar.getByText(item.client, { exact: true })).toHaveCount(0);
    await calendar.locator('input[type="date"]').fill('2026-10-14');
    await expect(calendar.getByText(first.client, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: copy.resetDate, exact: true }).click();
    await expect(calendar.locator('input[type="date"]')).toHaveValue('2026-09-14');
    await expect(calendar.getByText(first.client, { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`demo-calendar-${locale}.png`), fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.gc-dashboard').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.reload();
    await expect(page.getByRole('heading', { name: scenario.name, exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: copy.calendar, exact: true })).toHaveAttribute('aria-pressed', 'true');
    if(width<1024){const more=page.getByRole('complementary').locator('summary').filter({hasText:copy.more});await more.focus();await page.keyboard.press('Enter');await expectTouchTarget(more);}
    await expect(page.getByRole('link', { name: copy.marketplace, exact: true })).toHaveAttribute('href', '/site-access');
    for (const link of await page.getByRole('link', { name: copy.account, exact: true }).all()) await expect(link).toHaveAttribute('href', '/salon/login');
    expect(unexpected).toEqual([]);
  });
}

test('Business demo scenarios keep browser history and invalid links inside the isolated examples', async ({ page, baseURL }) => {
  const unexpected = await isolate(page, 'en', baseURL!);
  const copy = BUSINESS_DEMO_COPY.en;
  await page.goto('/site-access/business-demo?scenario=braiding-team&view=services');
  const chooser = page.getByRole('combobox', { name: copy.choose, exact: true });
  await expect(page.getByRole('heading', { name: 'Braiding Collective', exact: true })).toBeVisible();
  await chooser.selectOption('occasion-hair');
  await expect(page.getByRole('heading', { name: 'Occasion Hair Team', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Knotless braids', exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(chooser).toHaveValue('braiding-team');
  await expect(page.getByRole('heading', { name: 'Knotless braids', exact: true })).toBeVisible();
  await page.goForward();
  await expect(chooser).toHaveValue('occasion-hair');
  await expect(page.getByRole('heading', { name: 'Bridal styling', exact: true })).toBeVisible();
  await page.goto('/site-access/business-demo?scenario=other-business&view=payments');
  await expect(chooser).toHaveValue('curl-studio');
  await expect(page.getByRole('region', { name: copy.totals, exact: true })).toBeVisible();
  await expect(page.locator('input[name="salon_id"], form')).toHaveCount(0);
  expect(unexpected).toEqual([]);
});

for(const [locale,width,height,index]of [['en',390,844,0],['zh-CN',844,390,3]]as const){
 test(`Business demo initial mobile content is visible in ${locale} at ${width}x${height}`,async({page,baseURL},info)=>{
  const unexpected=await isolate(page,locale,baseURL!),copy=BUSINESS_DEMO_COPY[locale],scenario=BUSINESS_DEMO_SCENARIOS[index];
  await page.setViewportSize({width,height});
  await page.goto(`/site-access/business-demo?scenario=${scenario.id}&view=services`);
  const menu=page.getByRole('region',{name:copy.menu,exact:true}),first=menu.getByRole('article').first();
  await expect(first.getByRole('heading',{name:scenario.services[0].name,exact:true})).toBeVisible();await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>window.scrollTo(0,0));
  const serviceGeometry=await first.evaluate(el=>{const name=el.querySelector('h4')!.getBoundingClientRect(),price=el.querySelectorAll('p')[1].getBoundingClientRect();return{nameTop:name.top,nameBottom:name.bottom,priceBottom:price.bottom,viewport:innerHeight,scrollY};});
  await info.attach('initial-service-geometry',{body:JSON.stringify(serviceGeometry),contentType:'application/json'});await page.screenshot({path:info.outputPath(`demo-initial-services-${locale}.png`)});
  expect(serviceGeometry.scrollY).toBe(0);expect(serviceGeometry.nameTop).toBeGreaterThanOrEqual(0);expect(serviceGeometry.nameBottom).toBeLessThanOrEqual(serviceGeometry.viewport);expect(serviceGeometry.priceBottom).toBeLessThanOrEqual(serviceGeometry.viewport);
  await page.goto(`/site-access/business-demo?scenario=${scenario.id}&view=calendar`);
  const calendar=page.getByRole('region',{name:copy.sampleCalendar,exact:true}),client=calendar.getByText(scenario.appointments[0].client,{exact:true});await expect(client).toBeVisible();await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>window.scrollTo(0,0));
  const calendarGeometry=await client.evaluate(el=>{const name=el.getBoundingClientRect();return{top:name.top,bottom:name.bottom,viewport:innerHeight,scrollY};});
  await info.attach('initial-calendar-geometry',{body:JSON.stringify(calendarGeometry),contentType:'application/json'});await page.screenshot({path:info.outputPath(`demo-initial-calendar-${locale}.png`)});
  expect(calendarGeometry.scrollY).toBe(0);expect(calendarGeometry.top).toBeGreaterThanOrEqual(0);expect(calendarGeometry.bottom).toBeLessThanOrEqual(calendarGeometry.viewport);
  const navigation = page.getByRole('navigation', { name: copy.pages, exact: true });
  await expect(navigation.getByRole('button')).toHaveCount(4);
  for(const control of [page.getByRole('combobox',{name:copy.choose,exact:true}),page.getByRole('combobox',{name:copy.professional,exact:true}),page.getByRole('button',{name:copy.resetDate,exact:true}),...await navigation.getByRole('button').all()])await expectTouchTarget(control);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(unexpected).toEqual([]);
 });
}
