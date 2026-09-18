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
