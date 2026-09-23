import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {createStoredCustomerLocation} from '../../src/lib/location';
import {ACTIVE_BUSINESS_CATEGORIES,categoryOpeningMessage} from '../../src/lib/businessCategories';
import {MASTER_BUILD_COPY} from '../../src/i18n/master-build-source-catalog';
test.use({serviceWorkers:'block'});
const fixtureBusiness={id:'category-existing-business',name:'Available Hair Fixture',slug:'available-hair-fixture',address_city:'New York',address_state:'NY',borough:'Harlem',cover_photo_url:'/images/business/hair-service.avif',verification_status:'Verified',rating_overall:4.8,review_count:25,latitude:40.8116,longitude:-73.9465,starting_price:100,services:[{id:'category-service',name:'Knotless Braids'}],distance_miles:0.2,total_count:1,sponsored:false};
test.beforeEach(async({page})=>{
 await page.addInitScript(stored=>{localStorage.setItem('girlz-culture-customer-location-v1',JSON.stringify(stored));localStorage.setItem('girlz-culture-mobile-location-prompt-v1',JSON.stringify({dismissedAt:Date.now(),outcome:'manual'}));},createStoredCustomerLocation({lat:40.81,lng:-73.94,label:'Harlem',source:'explicit'}));
 await page.route('**/api/discovery/salons?**',route=>route.fulfill({json:{salons:[fixtureBusiness],total:1}}));
});
test('Master category pages preserve six waitlists and real available business results',async({page})=>{
 for(const category of ACTIVE_BUSINESS_CATEGORIES.filter(row=>!row.live)){
  await page.goto(`/categories/${category.slug}`);
  await expect(page.getByRole('heading',{level:1})).toHaveText(category.name);
  const hero=page.locator('section img').first();await hero.scrollIntoViewIfNeeded();await expect.poll(()=>hero.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(page.locator('main')).toContainText(categoryOpeningMessage(category.name));
  await expect(page.getByRole('link',{name:'Join the business waitlist'})).toHaveAttribute('href',`/business/waitlist?category=${category.slug}`);
  await expect(page.locator('[data-home-salon-section="nearby"]')).toContainText(fixtureBusiness.name);
  await page.getByRole('link',{name:'Join the business waitlist'}).click();
  await expect(page.locator('input[name="business_type"]')).toHaveValue(category.name);
  await expect(page.locator('form input')).toHaveCount(6);
  await expect(page.locator('form input[type="file"],form select,form textarea')).toHaveCount(0);
  await expect(page.locator('form button[type="submit"]')).toHaveCount(1);
  expect(await page.locator('form input').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('name')))).toEqual(['business_name','business_address','business_phone','business_email','business_type','website']);
 }
});
for(const [locale,index,width,height]of [['en',0,390,844],['fr',1,768,900],['es',2,1600,1000],['zh-CN',3,844,390]] as const){
 test(`Master category and business navigation translates at ${locale} ${width}x${height}`,async({page},testInfo)=>{
  const copy=(source:string)=>MASTER_BUILD_COPY.find(row=>row[0]===source)?.[index]||source;
  await page.setViewportSize({width,height});
  await page.goto(`/categories/nail-studio?lang=${locale}`);
  await expect(page.getByRole('heading',{level:1})).toHaveText(copy('Nail Studio'));
  await expect(page.getByRole('link',{name:copy('Join the business waitlist')})).toBeVisible();
  await expect(page.locator('[data-home-salon-section="nearby"] h2')).toHaveText(copy('Available Hair & Braiding Businesses'));
  await expect(page.locator('[data-home-salon-section="nearby"]')).toContainText(fixtureBusiness.name);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect.poll(()=>page.locator('section img').first().evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('category.png')});
  if(width<1536)await page.getByRole('button',{name:copy('Open navigation menu')}).click();
  const navigation=width<1536?page.locator('[data-public-mobile-menu]'):page.locator('header');
  const businessMenu=width<1536?navigation.locator('details').filter({has:page.locator('a[href="/business"]')}):navigation.locator('#public-menu-business');
  if(width<1536)await businessMenu.locator('summary').click();else await navigation.locator('button[aria-controls="public-menu-business"]').click();
  for(const label of ['Why Girlz Culture','Pricing & Plans','Apply to Join','Help Center'])await expect(businessMenu.getByRole('link',{name:copy(label),exact:true})).toBeVisible();
  await expect(businessMenu.locator('a[href="/business/signup"]')).toHaveCount(1);
  await businessMenu.getByRole('link',{name:copy('Why Girlz Culture'),exact:true}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText(copy('Why Girlz Culture'));
  await expect(page.getByRole('heading',{name:copy('An AI assistant with you'),exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.reload();await expect(page.getByRole('heading',{level:1})).toHaveText(copy('Why Girlz Culture'));
 });
}
