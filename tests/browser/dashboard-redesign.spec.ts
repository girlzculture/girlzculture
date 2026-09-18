import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { defaultPhotoDetails, type BusinessPhotoMetadata } from '../../src/lib/businessPhotoMetadata';

test.use({ serviceWorkers: 'block' });
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
