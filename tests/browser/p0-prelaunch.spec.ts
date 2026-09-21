import { expect, test as requestTest, type Page } from '@playwright/test';
import { test, screenshotCaret } from './helpers/hydration';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

// A dev-runtime replacement navigation can begin after goto() has resolved.
// Read the current document's load state, menu hydration and location render.
// The location response can replace skeletons after load and introduce fonts.
// No dimensions are polled and persistent overflow still fails.
async function waitForMarketplaceDocument(page: Page) {
  await page.waitForLoadState('load');
  await expect(page.getByRole('button', { name: 'Open navigation menu', exact: true, includeHidden: true })).toBeEnabled();
  for (const name of ['Loading nearby salons', 'Loading featured salons']) {
    await expect(page.getByRole('status', { name, exact: true })).toBeHidden();
  }
}

async function marketplaceGeometry(page: Page, settleFonts = true) {
  return page.evaluate(async waitForFonts => {
    if (waitForFonts) {
      // Discover fonts used by the current layout before reading its ready
      // promise. A previously resolved promise does not cover a later cycle.
      // Measure in this same evaluation, without another protocol round trip.
      void document.documentElement.offsetHeight;
      await document.fonts.ready;
    }
    const describe = (element: Element) => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return { tag: element.tagName, id: element.id, class: element.getAttribute('class'), label: element.getAttribute('aria-label'), left: rect.left, right: rect.right, top: rect.top, width: rect.width, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: style.overflowX, position: style.position, minWidth: style.minWidth, transform: style.transform };
    };
    return {
      fits: document.documentElement.scrollWidth <= innerWidth,
      viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, scrollX,
      readyState: document.readyState, fonts: document.fonts.status,
      outside: [...document.querySelectorAll('body *')].filter(element => {
        const rect = element.getBoundingClientRect();
        return element.getClientRects().length > 0 && (rect.right > innerWidth || rect.left < 0);
      }).map(element => {
        const ancestors = []; let parent = element.parentElement;
        while (parent && ancestors.length < 6) { ancestors.push(describe(parent)); parent = parent.parentElement; }
        return { ...describe(element), ancestors };
      }),
    };
  }, settleFonts);
}

// Software-first founder decision: discovery closed; direct real-business
// booking and authenticated accounts remain available. Demo entry is unlisted.
requestTest('demonstration exit is same-origin POST only and closes discovery', async ({ request, baseURL }) => {
  for (const method of ['GET', 'HEAD']) {
    const r = await request.fetch('/site-access/exit', { method, headers: { 'next-router-prefetch': '1' }, maxRedirects: 0 });
    expect(r.status()).toBe(204);
    expect(r.headers()['set-cookie']).toBeUndefined();
    expect(r.headers()['cache-control']).toContain('no-store');
  }
  for (const origin of ['https://unrelated.example', '']) {
    const r = await request.post('/site-access/exit', { headers: { origin }, maxRedirects: 0 });
    expect(r.status()).toBe(403);
    expect(r.headers()['set-cookie']).toBeUndefined();
  }
  expect((await request.put('/site-access/exit', { maxRedirects: 0 })).status()).toBe(405);
  const r = await request.post('/site-access/exit', { headers: { origin: new URL(baseURL!).origin }, maxRedirects: 0 });
  expect(r.status()).toBe(303);
  expect(new URL(r.headers().location, baseURL).pathname).toBe('/');
  expect(r.headers()['set-cookie']).toContain('Max-Age=0');
  expect((await request.get('/api/discovery/salons?lat=40.7&lng=-74')).status()).toBe(503);
});

