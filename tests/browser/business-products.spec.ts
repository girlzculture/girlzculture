import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height] of [['en',390,844],['fr',768,900],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Business products show real stock and retain filters through edit and reload in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});
  const t=(s:string)=>(DASHBOARD_SOURCE_MESSAGES as Record<string,Record<string,string>>)[locale]?.[s]||s;
  Object.assign(f.records.salon_products[0],{name:'Growth Oil',inventory_quantity:2,low_stock_threshold:3,track_inventory:true,product_status:'Active',is_visible:true});
  f.records.salon_products.push({...f.records.salon_products[0],id:'33000000-0000-4000-8000-000000000091',name:'Edge Control',inventory_quantity:0,product_status:'Draft'},{...f.records.salon_products[0],id:'33000000-0000-4000-8000-000000000092',name:'Comb',inventory_quantity:undefined});
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/products');
  await expect(page.getByRole('heading',{name:t('Products'),exact:true}).first()).toBeVisible();await page.screenshot({path:info.outputPath('products-viewport.png')});
  const catalog=page.getByRole('region',{name:t('Product catalog'),exact:true});await expect(catalog).toBeVisible();if(width===390)await expect(catalog.getByRole('heading',{name:'Growth Oil',exact:true})).toBeInViewport();
  await expect(catalog.getByRole('article',{name:'Growth Oil',exact:true})).toContainText(t('Low stock'));
  await expect(catalog.getByRole('article',{name:'Edge Control',exact:true})).toContainText(t('Out of stock'));
  await expect(catalog.getByRole('article',{name:'Comb',exact:true})).toContainText(t('Stock unavailable'));
  await catalog.getByRole('combobox',{name:t('Stock level'),exact:true}).selectOption('low');
  await expect(catalog.getByRole('article')).toHaveCount(1);
  await catalog.getByRole('button',{name:t('List view'),exact:true}).click();
  await catalog.getByRole('link',{name:t('Edit product'),exact:true}).click();
  await expect(page.getByRole('textbox',{name:t('Name'),exact:true})).toHaveValue('Growth Oil');
  await page.goBack();await expect(catalog.getByRole('article')).toHaveCount(1);
  await page.reload();await expect(catalog.getByRole('combobox',{name:t('Stock level'),exact:true})).toHaveValue('low');
  await expect(catalog.getByRole('button',{name:t('List view'),exact:true})).toHaveAttribute('aria-pressed','true');
  await catalog.getByRole('combobox',{name:t('Stock level'),exact:true}).selectOption('all');
  await catalog.getByRole('textbox',{name:t('Search products'),exact:true}).fill('no matches');await expect(catalog.getByRole('article')).toHaveCount(0);
  await expect(catalog.getByText(t('No products match these filters.'),{exact:true})).toBeVisible();
  await catalog.getByRole('textbox',{name:t('Search products'),exact:true}).fill('');
  await catalog.getByRole('button',{name:t('Grid view'),exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:info.outputPath('products-final.png')});
  expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
}
for (const [locale,width,height,staff] of [['en',390,844,false],['fr',768,1024,false],['es',1440,1000,false],['zh-CN',844,390,false],['en',390,844,true]] as const) {
 test(`Business products put required details before photos and preserve drafts at ${width}x${height}${staff?' for permitted staff':''}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});
  if(staff)await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{products:true},records:f.records}}));
  const t=(s:string)=>(DASHBOARD_SOURCE_MESSAGES as Record<string,Record<string,string>>)[locale]?.[s]||s;
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/products/new');
  const editor=page.getByRole('dialog',{name:t('Add product'),exact:true});
  const name=editor.getByRole('textbox',{name:t('Name'),exact:true});
  const price=editor.getByRole('textbox',{name:t('Regular price (USD)'),exact:true});
  await expect(name).toBeVisible();await page.screenshot({path:info.outputPath('product-required-first.png')});
  const photoLabel=editor.getByText(t('Product Photos'),{exact:true});
  const layout=await Promise.all([name.boundingBox(),price.boundingBox(),photoLabel.boundingBox()]);
  expect(layout.every(Boolean)).toBe(true);
  expect(layout[0]!.y+layout[0]!.height).toBeLessThan(layout[2]!.y);
  expect(layout[1]!.y+layout[1]!.height).toBeLessThan(layout[2]!.y);
  await name.fill('Owner product draft');await price.fill('37');
  await editor.getByRole('textbox',{name:t('SKU'),exact:true}).fill('DRAFT-37');
  await editor.getByRole('textbox',{name:t('Description'),exact:true}).fill('Original unsaved product description');
  const photos=editor.locator('details').filter({has:page.getByText(t('Product Photos'),{exact:true})});await photos.locator('summary').click();
  await expect(photos).toContainText(t('Save the record details before adding photos'));
  await expect(photos.locator('input[type="file"]:enabled')).toHaveCount(0);
  await photos.locator('summary').click();await photos.locator('summary').click();
  await expect(name).toHaveValue('Owner product draft');await expect(price).toHaveValue('37');
  await expect(editor.getByRole('textbox',{name:t('SKU'),exact:true})).toHaveValue('DRAFT-37');
  await expect(editor.getByRole('textbox',{name:t('Description'),exact:true})).toHaveValue('Original unsaved product description');
  expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
  expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  f.failNextSave();
  const failure=page.waitForResponse(response=>response.url().endsWith('/api/salon/records/save')&&response.status()===503);
  await editor.getByRole('button',{name:t('Save Product'),exact:true}).click();await failure;
  await expect(name).toHaveValue('Owner product draft');await expect(price).toHaveValue('37');
  if(locale==='en'&&!staff){await name.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('product-failed-save-draft-viewport.png')});}
  await editor.getByRole('button',{name:t('Save Product'),exact:true}).click();
  await expect.poll(()=>f.records.salon_products.find(row=>row.name==='Owner product draft')?.price).toBe(37);
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/);
  await page.reload();
  const saved=page.getByRole('dialog',{name:/Owner product draft/});
  await expect(saved.getByRole('textbox',{name:t('Description'),exact:true})).toHaveValue('Original unsaved product description');
  const savedPhotos=saved.locator('details').filter({has:page.getByText(t('Product Photos'),{exact:true})});
  await savedPhotos.locator('summary').click();await expect(savedPhotos.locator('input[type="file"]')).toBeEnabled();
  await saved.getByRole('textbox',{name:t('Name'),exact:true}).fill('Another unsaved title');
  await savedPhotos.locator('summary').click();await savedPhotos.locator('summary').click();
  await expect(saved.getByRole('textbox',{name:t('Name'),exact:true})).toHaveValue('Another unsaved title');
  await expect(savedPhotos.locator('input[type="file"]')).toHaveCount(1);
  if(locale==='en'&&!staff){await savedPhotos.locator('summary').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('product-saved-photos-expanded-viewport.png')});}
  expect(f.actions).toHaveLength(2);expect(f.unexpected).toEqual([]);
 });
}


for(const locale of ['en','fr','es','zh-CN'] as const){
 test(`Business products keep the complete default stock filter label readable on a phone in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});
  const t=(source:string)=>(DASHBOARD_SOURCE_MESSAGES as Record<string,Record<string,string>>)[locale]?.[source]||source;
  await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/products');await page.evaluate(()=>document.fonts.ready);
  const filter=page.getByRole('combobox',{name:t('Stock level'),exact:true});await expect(filter).toHaveValue('all');
  const metrics=await filter.evaluate(node=>{
   const select=node as HTMLSelectElement,style=getComputedStyle(select),context=document.createElement('canvas').getContext('2d')!;
   context.font=style.font;const label=select.selectedOptions[0].textContent||'',spacing=parseFloat(style.letterSpacing)||0;
   return{label,textWidth:context.measureText(label).width+Math.max(0,label.length-1)*spacing,usableWidth:select.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-20,height:select.getBoundingClientRect().height};
  });
  await info.attach(`stock-filter-label-${locale}`,{body:JSON.stringify(metrics),contentType:'application/json'});
  expect(metrics.textWidth,JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.usableWidth);expect(metrics.height).toBeGreaterThanOrEqual(44);
  await expect(filter.locator('option:checked')).toHaveText(t('All stock'));await expect(filter).toHaveAttribute('aria-label',t('Stock level'));
  await expect(filter.locator('option')).toHaveCount(6);expect(await filter.locator('option').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value))).toEqual(['all','untracked','unknown','out','low','available']);
  await page.screenshot({path:info.outputPath(`products-stock-label-${locale}.png`)});expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
}

