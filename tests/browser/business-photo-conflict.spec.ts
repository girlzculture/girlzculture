import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {defaultPhotoDetails,type BusinessPhotoDetails} from '../../src/lib/businessPhotoMetadata';

test.use({serviceWorkers:'block'});
test('Business photo conflict reloads current saved details without losing the owner draft',async({page},info)=>{
 const f=await p0OwnerFixture(page,{populated:true});const url='/images/hero-braids.jpg',other='/images/salon-warm.jpg';let details:BusinessPhotoDetails={...defaultPhotoDetails('services'),title:'Initial title',caption:'Initial caption'};let saves=0,reads=0,failRead=true;
 const otherDetails={...defaultPhotoDetails('space'),title:'Other photo updated concurrently'};
 Object.assign(f.business,{gallery_photos:[url,other],photo_metadata:{[url]:details}});
 await page.route('**/api/salon/profile',route=>{
  if(route.request().method()!=='GET')return route.fallback();reads++;
  if(failRead){failRead=false;return route.fulfill({status:503,json:{code:'PROFILE_UNAVAILABLE',request_id:'PHOTO-RELOAD-REFERENCE'}});}
  return route.fulfill({json:{salon:{...f.business,photo_metadata:{[url]:details,[other]:otherDetails}}}});
 });
 await page.route('**/api/salon/photos',route=>{
  expect(route.request().method()).toBe('PATCH');const body=route.request().postDataJSON();expect(body.url).toBe(url);saves++;
  if(saves===1){expect(body.expected_details.title).toBe('Initial title');details={...details,title:'Changed by colleague',caption:'Current saved caption',featured:true};return route.fulfill({status:409,json:{code:'PHOTO_STALE',request_id:'PHOTO-CONFLICT-REFERENCE'}});}
  expect(body.expected_details).toEqual(details);expect(body.details).toEqual({...defaultPhotoDetails('team'),title:'My unsaved title',caption:'My retained caption – 120 USD'});details=body.details;Object.assign(f.business,{photo_metadata:{[url]:details,[other]:otherDetails}});return route.fulfill({json:{verified:true,photo_metadata:{[url]:details,[other]:otherDetails}}});
 });
 await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/photos');await page.getByRole('button',{name:'Edit photo details 1',exact:true}).click();const editor=page.getByRole('dialog',{name:'Edit photo details',exact:true});await expect(editor.getByRole('heading',{name:'Edit photo details',exact:true})).toBeVisible();
 await editor.getByRole('textbox',{name:'Title',exact:true}).fill('My unsaved title');await expect(editor).toBeVisible();await editor.getByRole('textbox',{name:'Caption',exact:true}).fill('My retained caption – 120 USD');await editor.getByRole('combobox',{name:'Category',exact:true}).selectOption('team');
 const save=editor.getByRole('button',{name:'Save photo details',exact:true});await save.click();await expect(editor.getByRole('alert')).toContainText('PHOTO-CONFLICT-REFERENCE');await expect(editor.getByRole('textbox',{name:'Title',exact:true})).toHaveValue('My unsaved title');
 const reload=editor.getByRole('button',{name:'Reload saved details',exact:true});await expect(reload).toBeVisible();await expect(save).toBeDisabled();await reload.click();await expect(editor.getByRole('alert')).toContainText('PHOTO-RELOAD-REFERENCE');await expect(editor.getByRole('textbox',{name:'Caption',exact:true})).toHaveValue('My retained caption – 120 USD');await expect(save).toBeDisabled();expect(saves).toBe(1);
 await reload.click();await expect(editor.getByText('Changed by colleague',{exact:true})).toBeVisible();await expect(editor.getByText('Current saved caption',{exact:true})).toBeVisible();await expect(editor.getByRole('textbox',{name:'Title',exact:true})).toHaveValue('My unsaved title');await expect(editor.getByRole('combobox',{name:'Category',exact:true})).toHaveValue('team');await expect(save).toBeEnabled();expect(reads).toBe(2);expect(saves).toBe(1);
 await page.screenshot({path:info.outputPath('photo-conflict-review.png')});await save.click();await expect(editor).not.toBeVisible();expect(saves).toBe(2);await expect(page.getByRole('heading',{name:otherDetails.title,exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'My unsaved title',exact:true})).toBeVisible();expect(details.caption).toBe('My retained caption – 120 USD');expect(f.unexpected).toEqual([]);
});