for (const width of [390, 768, 1440]) test(`root business landing preserved independently of the marketplace at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join as a business', exact: true })).toHaveAttribute('href', '/business/signup');
  await expect(page.locator('main[data-homepage-variant]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  const directory = `docs/screenshots/dashboard-redesign/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/root-preserved-${width}.png`, fullPage: true, ...screenshotCaret });
});

test('unlisted entry establishes lasting browsing access while real business booking remains available', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('girlz-culture-mobile-location-prompt-v1', JSON.stringify({ dismissedAt: Date.now(), outcome: 'dismissed' })));
  const entry = await page.goto('/site-access');
  expect(entry?.status()).toBeLessThan(400);
  expect(entry?.headers()['x-robots-tag']).toContain('noindex');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content',/noindex/);
  expect(entry?.headers()['netlify-cdn-cache-control']).toContain('no-store');
  await expect(page.locator('main[data-homepage-variant]')).toBeVisible();
  await expect(page.getByLabel('Marketplace demonstration notice')).toHaveCount(0);
  await expect(page.getByText(/booking and payment are unavailable|Demo browsing only|Exit demonstration/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Girlz Culture home', exact: true })).toHaveAttribute('href', '/site-access');
  await page.goto('/salon/acceptance-salon');
  await expect(page.getByRole('heading', { name: 'Acceptance Salon', exact: true })).toBeVisible();
  const book = page.getByRole('link', { name: 'Book Appointment', exact: true });
  await expect(book).toHaveAttribute('href', '/salon/acceptance-salon/book');
  await book.click();
  await expect(page).toHaveURL('/salon/acceptance-salon/book');
  await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Marketplace demonstration notice')).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1180, height: 820 }, { width: 1680, height: 1000 }]) test(`demonstration navigation and session retention at ${viewport.width}x${viewport.height}`, async ({ page, context, baseURL }, info) => {
  await page.setViewportSize(viewport);
  await context.addCookies([{ name: 'gc_site_access', value: 'marketplace-demo', url: baseURL! }]);
  await page.addInitScript(() => localStorage.setItem('girlz-culture-mobile-location-prompt-v1', JSON.stringify({ dismissedAt: Date.now(), outcome: 'dismissed' })));
  await page.goto('/site-access');
  await expect(page.locator('main[data-homepage-variant]')).toBeVisible();
  expect((await context.cookies()).some(cookie => cookie.name === 'gc_site_access')).toBe(true);
  await expect(page.getByLabel('Marketplace demonstration notice')).toHaveCount(0);
  await waitForMarketplaceDocument(page);
  const initialGeometry = await marketplaceGeometry(page);
  await info.attach('marketplace-initial-geometry', { body: JSON.stringify(initialGeometry, null, 2), contentType: 'application/json' });
  expect(initialGeometry.fits).toBe(true);
  let nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  if (viewport.width < 1536) {
    const trigger = page.getByRole('button', { name: 'Open navigation menu', exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.click();
    nav = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    await nav.getByText('For Businesses', { exact: true }).click();
  } else await nav.getByRole('button', { name: 'For Businesses', exact: true }).click();
  const pricing = nav.getByRole('link', { name: 'Pricing', exact: true });
  await expect(pricing).toBeVisible();
  await expect(pricing).toHaveAttribute('href', '/plans');
  await pricing.click();
  await expect(page).toHaveURL('/plans');
  for (const name of ['Starter', 'Growth', 'Premium']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.goto('/site-access');
  await page.reload();
  expect((await context.cookies()).some(cookie=>cookie.name==='gc_site_access')).toBe(true);
  await expect(page.getByLabel('Marketplace demonstration notice')).toHaveCount(0);
  const directory = `docs/screenshots/dashboard-redesign/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/marketplace-${viewport.width}.png`, fullPage: true, ...screenshotCaret });
});

test('demonstration replacement document waits for its stylesheet before geometry at 390x844', async ({ page, context, baseURL }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{ name: 'gc_site_access', value: 'marketplace-demo', url: baseURL! }]);
  await page.addInitScript(() => localStorage.setItem('girlz-culture-mobile-location-prompt-v1', JSON.stringify({ dismissedAt: Date.now(), outcome: 'dismissed' })));
  await page.goto('/site-access');
  await waitForMarketplaceDocument(page);

  let resolveStylesheet!: () => void;
  let markStylesheetRequested!: () => void;
  let markStylesheetFinished!: () => void;
  let stylesheetStarted = false;
  let stylesheetReleased = false;
  let stylesheetContinued = false;
  const stylesheetGate = new Promise<void>(resolve => { resolveStylesheet = resolve; });
  const releaseStylesheet = () => { stylesheetReleased = true; resolveStylesheet(); };
  const stylesheetRequested = new Promise<void>(resolve => { markStylesheetRequested = resolve; });
  const stylesheetFinished = new Promise<void>(resolve => { markStylesheetFinished = resolve; });
  // The original trace checked the replacement document while this actual
  // render-blocking @import from globals.css was still in flight. Hold only
  // that public stylesheet response, without changing its bytes or page CSS.
  await page.route('https://fonts.googleapis.com/**', async route => {
    stylesheetStarted = true;
    markStylesheetRequested();
    try {
      await stylesheetGate;
      stylesheetContinued = true;
      await route.continue();
    } finally { markStylesheetFinished(); }
  });
  try {
    await page.reload({ waitUntil: 'commit' });
    await stylesheetRequested;
    await expect(page.locator('main[data-homepage-variant]')).toBeVisible();
    const premature = await marketplaceGeometry(page, false);
    await info.attach('marketplace-held-stylesheet-geometry', { body: JSON.stringify(premature, null, 2), contentType: 'application/json' });
    expect(premature.readyState).not.toBe('complete');

    // Incomplete layout can fit or overflow in either engine. Prove that the
    // actual stylesheet is still held instead of requiring broken geometry.
    expect({ started: stylesheetStarted, released: stylesheetReleased, continued: stylesheetContinued }).toEqual({ started: true, released: false, continued: false });
    let ready = false;
    const currentDocument = waitForMarketplaceDocument(page).then(() => { ready = true; });
    // A protocol round trip verifies the current document is still loading;
    // no elapsed-time assumption, sleep, retry or width-based wait is involved.
    expect(await page.evaluate(() => document.readyState)).not.toBe('complete');
    expect({ released: stylesheetReleased, continued: stylesheetContinued }).toEqual({ released: false, continued: false });
    expect(ready).toBe(false);
    releaseStylesheet();
    await currentDocument;
    const loaded = await marketplaceGeometry(page);
    await info.attach('marketplace-loaded-stylesheet-geometry', { body: JSON.stringify(loaded, null, 2), contentType: 'application/json' });
    expect(loaded.readyState).toBe('complete');
    expect(loaded.fonts).toBe('loaded');
    expect(loaded.fits).toBe(true);
    await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeVisible();
  } finally {
    releaseStylesheet();
    if (stylesheetStarted) await stylesheetFinished;
    await page.unroute('https://fonts.googleapis.com/**');
  }
});

test('marketplace geometry waits for a font cycle that starts after document readiness at 390x844', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{ name: 'gc_site_access', value: 'marketplace-demo', url: baseURL! }]);
  await page.goto('/site-access');
  await waitForMarketplaceDocument(page);

  const fontPath = '/fonts/montserrat/Montserrat-Regular.woff2?readiness-regression';
  let releaseFont!: () => void;
  let markRequested!: () => void;
  let markFinished!: () => void;
  let started = false;
  const gate = new Promise<void>(resolve => { releaseFont = resolve; });
  const requested = new Promise<void>(resolve => { markRequested = resolve; });
  const finished = new Promise<void>(resolve => { markFinished = resolve; });
  await page.route(`**${fontPath}`, async route => {
    started = true;
    markRequested();
    try { await gate; await route.continue(); }
    finally { markFinished(); }
  });
  try {
    // Reproduce the trace's second loading cycle after fonts.ready resolved.
    // Use a real bundled font response, gated by an event rather than a delay.
    await page.evaluate(path => {
      const font = new FontFace('MarketplaceReadiness', `url("${path}")`);
      document.fonts.add(font);
      void font.load();
    }, fontPath);
    await requested;
    expect(await page.evaluate(() => ({ document: document.readyState, fonts: document.fonts.status })))
      .toEqual({ document: 'complete', fonts: 'loading' });
    let measured = false;
    const measurement = marketplaceGeometry(page).then(geometry => { measured = true; return geometry; });
    // Protocol round trip, not an elapsed-time wait: the response is still held.
    expect(await page.evaluate(() => document.fonts.status)).toBe('loading');
    expect(measured).toBe(false);
    releaseFont();
    const geometry = await measurement;
    expect(geometry.fonts).toBe('loaded');
    expect(geometry.fits).toBe(true);
    expect(await page.evaluate(() => [...document.fonts].find(font => font.family === 'MarketplaceReadiness')?.status)).toBe('loaded');
  } finally {
    releaseFont();
    if (started) await finished;
    await page.unroute(`**${fontPath}`);
  }
});

test('public account APIs retain authentication rather than a demonstration restriction', async ({ request }) => {
  for (const method of ['GET', 'POST', 'DELETE']) {
    const path = '/api/customer/favorites';
    const r = await request.fetch(path, { method, data: method === 'GET' ? undefined : { salon_id: '11111111-1111-4111-8111-111111111111' }, headers: { 'x-gc-site-access': '1' } });
    expect(r.status(), path).toBe(401);
    expect(r.headers()['content-type']).toContain('application/json');
    expect((await r.json()).code).not.toBe('CUSTOMER_MARKETPLACE_NOT_LIVE');
  }
});

test('business signup, owner login and help remain reachable', async ({ page }) => {
  for (const path of ['/business/signup', '/business/login', '/help', '/terms', '/privacy']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await expect(page.getByRole('heading', { name: 'A new home for your beauty business', exact: true })).toHaveCount(0);
    await expect(page.locator('main')).toBeVisible();
  }
});

requestTest('closed discovery rejects forged mode headers but not direct booking APIs', async({request})=>{
 for(const path of ["/api/discovery/salons","/api/search/suggestions","/api/concierge/search"]){
  const r=await request.get(path,{headers:{"x-gc-site-access":"1"}});expect(r.status()).toBe(503);expect((await r.json()).code).toBe("CUSTOMER_MARKETPLACE_NOT_LIVE");
 }
 const invalid=await request.get("/api/booking-availability");expect(invalid.status()).toBe(400);expect((await invalid.json()).code).toBe("AVAILABILITY_INPUT_REQUIRED");
 const business=randomUUID();const fixture=`http://127.0.0.1:3109/__fixtures/p0-public-policy/${business}`;
 try{
  expect((await request.post(fixture,{headers:{'x-acceptance-fixture':'p0-public-policy'},data:{version:1}})).ok()).toBe(true);
  const day=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const direct=await request.get(`/api/booking-availability?salon_id=${business}&style_id=${business}&date=${day}`);
  expect(direct.status()).toBe(200);const result=await direct.json();expect(Array.isArray(result.slots)).toBe(true);expect(result.timeZone).toBe('America/New_York');
 }finally{await request.post(fixture,{headers:{'x-acceptance-fixture':'p0-public-policy'},data:{version:null}});}
});

test('ordinary visitors keep direct business pages and cannot navigate into founder discovery',async({page})=>{
 await page.goto("/salon/acceptance-salon");
 await expect(page.getByRole("heading",{name:"Acceptance Salon",exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"Girlz Culture home",exact:true})).toHaveAttribute("href","/");
 await expect(page.locator('header a[href="/site-access"], header a[href="/salons"], header a[href="/styles"], footer a[href="/site-access"]')).toHaveCount(0);
 await expect(page.getByRole("link",{name:"Book Appointment",exact:true})).toHaveAttribute("href","/salon/acceptance-salon/book");
 for(const path of ["/styles","/salons"]){await page.goto(path);await expect(page.getByRole("heading",{name:"A new home for your beauty business",exact:true})).toBeVisible();}
 await page.goto("/site-access");await page.goto("/styles");await expect(page.getByPlaceholder("Search styles")).toBeVisible();
 await page.reload();await expect(page.getByPlaceholder("Search styles")).toBeVisible();
});