for(const [locale,width,height,staff] of [['en',390,844,false],['fr',768,1000,false],['es',1440,1000,false],['zh-CN',844,390,true]] as const){
 test(`Business products populated pickup preserves details through failure recovery and collection in ${locale}${staff?' for permitted staff':''}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale,role:staff?'salon_team':'salon_owner'});
  if(staff)await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{products:true},records:f.records}}));
  const t=(source:string)=>(DASHBOARD_SOURCE_MESSAGES as Record<string,Record<string,string>>)[locale]?.[source]||source;
  const orderId='a4000000-0000-4000-8000-000000000001',reference='GC-PICKUP-OWN-1042',failureId='a4000000-0000-4000-8000-000000000099',warningId='a4000000-0000-4000-8000-000000000098';
  let order={id:orderId,salon_id:f.business.id,public_reference:reference,guest_name:'Fixture Pickup Customer',fulfillment_method:'Pickup',fulfillment_status:'New',reservation_status:'Reserved',payment_status:'Deposit paid',total_amount:80,deposit_amount:10,remaining_balance:70,pickup_deadline:'2026-09-24T18:30:00Z',created_at:'2026-09-19T12:00:00Z',items:[{id:'a4000000-0000-4000-8000-000000000002',order_id:orderId,product_name:'Fixture Coconut Oil',quantity:2,line_total:60},{id:'a4000000-0000-4000-8000-000000000003',order_id:orderId,product_name:'Fixture Styling Comb',quantity:1,line_total:20}]};
  const posts:Record<string,unknown>[]=[];let firstPost=true,reads=0;
  let observePost!:()=>void,releasePost!:()=>void;const postObserved=new Promise<void>(resolve=>{observePost=resolve;}),postReleased=new Promise<void>(resolve=>{releasePost=resolve;});
  await page.route('**/api/salon/product-orders',async route=>{
   expect(route.request().headers().authorization).toMatch(/^Bearer /);
   if(route.request().method()==='GET'){reads++;return route.fulfill({json:{orders:[order]}});}
   expect(route.request().method()).toBe('POST');const body=route.request().postDataJSON() as Record<string,unknown>;posts.push(body);
   expect(body).toEqual({order_id:orderId,fulfillment_status:body.fulfillment_status,carrier:'',tracking_number:'',note:''});
   if(firstPost){firstPost=false;expect(body.fulfillment_status).toBe('Ready for pickup');observePost();await postReleased;return route.fulfill({status:503,headers:{'X-Request-ID':failureId},json:{error:`We couldn't update this order. Please try again or contact support with reference ${failureId}.`,request_id:failureId}});}
   const current=order.reservation_status,next=String(body.fulfillment_status);expect([[current,next]]).toEqual([[current,current==='Reserved'?'Ready for pickup':'Collected']]);order={...order,reservation_status:next};
   return route.fulfill({json:{order,warnings:next==='Ready for pickup'?[{message:`The status was saved, but a notification needs attention. Reference ${warningId}.`,request_id:warningId}]:[]}});
  });
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/products');
  const section=page.locator('#product-orders'),card=section.getByRole('article').filter({has:page.getByText(reference,{exact:true})});
  await expect(card).toBeVisible();await expect(card).toContainText('Fixture Pickup Customer');await expect(card).toContainText('2× Fixture Coconut Oil');await expect(card).toContainText('1× Fixture Styling Comb');
  const intl=locale==='fr'?'fr-FR':locale==='es'?'es-US':locale==='zh-CN'?'zh-CN':'en-US',money=(amount:number)=>new Intl.NumberFormat(intl,{style:'currency',currency:'USD'}).format(amount);
  await expect(card).toContainText(money(80));await expect(card).toContainText(money(10));await expect(card).toContainText(money(70));await expect(card).toContainText(t('Balance at pickup'));await expect(card).toContainText(t('Pickup by'));await expect(card).toContainText('2026');
  await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('product-pickup-populated.png'),fullPage:false});
  await card.getByRole('button',{name:t('Ready for pickup'),exact:true}).click();await postObserved;
  try{await expect(card.getByRole('button',{name:t('Canceled'),exact:true})).toBeDisabled();await expect(card.getByRole('button',{name:t('Collected'),exact:true})).toHaveCount(0);expect(posts).toHaveLength(1);}finally{releasePost();}
  await expect(section.getByRole('status')).toContainText(failureId);await expect(card.getByRole('button',{name:t('Ready for pickup'),exact:true})).toBeEnabled();await expect(card.getByText(t('Reserved'),{exact:true})).toBeVisible();await expect(card.getByRole('button',{name:t('Collected'),exact:true})).toHaveCount(0);expect(order.reservation_status).toBe('Reserved');
  await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('product-pickup-status-failure.png'),fullPage:false});
  await card.getByRole('button',{name:t('Ready for pickup'),exact:true}).click();await expect(section.getByRole('status')).toContainText(warningId);await expect(section.getByRole('status')).not.toContainText(failureId);await expect(card.getByRole('button',{name:t('Collected'),exact:true})).toBeVisible();expect(posts).toHaveLength(2);
  const beforeRefresh=reads;await section.getByRole('button',{name:t('Refresh'),exact:true}).click();await expect.poll(()=>reads).toBeGreaterThan(beforeRefresh);await expect(section.getByRole('status')).toHaveCount(0);await expect(card.getByText(t('Ready for pickup'),{exact:true})).toBeVisible();
  await card.getByRole('button',{name:t('Collected'),exact:true}).click();await expect(card.getByText(t('Collected'),{exact:true})).toBeVisible();await expect(card.getByRole('button')).toHaveCount(0);expect(posts.map(row=>row.fulfillment_status)).toEqual(['Ready for pickup','Ready for pickup','Collected']);
  await page.reload();await expect(card.getByText(t('Collected'),{exact:true})).toBeVisible();await expect(card).toContainText(money(70));await expect(card.getByRole('button')).toHaveCount(0);expect(posts).toHaveLength(3);
  await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('product-pickup-collected.png'),fullPage:false});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
}

