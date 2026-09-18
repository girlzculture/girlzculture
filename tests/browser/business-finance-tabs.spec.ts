import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {BUSINESS_FINANCE_SOURCE_MESSAGES as messages} from '../../src/i18n/business-finance-source-catalog';
import AxeBuilder from '@axe-core/playwright';
import {summarizeOperatingBooks,type OperatingBooks} from '../../src/lib/businessFinanceCore';
test.use({serviceWorkers:'block'});

for(const [locale,width,height] of [['en',1440,1000],['fr',390,844],['es',768,1000],['zh-CN',844,390]] as const){
 test(`Business finance tabs preserve real content, filters and repeated entry in ${locale} at ${width}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});const t=(s:string)=>messages[locale]?.[s]||s;
  const at=new Date().toISOString();const books:OperatingBooks={sales:[{id:'sale:fixture',salon_id:f.business.id,source:'walk_in',kind:'service',occurred_at:at,recorded_at:at,status:'completed',name:'Silk Press',stylist_id:f.ids.professional,client_id:null,client_name:null,list_cents:10000,discount_cents:0,agreed_cents:10000,cost_cents:null,quantity:1,compensation:{kind:'none',version:null}}],payments:[{id:'receipt:fixture',salon_id:f.business.id,sale_id:'sale:fixture',occurred_at:at,stage:'full',method:'cash',amount_cents:10000,original_payment_id:null}],expenses:[{id:'expense:fixture',salon_id:f.business.id,occurred_at:at,category:'Supplies',amount_cents:500,treatment:'operating'}],obligations:[],compensation_payments:[]};
  await page.route('**/api/salon/finances?*',async route=>{
   const url=new URL(route.request().url());if(url.searchParams.get('options'))return route.fulfill({json:{stylists:f.records.stylists}});
   return route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(f.business.id,books,{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:f.business.time_zone}),stylists:f.records.stylists,arrangements:[],evidence:{}}});
  });
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings');
  const tabs=page.getByRole('tablist',{name:t('Finance workspace')});
  await expect(tabs.getByRole('tab',{name:t('Overview'),exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('heading',{name:t('Completed sales by day'),exact:true})).toBeVisible();
  await tabs.getByRole('tab',{name:t('Transactions'),exact:true}).click();
  const search=page.getByRole('textbox',{name:t('Search finance records')});await search.fill('Silk');
  await page.getByRole('combobox',{name:t('Balance filter')}).selectOption('unpaid');
  await expect(page).toHaveURL(/finance=transactions/);
  await tabs.getByRole('tab',{name:t('Expenses'),exact:true}).click();
  await expect(page.getByRole('heading',{name:t('Expense records'),exact:true})).toBeVisible();
  await expect(page.getByText('Supplies',{exact:true}).last()).toBeVisible();
  await expect(search).not.toBeVisible();
  await page.goBack();await expect(search).toHaveValue('Silk');await expect(page.getByRole('combobox',{name:t('Balance filter')})).toHaveValue('unpaid');
  await page.reload();await expect(search).toHaveValue('Silk');
  await tabs.getByRole('tab',{name:t('Reports'),exact:true}).click();
  await expect(page.getByRole('button',{name:t('Download PDF'),exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:t('Daily close'),exact:true})).toBeVisible();
  const daily=page.getByRole('heading',{name:t('Daily close'),exact:true}).locator('..');
  await expect(daily.getByText(new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(100),{exact:true}).first()).toBeVisible();
  await expect(page.getByRole('heading',{name:t('Sales and balances'),exact:true})).not.toBeVisible();
  await tabs.getByRole('tab',{name:t('Overview'),exact:true}).focus();await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab',{name:t('Transactions'),exact:true})).toBeFocused();
  await page.keyboard.press('Enter');await expect(search).toBeVisible();
  await page.getByRole('button',{name:t('Record a sale'),exact:true}).click();
  const form=page.getByRole('form',{name:t('Record a sale'),exact:true});await form.getByLabel(t('Service or product'),{exact:true}).fill('Unsaved draft');
  await tabs.getByRole('tab',{name:t('Reports'),exact:true}).click();await expect(form.getByLabel(t('Service or product'),{exact:true})).toHaveValue('Unsaved draft');
  await form.getByRole('button',{name:t('Cancel'),exact:true}).click();
  await expect(form).not.toBeVisible();await expect(page.getByRole('heading',{name:t('Daily close'),exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const audit=await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(audit.violations).toEqual([]);
  await page.screenshot({path:info.outputPath('finance-tabbed-reports.png'),fullPage:true});expect(f.unexpected).toEqual([]);
 });
}
