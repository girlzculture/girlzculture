import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { defaultPhotoDetails, type BusinessPhotoMetadata } from '../../src/lib/businessPhotoMetadata';
import { DASHBOARD_SOURCE_MESSAGES } from '../../src/i18n/dashboard-source-catalog';

test.use({ serviceWorkers: 'block' });
for (const locale of ['en', 'fr', 'es', 'zh-CN']) {
  test(`Dashboard redesign My Page mobile sections keep labels separate and menu routes intact in ${locale}`, async ({ page }, info) => {
    const fixture = await p0OwnerFixture(page, { populated: true, locale });
    const t = (source: string) => DASHBOARD_SOURCE_MESSAGES[locale]?.[source] || source;
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/salon/dashboard/my-page');
    const sections = page.getByRole('navigation', { name: t('My Page sections'), exact: true });
    const mobile = sections.locator(':scope > div').first();
    const entries = mobile.locator(':scope > a, :scope > details > summary');
    await expect(mobile.getByRole('link', { name: t('Info'), exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(entries).toHaveText(['Info', 'Services', 'Location', 'More'].map(t));
      const metrics = await entries.evaluateAll(elements => elements.map(element => {
        const control = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const text = range.getBoundingClientRect();
        return {
          label: element.textContent,
          fontSize: parseFloat(getComputedStyle(element).fontSize),
          targetHeight: control.height,
          insideOwnControl: text.left >= control.left && text.right <= control.right,
          left: text.left, right: text.right, top: text.top, bottom: text.bottom,
        };
      }));
      for (const metric of metrics) {
        expect(metric.insideOwnControl, `${width}px: ${JSON.stringify(metric)}`).toBe(true);
        expect(metric.fontSize).toBeGreaterThanOrEqual(13);
        expect(metric.targetHeight).toBeGreaterThanOrEqual(44);
      }
      for (let i = 0; i < metrics.length; i++) for (let j = i + 1; j < metrics.length; j++) {
        const a = metrics[i], b = metrics[j];
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
          `${width}px: ${a.label} overlaps ${b.label}`).toBe(true);
      }
      for (const [label, path] of [['Info', 'my-page/business'], ['Services', 'styles'], ['Location', 'my-page/address']]) {
        await expect(mobile.getByRole('link', { name: t(label), exact: true })).toHaveAttribute('href', `/salon/dashboard/${path}`);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const headerBottom = await page.locator('.gc-owner-header').evaluate(element => element.getBoundingClientRect().bottom);
      await sections.evaluate((element, top) => window.scrollBy(0, element.getBoundingClientRect().top - top - 16), headerBottom);
      await page.screenshot({ path: info.outputPath(`my-page-sections-${locale}-${width}.png`) });
    }
    await mobile.locator('summary').click();
    const description = mobile.getByRole('link', { name: t('Description'), exact: true });
    await expect(description).toBeVisible();
    await expect(description).toHaveAttribute('href', '/salon/dashboard/my-page/description');
    await description.click();
    await expect(page).toHaveURL(/\/salon\/dashboard\/my-page\/description$/);
    await expect(mobile.locator('details')).not.toHaveAttribute('open', '');
    await page.goBack();
    await expect(page).toHaveURL(/\/salon\/dashboard\/my-page$/);
    await expect(mobile.getByRole('link', { name: t('Info'), exact: true })).toHaveAttribute('aria-current', 'page');
    expect(fixture.unexpected).toEqual([]);
  });
}
test('Dashboard redesign French mobile destinations remain readable at 320px and 390px', async ({ page }, info) => {
  const fixture = await p0OwnerFixture(page, { populated: true, locale: 'fr' });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/salon/dashboard/my-page');
  const navigation = page.locator('[data-owner-mobile-navigation]');
  const destinations = [
    ['Vue d’ensemble', 'Résumé', '/salon/dashboard'],
    ['Réservations', 'RDV', '/salon/dashboard/bookings'],
    ['Calendrier', 'Agenda', '/salon/dashboard/availability'],
    ['Messages', 'Messages', '/salon/dashboard/messages'],
    ['Plus', 'Plus', '/salon/dashboard/settings'],
  ];
  await expect(navigation.getByRole('link', { name: 'Réservations', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(navigation.getByRole('link')).toHaveCount(destinations.length);
    for (const [accessibleName, label, href] of destinations) {
      const link = navigation.getByRole('link', { name: accessibleName, exact: true });
      await expect(link).toHaveAttribute('href', href);
      const text = link.locator(':scope > span').first();
      await expect(text).toHaveText(label);
      const dimensions = await text.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const cell = element.parentElement!.getBoundingClientRect();
        const style = getComputedStyle(element);
        const range = document.createRange();
        range.selectNodeContents(element);
        return {
          fontSize: parseFloat(style.fontSize),
          lineCount: range.getClientRects().length,
          fits: rect.left >= cell.left && rect.right <= cell.right && rect.left >= 0 && rect.right <= innerWidth,
          clipped: element.scrollWidth > element.clientWidth,
          ellipsis: style.textOverflow === 'ellipsis',
        };
      });
      expect(dimensions.fontSize).toBeGreaterThanOrEqual(13);
      expect(dimensions.lineCount).toBe(1);
      expect(dimensions.fits).toBe(true);
      expect(dimensions.clipped).toBe(false);
      expect(dimensions.ellipsis).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`french-owner-navigation-${width}.png`) });
  }
  expect(fixture.unexpected).toEqual([]);
});
test('Dashboard redesign mobile chrome keeps scrolled content out of header and navigation surfaces',async({page},info)=>{
 await p0OwnerFixture(page,{populated:true});await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/my-page');
 await expect(page.getByRole('textbox',{name:'Business Name',exact:true})).toBeVisible();
 await page.getByLabel('Walk-ins welcome',{exact:true}).scrollIntoViewIfNeeded();
 await expect(page.locator('.gc-owner-header')).toHaveCSS('background-color','rgb(255, 255, 255)');
 const bottom=page.getByRole('navigation',{name:'Owner mobile navigation',exact:true});
 await expect(bottom.getByRole('link',{name:'More',exact:true})).toBeVisible();
 await expect(bottom).toHaveCSS('background-color','rgb(255, 255, 255)');
 await info.attach('mobile-opaque-chrome',{body:await page.screenshot(),contentType:'image/png'});
});
for (const [width,height] of [[390,844],[768,900],[1440,1000],[844,390]]) {
  test(`Dashboard redesign profile and photo edits persist at ${width}x${height}`, async ({ page }, info) => {
    const fixture=await p0OwnerFixture(page,{ populated:true });
    const urls=['/images/salon-modern.jpg','/images/hero-braids.jpg','/images/salon-warm.jpg'];
    let metadata: BusinessPhotoMetadata={ [urls[0]]:{ ...defaultPhotoDetails('space'), title:'Our space' }, [urls[1]]:{ ...defaultPhotoDetails('services'),title:'Braids',caption:'Original caption — 120 USD' } };
    Object.assign(fixture.business,{ gallery_photos:urls, cover_photo_url:urls[0], logo_url:'/pwa-icon-192.png', photo_metadata:metadata, trust_info:{ walk_ins_welcome:false } });
    let fail=false;
    await page.route('**/api/salon/photos',async route => {
      const input=route.request().postDataJSON();
      expect(urls).toContain(input.url);
      if(fail){ fail=false; await route.fulfill({ status:503,json:{code:'PHOTO_UNAVAILABLE',request_id:'PHOTO-EDIT-TEST-REFERENCE'} });return; }
      expect(input.expected_details).toEqual(metadata[input.url] || null);
      metadata={...metadata,[input.url]:input.details};Object.assign(fixture.business,{ photo_metadata:metadata });
      await route.fulfill({json:{photo_metadata:metadata,verified:true}});
    });
    await page.route('**/api/salon/profile',async route => {
      if(route.request().method()!=='PATCH'){ await route.fallback();return; }
      Object.assign(fixture.business,route.request().postDataJSON());
      await route.fulfill({json:{salon:fixture.business,verified:true}});
    });
    await page.setViewportSize({width,height});
    await page.goto('/salon/dashboard/my-page');
    await expect(page.getByRole('textbox',{name:'Business Name',exact:true})).toHaveValue('Save');
    const walk=page.getByLabel('Walk-ins welcome',{exact:true});
    await walk.check();await page.getByRole('button',{name:'Save and verify',exact:true}).click();
    await expect.poll(()=> (fixture.business as unknown as { trust_info:{walk_ins_welcome:boolean} }).trust_info.walk_ins_welcome).toBe(true);
    await page.reload();await expect(walk).toBeChecked();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:info.outputPath('my-page.png'),fullPage:true});
    await page.goto('/salon/dashboard/photos');
    await expect(page.getByRole('heading',{name:'Photos',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Braids',exact:true})).toBeVisible();
    await expect(page.locator('details').filter({hasText:'Upload, crop and arrange photos'})).not.toHaveAttribute('open','');
    await page.getByRole('button',{name:'Services (1)',exact:true}).click();
    await expect(page.locator('article').filter({hasText:'Braids'})).toHaveCount(1);
    await expect(page.getByRole('heading',{name:'Our space',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Edit photo details 1',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Edit photo details',exact:true});
    await editor.getByLabel('Title',{exact:true}).fill('Boho braids — GC123');
    await editor.getByRole('textbox',{name:'Caption',exact:true}).fill('Original wording: 120 USD, 2 hours.');
    fail=true;await editor.getByRole('button',{name:'Save photo details',exact:true}).click();
    await expect(editor.getByRole('alert')).toContainText('PHOTO-EDIT-TEST-REFERENCE');
    await expect(editor.getByLabel('Title',{exact:true})).toHaveValue('Boho braids — GC123');
    await editor.getByRole('button',{name:'Save photo details',exact:true}).click();
    await expect(editor).not.toBeVisible();
    await page.reload();await expect(page.getByRole('heading',{name:'Boho braids — GC123',exact:true})).toBeVisible();
    expect(metadata[urls[1]].caption).toBe('Original wording: 120 USD, 2 hours.');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:info.outputPath('photos.png'),fullPage:true});
    await page.getByRole('button',{name:'Team (0)',exact:true}).click();
    await page.getByRole('button',{name:'Upload Photos',exact:true}).first().click();
    await expect(page.locator('details[open]')).toContainText('New photos will be added to: Team');
    expect(fixture.unexpected).toEqual([]);
  });
}