test('Business products populated shipping order keeps saved tracking after explicit prompt confirmation and reload',async({page},info)=>{
 const f=await p0OwnerFixture(page,{populated:true});const reference='GC-SHIP-OWN-1043',orderId='a4000000-0000-4000-8000-000000000004';
 let order={id:orderId,salon_id:f.business.id,public_reference:reference,guest_name:'Fixture Shipping Customer',fulfillment_method:'Shipping',fulfillment_status:'Preparing',reservation_status:null,total_amount:46,payment_status:'Paid',carrier:'',tracking_number:'',created_at:'2026-09-19T12:00:00Z',items:[{id:'a4000000-0000-4000-8000-000000000005',order_id:orderId,product_name:'Fixture Styling Set',quantity:1,line_total:46}]};const posts:Record<string,unknown>[]=[];
 await page.route('**/api/salon/product-orders',async route=>{if(route.request().method()==='GET')return route.fulfill({json:{orders:[order]}});const body=route.request().postDataJSON();posts.push(body);expect(body).toEqual({order_id:orderId,fulfillment_status:'Shipped',carrier:'Fixture Carrier',tracking_number:'OWN-TRACK-0001043',note:''});order={...order,fulfillment_status:'Shipped',carrier:body.carrier,tracking_number:body.tracking_number};return route.fulfill({json:{order}});});
 await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/products');const section=page.locator('#product-orders'),card=section.getByRole('article').filter({has:page.getByText(reference,{exact:true})});
 await expect(card).toContainText('Fixture Shipping Customer');await expect(card).toContainText('1× Fixture Styling Set');await expect(card).toContainText('$46.00');await expect(card.getByRole('button',{name:'Ready for Pickup',exact:true})).toHaveCount(0);
 let dialogs=0;const cancelPrompts=async(dialog:import('@playwright/test').Dialog)=>{dialogs++;await dialog.dismiss();};page.on('dialog',cancelPrompts);await card.getByRole('button',{name:'Shipped',exact:true}).click();await expect(section.getByRole('status')).toHaveText('Carrier and tracking number are required to mark shipped.');page.off('dialog',cancelPrompts);expect(dialogs).toBe(2);expect(posts).toHaveLength(0);await expect(card.getByText('Preparing',{exact:true})).toBeVisible();
 const promptMessages:string[]=[];const confirmPrompts=async(dialog:import('@playwright/test').Dialog)=>{promptMessages.push(dialog.message());await dialog.accept(promptMessages.length===1?'Fixture Carrier':'OWN-TRACK-0001043');};page.on('dialog',confirmPrompts);await card.getByRole('button',{name:'Shipped',exact:true}).click();await expect(card.getByText('Shipped',{exact:true})).toBeVisible();page.off('dialog',confirmPrompts);expect(promptMessages).toEqual(['Shipping carrier (for example, USPS)','Tracking number']);expect(posts).toHaveLength(1);await expect(card).toContainText('Fixture Carrier tracking:');await expect(card).toContainText('OWN-TRACK-0001043');
 await page.reload();await expect(card.getByText('Shipped',{exact:true})).toBeVisible();await expect(card).toContainText('OWN-TRACK-0001043');await expect(card.getByRole('button',{name:'Delivered',exact:true})).toBeVisible();await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('product-shipping-saved-tracking.png'),fullPage:false});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(posts).toHaveLength(1);expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
});