for(const kind of ['foreign','removed'] as const)test(`Business photo conflict refuses a ${kind} reload snapshot without discarding edits`,async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true});const url='/images/hero-braids.jpg';let saves=0;
 Object.assign(f.business,{gallery_photos:[url],photo_metadata:{[url]:{...defaultPhotoDetails('services'),title:'Own title'}}});
 await page.route('**/api/salon/photos',route=>{saves++;return route.fulfill({status:409,json:{code:'PHOTO_STALE',request_id:'PHOTO-CONFLICT-REFERENCE'}});});
 await page.route('**/api/salon/profile',route=>route.fulfill({json:{salon:{...f.business,id:kind==='foreign'?'99000000-0000-4000-8000-000000000001':f.business.id,gallery_photos:kind==='removed'?[]:[url],photo_metadata:{[url]:{...defaultPhotoDetails('services'),title:'FORBIDDEN SNAPSHOT TITLE'}}}}}));
 await page.goto('/salon/dashboard/photos');await page.getByRole('button',{name:'Edit photo details 1',exact:true}).click();const editor=page.getByRole('dialog',{name:'Edit photo details',exact:true});await editor.getByRole('textbox',{name:'Title',exact:true}).fill('My retained edit');const save=editor.getByRole('button',{name:'Save photo details',exact:true});await save.click();await expect(editor.getByRole('alert')).toContainText('PHOTO-CONFLICT-REFERENCE');await editor.getByRole('button',{name:'Reload saved details',exact:true}).click();await expect(editor.getByRole('alert')).toContainText(kind==='removed'?'no longer in the saved gallery':'could not be loaded');await expect(editor.getByRole('textbox',{name:'Title',exact:true})).toHaveValue('My retained edit');await expect(save).toBeDisabled();await expect(page.getByText('FORBIDDEN SNAPSHOT TITLE',{exact:true})).toHaveCount(0);expect(saves).toBe(1);
});

test('Business photo conflict discards a late reload after closing and reopening the editor',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true});const url='/images/hero-braids.jpg';let reads=0,saves=0;let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 Object.assign(f.business,{gallery_photos:[url],photo_metadata:{[url]:{...defaultPhotoDetails('services'),title:'Original saved title'}}});
 await page.route('**/api/salon/photos',route=>{saves++;if(saves===1)return route.fulfill({status:409,json:{code:'PHOTO_STALE',request_id:'PHOTO-CONFLICT-REFERENCE'}});const body=route.request().postDataJSON();expect(body.expected_details.title).toBe('Original saved title');expect(body.details.title).toBe('New editor draft');return route.fulfill({json:{verified:true,photo_metadata:{[url]:body.details}}});});
 await page.route('**/api/salon/profile',async route=>{reads++;await pending;return route.fulfill({json:{salon:{...f.business,photo_metadata:{[url]:{...defaultPhotoDetails('services'),title:'LATE SAVED TITLE'}}}}});});
 await page.goto('/salon/dashboard/photos');const edit=page.getByRole('button',{name:'Edit photo details 1',exact:true});await edit.click();const editor=page.getByRole('dialog',{name:'Edit photo details',exact:true});await editor.getByRole('button',{name:'Save photo details',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('PHOTO-CONFLICT-REFERENCE');await editor.getByRole('button',{name:'Reload saved details',exact:true}).click();await expect.poll(()=>reads).toBe(1);await editor.getByRole('button',{name:'Close',exact:true}).click();await edit.click();await editor.getByRole('textbox',{name:'Title',exact:true}).fill('New editor draft');const response=page.waitForResponse('**/api/salon/profile');release();await(await response).finished();await expect(editor.getByRole('textbox',{name:'Title',exact:true})).toHaveValue('New editor draft');await expect(editor.getByText('LATE SAVED TITLE',{exact:true})).toHaveCount(0);await expect(editor.getByRole('region',{name:'Current saved details',exact:true})).toHaveCount(0);await editor.getByRole('button',{name:'Save photo details',exact:true}).click();await expect(editor).not.toBeVisible();expect(saves).toBe(2);
});