for (const [width,height] of [[390,844],[1440,1000]]) {
  test(`Dashboard redesign assistant appearance persists and business switches clear context at ${width}x${height}`,async({page})=>{
    const fixture=await p0OwnerFixture(page,{populated:true});
    Object.assign(fixture.business,{gc_assistant_avatar:'woman'});
    const originalId=fixture.business.id;let saves=0;
    await page.route('**/api/salon/assistant/appearance',async route=>{
      expect(route.request().postDataJSON()).toEqual({avatar:'cat'});
      saves++;
      if(saves===1){await route.fulfill({status:503,json:{code:'ASSISTANT_APPEARANCE_UNAVAILABLE',request_id:'AVATAR-TEST-REFERENCE'}});return;}
      Object.assign(fixture.business,{gc_assistant_avatar:'cat'});
      await route.fulfill({json:{avatar:'cat',business_id:fixture.business.id,verified:true}});
    });
    const calls:Record<string,unknown>[]=[];
    await page.route('**/api/salon/assistant',async route=>{calls.push(route.request().postDataJSON());await route.fulfill({json:{reply:'This answer belongs to business A.',response_locale:'en'}});});
    await page.setViewportSize({width,height});await page.goto('/salon/dashboard/photos');
    await expect(page.getByRole('heading',{name:'Photos',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'GC Assistant',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
    await expect(dialog.getByRole('button',{name:'Count my photos',exact:true})).toBeVisible();
    await expect(dialog.getByRole('button',{name:'My business profile',exact:true})).toHaveCount(0);
    await dialog.getByText('Conversation options',{exact:true}).click();
    await dialog.getByRole('button',{name:'Smiling cat',exact:true}).click();
    await expect(dialog.getByText('AVATAR-TEST-REFERENCE',{exact:true})).toBeVisible();
    await expect(dialog.locator('header [data-assistant-avatar]')).toHaveAttribute('data-assistant-avatar','woman');
    await dialog.getByRole('button',{name:'Smiling cat',exact:true}).click();
    await expect(dialog.getByText('Assistant appearance saved.',{exact:true})).toBeVisible();
    await expect(page.locator('[data-gc-assistant-launcher] [data-assistant-avatar]').first()).toHaveAttribute('data-assistant-avatar','cat');
    await page.reload();await page.getByRole('button',{name:'GC Assistant',exact:true}).click();
    await expect(dialog.locator('header [data-assistant-avatar]')).toHaveAttribute('data-assistant-avatar','cat');
    await dialog.locator('textarea').fill('Show my photos.');await dialog.getByRole('button',{name:'Ask GC Assistant',exact:true}).click();
    await expect(dialog.locator('article')).toContainText('This answer belongs to business A.');
    await expect(dialog.locator('article [data-assistant-avatar]')).toHaveAttribute('data-assistant-avatar','cat');
    // Simulate a newly authorized workspace returned by the server. The browser
    // cannot authorize this switch through a chat prompt or an appearance PATCH.
    Object.assign(fixture.business,{id:'22000000-0000-4000-8000-000000000099',name:'Business B',gc_assistant_avatar:'dog'});
    await page.evaluate(()=>window.dispatchEvent(new Event('gc-assistant-saved')));
    await expect(dialog.locator('article')).toHaveCount(0);
    await expect(dialog.locator('header [data-assistant-avatar]')).toHaveAttribute('data-assistant-avatar','dog');
    await dialog.locator('textarea').fill('What about my photos now?');await dialog.getByRole('button',{name:'Ask GC Assistant',exact:true}).click();
    await expect.poll(()=>calls.length).toBe(2);
    expect(calls[1]).toMatchObject({conversation:[],previous_request_ids:[]});
    expect(JSON.stringify(calls[1])).not.toContain(originalId);
    expect(saves).toBe(2);expect(fixture.unexpected).toEqual([]);
  });
}

for (const [width,height] of [[320,844],[390,844],[844,390]]) {
  test(`Dashboard redesign Photos starts with visible gallery and keeps tools usable at ${width}x${height}`, async ({ page }, info) => {
    const fixture = await p0OwnerFixture(page, { populated:true });
    const urls = ['/images/hero-braids.jpg','/images/salon-modern.jpg'];
    Object.assign(fixture.business, { gallery_photos:urls, cover_photo_url:urls[1], logo_url:'/pwa-icon-192.png', photo_metadata:{
      [urls[0]]:{ ...defaultPhotoDetails('services'), title:'Braids gallery proof', featured:true },
      [urls[1]]:{ ...defaultPhotoDetails('space'), title:'Salon gallery proof' },
    } });
    await page.setViewportSize({width,height});
    await page.goto('/salon/dashboard/photos');
    const first = page.getByRole('article').filter({has:page.getByRole('heading',{name:'Braids gallery proof',exact:true})});
    await expect(first).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const initial = await first.evaluate(element => {
      const card = element.getBoundingClientRect();
      const header = document.querySelector('.gc-owner-header')!.getBoundingClientRect();
      const nav = document.querySelector('[data-owner-mobile-navigation]')!.getBoundingClientRect();
      return { top:card.top, visibleHeight:Math.min(card.bottom,nav.top)-Math.max(card.top,header.bottom), scrollY:window.scrollY, headerBottom:header.bottom, navTop:nav.top };
    });
    await info.attach('initial-gallery-geometry', {body:JSON.stringify(initial),contentType:'application/json'});
    await page.screenshot({path:info.outputPath('photos-initial-viewport.png')});
    expect(initial.scrollY).toBe(0);
    expect(initial.top).toBeGreaterThanOrEqual(initial.headerBottom);
    expect(initial.visibleHeight, JSON.stringify(initial)).toBeGreaterThanOrEqual(Math.min(96,height/8));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
    const tools = page.getByRole('button',{name:'Photo tools',exact:true});
    const panel = page.getByRole('region',{name:'Photo tools',exact:true});
    await expect(tools).toHaveAttribute('aria-expanded','false');
    await expect(panel).not.toBeVisible();
    await tools.click();
    await expect(tools).toHaveAttribute('aria-expanded','true');
    for(const label of ['Gallery photos','Cover photo','Salon logo','Featured photos']) await expect(panel.getByText(label,{exact:true})).toBeVisible();
    await expect(panel.getByRole('link',{name:'View public gallery',exact:true})).toHaveAttribute('href','/salon/p0-browser');
    await expect(panel.getByRole('link',{name:'Change cover photo',exact:true})).toHaveAttribute('href','/salon/dashboard/photos/cover');
    await expect(panel.getByRole('link',{name:'Change business logo',exact:true})).toHaveAttribute('href','/salon/dashboard/photos/logo');
    await expect(panel.getByRole('button',{name:/Add photos of your work/})).toBeVisible();
    await tools.click();
    await expect(panel).not.toBeVisible();
    await page.getByRole('button',{name:'Services (1)',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Salon gallery proof',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Edit photo details 1',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Edit photo details',exact:true});
    await expect(editor.getByRole('textbox',{name:'Title',exact:true})).toHaveValue('Braids gallery proof');
    await editor.getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:'Team (0)',exact:true}).click();
    await page.getByRole('button',{name:'Upload Photos',exact:true}).first().click();
    await expect(page.locator('details[open]')).toContainText('New photos will be added to: Team');
    expect(fixture.actions).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
}