for(const locale of ['en','fr','es','zh-CN'] as const)for(const width of [320,390]){
 test(`Business products compact controls keep heading metrics and selected stock labels readable in ${locale} at ${width}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});const t=(source:string)=>(DASHBOARD_SOURCE_MESSAGES as Record<string,Record<string,string>>)[locale]?.[source]||source;
  await page.setViewportSize({width,height:844});await page.goto('/salon/dashboard/products');await page.evaluate(()=>document.fonts.ready);
  const catalog=page.getByRole('region',{name:t('Product catalog'),exact:true}),heading=catalog.getByRole('heading',{name:t('Products'),exact:true}),add=catalog.getByRole('link',{name:t('Add Product'),exact:true}).first();
  await expect(heading).toBeVisible();await expect(add).toBeVisible();
  const headingText=await heading.evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);return [...range.getClientRects()].map(rect=>({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}));}),button=await add.boundingBox();
  const stats=[];for(const source of ['Total products','Published','Low stock','Out of stock']){
   const label=catalog.locator('div.grid > div > p.text-xs').filter({hasText:new RegExp(`^${t(source).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`)}).first();
   await expect(label).toBeVisible();stats.push(await label.evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const card=node.parentElement!.getBoundingClientRect();return {text:node.textContent,card:{left:card.left,right:card.right,top:card.top,bottom:card.bottom},lines:[...range.getClientRects()].map(rect=>({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}))};}));
  }
  const filter=catalog.getByRole('combobox',{name:t('Stock level'),exact:true});await expect(filter).toHaveValue('all');
  await page.screenshot({path:info.outputPath(`products-compact-${locale}-${width}.png`)});
  const stock=[];for(const value of ['all','untracked','unknown','out','low','available']){await filter.selectOption(value);await expect(filter).toHaveValue(value);stock.push(await filter.evaluate(node=>{const select=node as HTMLSelectElement,style=getComputedStyle(select),context=document.createElement('canvas').getContext('2d')!;context.font=style.font;const label=select.selectedOptions[0].textContent||'',spacing=parseFloat(style.letterSpacing)||0;return {value:select.value,label,textWidth:context.measureText(label).width+Math.max(0,label.length-1)*spacing,usableWidth:select.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-20,height:select.getBoundingClientRect().height};}));}
  await info.attach('compact-products-geometry',{body:JSON.stringify({headingText,button,stats,stock}),contentType:'application/json'});
  expect(button).not.toBeNull();for(const line of headingText){const overlap=Boolean(button&&line.left<button.x+button.width&&line.right>button.x&&line.top<button.y+button.height&&line.bottom>button.y);expect.soft(overlap,'Heading text must not overlap the Add Product control').toBe(false);expect.soft(line.left).toBeGreaterThanOrEqual(0);expect.soft(line.right).toBeLessThanOrEqual(width);}
  for(const stat of stats)for(const line of stat.lines){expect.soft(line.left,stat.text||'stat label').toBeGreaterThanOrEqual(stat.card.left+1);expect.soft(line.right,stat.text||'stat label').toBeLessThanOrEqual(stat.card.right-1);}
  for(const item of stock){expect.soft(item.textWidth,JSON.stringify(item)).toBeLessThanOrEqual(item.usableWidth);expect.soft(item.height).toBeGreaterThanOrEqual(44);}
  expect(button!.height).toBeGreaterThanOrEqual(44);await filter.selectOption('all');await expect(catalog.getByRole('article')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
}
