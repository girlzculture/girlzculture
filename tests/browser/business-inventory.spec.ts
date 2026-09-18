import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
import {summarizeOperatingBooks,type OperatingBooks} from '../../src/lib/businessFinanceCore';

test.use({serviceWorkers:'block'});
for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Business inventory product sale keeps identity, quantity and total in ${locale}`,async({page})=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});const t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  const product=f.records.salon_products[0];const books:OperatingBooks={sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]};const calls:Record<string,unknown>[]=[];
  await page.route('**/api/salon/finances**',async route=>{
   const url=new URL(route.request().url());
   if(route.request().method()==='GET'){
    if(url.searchParams.has('options'))return route.fulfill({json:{stylists:f.records.stylists,products:[product]}});
    return route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(f.business.id,books,{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:f.business.time_zone}),evidence:{},stylists:f.records.stylists,arrangements:[]}});
   }
   const body=route.request().postDataJSON();calls.push(body);expect(body.action).toBe('sale');expect(body.payload.product_id).toBe(product.id);expect(body.payload.quantity).toBe(2);expect(body.payload.list_cents).toBe(5000);expect(body.payload.cost_cents).toBe(1000);expect(body.payload.method).toBe('cash');
   const now=new Date().toISOString();books.sales.push({...body.payload,id:'sale:inventory-sale',salon_id:f.business.id,name:String(product.name),source:'walk_in',kind:'product',occurred_at:now,recorded_at:now,status:'completed',client_id:null,client_name:null,stylist_id:null,discount_cents:0,agreed_cents:5000,compensation:{kind:'none',version:null}});
   books.payments.push({id:'receipt:inventory-sale',salon_id:f.business.id,sale_id:'sale:inventory-sale',occurred_at:now,stage:'full',method:'cash',amount_cents:5000,original_payment_id:null});
   return route.fulfill({json:{id:'inventory-sale',verified:true}});
  });
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings');
  const finances=page.getByRole('region',{name:t('Finances'),exact:true});await expect(finances.getByRole('status').filter({hasText:t('Loading finance records…')})).toHaveCount(0);
  await finances.getByRole('button',{name:t('Record a sale'),exact:true}).click();const form=finances.getByRole('form',{name:t('Record a sale'),exact:true});
  await form.getByLabel(t('Type'),{exact:true}).selectOption('product');await form.getByLabel(t('Catalog product'),{exact:true}).selectOption(String(product.id));
  await form.getByLabel(t('Quantity sold'),{exact:true}).fill('2');await form.getByLabel(t('Price paid'),{exact:true}).fill('50');await form.getByLabel(t('Known cost (optional)'),{exact:true}).fill('10');
  await form.getByRole('button',{name:t('Save record'),exact:true}).click();await expect(finances.getByRole('status').filter({hasText:t('Record saved. No payment was processed.')})).toHaveText(t('Record saved. No payment was processed.'));
  await page.reload();await expect(finances.locator('[data-finance-sale]:visible').getByText(String(product.name),{exact:true})).toBeVisible();expect(calls).toHaveLength(1);expect(f.unexpected).toEqual([]);
 });
 test(`Business inventory protects failed entries, restocks and refresh in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{locale,populated:true});const t=(s:string)=>DASHBOARD_SOURCE_MESSAGES[locale]?.[s]||s;
  const product={id:String(f.records.salon_products[0].id),name:'Growth Oil',inventory_quantity:2,stock_revision:1,low_stock_threshold:3,track_inventory:true,unit:'units'};
  const supplies:Record<string,unknown>[]=[];const mutations:Record<string,unknown>[]=[];let fail=true;
  await page.route('**/api/salon/inventory',async route=>{
   if(route.request().method()==='GET')return route.fulfill({json:{products:[product],supplies,movements:[],history_limit:250}});
   const body=route.request().postDataJSON();mutations.push(body);
   if(fail){fail=false;return route.fulfill({status:500,json:{code:'STOCK_UNAVAILABLE',request_id:'99000000-0000-4000-8000-000000000071'}});}
   if(body.action==='create_supply'){supplies.push({id:'33000000-0000-4000-8000-000000000080',...body.payload,inventory_quantity:body.payload.quantity,stock_revision:1,track_inventory:true});return route.fulfill({json:{verified:true}});}
   expect(body.payload.product_id).toBe(product.id);
   if(body.payload.expected_revision!==product.stock_revision)return route.fulfill({status:409,json:{code:'STOCK_REVISION_CONFLICT',request_id:'99000000-0000-4000-8000-000000000072'}});
   if(body.action==='restock')product.inventory_quantity+=body.payload.quantity;
   else if(body.action==='correction')product.inventory_quantity=body.payload.quantity;
   else throw Error(`Unexpected inventory action ${body.action}`);
   product.stock_revision++;return route.fulfill({json:{verified:true}});
  });
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/products?tab=inventory');
  const inventory=page.getByRole('region',{name:t('Stock and supplies'),exact:true});await expect(inventory.getByRole('article',{name:'Growth Oil'})).toContainText(t('Low stock'));
  await inventory.getByRole('button',{name:t('Add supply'),exact:true}).click();let form=inventory.getByRole('form',{name:t('Add supply'),exact:true});
  await form.getByLabel(t('Supply name'),{exact:true}).fill('Gloves');await form.getByLabel(t('Unit label'),{exact:true}).fill('boxes');await form.getByLabel(t('Quantity'),{exact:true}).fill('2');await form.getByLabel(t('Low-stock alert at'),{exact:true}).fill('3');
  await form.getByRole('button',{name:t('Save stock change'),exact:true}).click();await expect(inventory.getByRole('alert')).toContainText('99000000-0000-4000-8000-000000000071');await expect(form.getByLabel(t('Supply name'),{exact:true})).toHaveValue('Gloves');
  await form.getByRole('button',{name:t('Save stock change'),exact:true}).click();await expect(inventory.getByRole('article',{name:'Gloves',exact:true})).toContainText(t('Low stock'));
  expect(mutations[0].request_id).toBe(mutations[1].request_id);
  await inventory.getByRole('article',{name:'Growth Oil'}).getByRole('button',{name:t('Restock'),exact:true}).click();form=inventory.getByRole('form',{name:t('Restock'),exact:true});await form.getByLabel(t('Quantity'),{exact:true}).fill('4');
  // Simulate an order taking stock after the form opened: its original revision must be rejected.
  product.inventory_quantity=1;product.stock_revision++;
  await form.getByRole('button',{name:t('Save stock change'),exact:true}).click();await expect(inventory.getByRole('alert')).toContainText('99000000-0000-4000-8000-000000000072');await expect(form.getByLabel(t('Quantity'),{exact:true})).toHaveValue('4');
  await form.getByRole('button',{name:t('Cancel'),exact:true}).click();await inventory.getByRole('button',{name:t('Reload'),exact:true}).click();await expect(inventory.getByRole('article',{name:'Growth Oil'}).locator('strong')).toContainText('1');
  await inventory.getByRole('article',{name:'Growth Oil'}).getByRole('button',{name:t('Restock'),exact:true}).click();form=inventory.getByRole('form',{name:t('Restock'),exact:true});await form.getByLabel(t('Quantity'),{exact:true}).fill('4');await form.getByRole('button',{name:t('Save stock change'),exact:true}).click();await expect(inventory.getByRole('article',{name:'Growth Oil'})).toContainText(t('In stock'));
  await page.reload();await expect(inventory.getByRole('article',{name:'Growth Oil'}).locator('strong')).toContainText('5');await expect(inventory.getByRole('article',{name:'Gloves',exact:true})).toContainText('boxes');
  await inventory.getByRole('article',{name:'Growth Oil'}).getByRole('button',{name:t('Correct stock'),exact:true}).click();form=inventory.getByRole('form',{name:t('Correct stock'),exact:true});await form.getByLabel(t('Actual quantity available'),{exact:true}).fill('0');await form.getByLabel(t('Reason / note'),{exact:true}).fill('Physical stock count');await form.getByRole('button',{name:t('Save stock change'),exact:true}).click();await expect(inventory.getByRole('article',{name:'Growth Oil'})).toContainText(t('Out of stock'));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:info.outputPath('inventory-final.png')});expect(f.unexpected).toEqual([]);
 });
}
