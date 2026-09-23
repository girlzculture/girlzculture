import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {assistantOperationsCopy} from '../../src/i18n/assistant-operations-copy';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
import sharp from 'sharp';

test.use({serviceWorkers:'block'});
for(const [locale,width,height,title]of [['en',390,844,'Add a photo'],['fr',768,900,'Ajouter une photo'],['es',1440,900,'Añadir una foto'],['zh-CN',844,390,'添加照片']] as const){
 test(`Master assistant stages a photo before review and verified attachment in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});
  const copy=assistantOperationsCopy(locale),t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  const uploadId='66000000-0000-4000-8000-000000000001',assetId='66000000-0000-4000-8000-000000000002';
  const url='/fixture-assistant-photo.png',png=await sharp({create:{width:1200,height:1200,channels:3,background:'#007c89'}}).png().toBuffer();
  let prepared=0,stored=0,finalized=0,writes=0,confirmAttempts=0,activeId='';
  let release!:()=>void;const delayed=new Promise<void>(r=>{release=r;});
  await page.route('**/fixture-assistant-photo.png',r=>r.fulfill({contentType:'image/png',body:png}));
  await page.route('**/api/media/upload/prepare',r=>{
   expect(r.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);
   const body=r.request().postDataJSON();expect(body).toMatchObject({bucket:'salon-photos',folder:`salons/${f.business.id}/gallery`,kind:'gallery'});
   expect(body.attachment??null).toBeNull();expect(body.files.source.width).toBe(1200);expect(writes).toBe(0);prepared++;
   return r.fulfill({json:{upload_id:uploadId,uploads:[{slot:'source',bucket:'salon-photos',path:'fixture/source.png',token:'fixture-signed-upload'}]}});
  });
  await page.route('**/storage/v1/object/upload/sign/**',r=>{stored++;return r.fulfill({json:{Key:'salon-photos/fixture/source.png'}});});
  await page.route('**/api/media/upload/finalize',r=>{
   expect(r.request().postDataJSON()).toEqual({upload_id:uploadId});expect(stored).toBe(1);expect(writes).toBe(0);finalized++;
   return r.fulfill({json:{asset_id:assetId,url,status:'Staged',attached:false}});
  });
  await page.route('**/api/salon/assistant',async r=>{
   expect(r.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);const body=r.request().postDataJSON();
   if(body.action==='confirm'){
    expect(body).toMatchObject({request_id:activeId,digest:'d'.repeat(64),confirm:true});confirmAttempts++;
    if(confirmAttempts===1){await delayed;return r.fulfill({status:503,json:{code:'ASSISTANT_UNAVAILABLE',request_id:'20000000-0000-4000-8000-000000000076'}});}
    writes++;return r.fulfill({json:{verified:true,result:{operation:'photo_add',gallery_total:writes,url,provider_action:false}}});
   }
   activeId=body.request_id;
   if(body.action==='tool'){
    expect(body.tool).toBe('prepare_photo_change');expect(body.args).toEqual({operation:'photo_add',record_id:null,changes_json:JSON.stringify({url})});expect(finalized).toBe(1);
    return r.fulfill({json:{response_locale:locale,request:{id:activeId,tool:body.tool,risk_class:4,digest:'d'.repeat(64),before_summary:{gallery:[]},confirmed_at:null,arguments:body.args,execution_payload:{operation:'photo_add',changes:{url},gallery_total:1}},preview_required:true}});
   }
   expect(body.action).toBe('plan');
   return r.fulfill({json:{response_locale:locale,request:{id:activeId,tool:'get_business_media',risk_class:1,arguments:{},execution_payload:{},before_summary:{},result:{gallery_total:writes},confirmed_at:null},assistant_message:`Gallery: ${writes}`}});
  });
  await page.goto('/salon/dashboard');const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});
  const open=async()=>{if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();};await open();
  const send=async()=>{await dialog.locator('textarea').fill('Show my photos.');await dialog.getByRole('button',{name:t('Ask GC Assistant'),exact:true}).click();};
  await send();await expect(dialog.getByText('Gallery: 0',{exact:true})).toBeVisible();
  await dialog.locator('summary').filter({hasText:title}).click();const picker=dialog.locator('details').filter({has:page.locator('input[type=file]')});
  await picker.locator('input[type=file]').setInputFiles({name:'own-gallery.png',mimeType:'image/png',buffer:png});
  await picker.getByRole('button',{name:t('Upload this image'),exact:true}).click();
  await expect(dialog.getByRole('heading',{name:copy.photo_add,exact:true})).toBeVisible();await expect(dialog.locator('input[type=file]')).toHaveCount(0);expect(prepared).toBe(1);expect(finalized).toBe(1);expect(writes).toBe(0);
  await expect.poll(()=>dialog.getByAltText(copy.photo,{exact:true}).evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  const confirm=dialog.getByRole('button',{name:t('Confirm this change'),exact:true});await confirm.click();await expect(confirm).toBeDisabled();release();
  await expect(dialog).toContainText('20000000-0000-4000-8000-000000000076');await expect(confirm).toBeEnabled();expect(writes).toBe(0);
  await confirm.click();await expect(dialog.getByText(t('Your change was saved and verified.'),{exact:true})).toBeVisible();expect(writes).toBe(1);expect(prepared).toBe(1);expect(confirmAttempts).toBe(2);
  await page.reload();await open();await send();await expect(dialog.getByText('Gallery: 1',{exact:true})).toBeVisible();expect(writes).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('assistant-photo-upload.png')});
 });
}

