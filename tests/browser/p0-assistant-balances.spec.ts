import {expect,type Page} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {ASSISTANT_BALANCES_COPY} from '../../src/i18n/assistant-balances-copy';
import {DASHBOARD_SOURCE_MESSAGES} from '../../src/i18n/dashboard-source-catalog';
import {summarizeOperatingBooks,type OperatingBooks,type OperatingSale} from '../../src/lib/businessFinanceCore';
import {intlLocale} from '../../src/i18n/catalog';

test.use({serviceWorkers:'block'});
const id=(n:number)=>`17900000-0000-4000-8000-${String(n).padStart(12,'0')}`;
type Locale=keyof typeof ASSISTANT_BALANCES_COPY;
async function fixture(page:Page,locale:Locale='en',mode:'normal'|'unavailable'|'limited'='normal'){
 const f=await p0OwnerFixture(page,{populated:true,locale});let writes=0;
 const sale=(n:number,patch:Partial<OperatingSale>={}):OperatingSale=>({id:`sale:${id(n)}`,salon_id:f.business.id,source:'walk_in',kind:'service',status:'completed',occurred_at:'2026-08-15T15:00:00Z',recorded_at:'2026-08-15T15:00:00Z',name:`Silk Press ${n}`,stylist_id:f.ids.professional,client_id:null,client_name:`Own Client ${n}`,list_cents:10000,discount_cents:0,agreed_cents:10000,cost_cents:null,quantity:1,compensation:{kind:'none',version:null},...patch});
 const completed=mode==='limited'?Array.from({length:13},(_,index)=>sale(index+10)):[sale(10)];
 const books:OperatingBooks={sales:[...completed,sale(90,{name:'Future service',status:'pending',occurred_at:'2026-09-25T15:00:00Z',client_name:null,agreed_cents:5000,list_cents:5000})],payments:[{id:'receipt:partial',salon_id:f.business.id,sale_id:completed[0].id,occurred_at:'2026-09-15T15:00:00Z',stage:'deposit',method:'cash',amount_cents:2500,original_payment_id:null}],expenses:[],obligations:[],compensation_payments:[]};
 const entry=(row:OperatingSale)=>({record:row.id,client_name:row.client_name,service_name:row.name,unpaid_cents:row.id===completed[0].id?7500:row.agreed_cents,href:`/salon/dashboard/earnings?${new URLSearchParams({finance:'transactions',finance_from:'2026-09-01',finance_to:'2026-09-18',finance_balance:'unpaid',finance_record:row.id})}`});
 const result={available:mode!=='unavailable',as_of_day:'2026-09-18',currency:'USD',capped_at:12,completed:mode==='unavailable'?[]:completed.slice(0,12).map(entry),pending:mode==='unavailable'?[]:[entry(books.sales.at(-1)!)],completed_count:mode==='unavailable'?null:completed.length,pending_count:mode==='unavailable'?null:1,completed_unpaid_cents:mode==='unavailable'?null:completed.length*10000-2500,pending_unpaid_cents:mode==='unavailable'?null:5000};
 await page.route('**/api/salon/finances?*',route=>{const url=new URL(route.request().url());if(route.request().method()!=='GET')writes++;if(url.searchParams.has('options'))return route.fulfill({json:{stylists:f.records.stylists,products:[]}});return route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(f.business.id,books,{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:f.business.time_zone}),evidence:{},stylists:f.records.stylists,arrangements:[]}});});
 await page.route('**/api/salon/assistant',route=>{const input=route.request().postDataJSON();expect(input.action).toBe('plan');expect(input.locale).toBe(locale);return route.fulfill({json:{request:{id:input.request_id,tool:'get_outstanding_balances',risk_class:1,arguments:{start:'2026-09-01T04:00:00Z',end:'2026-09-19T04:00:00Z'},result},result,answer:ASSISTANT_BALANCES_COPY[locale].title}});});
 return {f,result,writes:()=>writes};
}
async function ask(page:Page,locale:Locale){
 await page.goto('/salon/dashboard/earnings');await expect(page.locator('[data-owner-workspace]')).toBeVisible();
 const dialog=page.getByRole('dialog',{name:'GC Assistant',exact:true});if(!await dialog.isVisible())await page.getByRole('button',{name:'GC Assistant',exact:true}).click();
 await dialog.locator('textarea').fill('Who owes me money? Separate completed recorded balances from pending appointments.');await dialog.getByRole('button',{name:DASHBOARD_SOURCE_MESSAGES[locale]?.['Ask GC Assistant']||'Ask GC Assistant',exact:true}).click();
 return dialog.getByRole('region',{name:ASSISTANT_BALANCES_COPY[locale].title,exact:true});
}
for(const [locale,width,height] of [['en',390,844],['fr',768,1000],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`P0 Assistant outstanding balances preserves facts and opens the older exact finance record in ${locale}`,async({page},info)=>{
  const {f,writes}=await fixture(page,locale);const copy=ASSISTANT_BALANCES_COPY[locale];await page.setViewportSize({width,height});const card=await ask(page,locale);
  await expect(card).toBeVisible();await expect(card).toContainText('Own Client 10 · Silk Press 10');await expect(card).toContainText(`${copy.unnamed} · Future service`);await expect(card).toContainText('2026-09-18');
  const money=(amount:number)=>new Intl.NumberFormat(intlLocale(locale),{style:'currency',currency:'USD'}).format(amount);await expect(card.getByText(money(75),{exact:true})).toBeVisible();await expect(card.getByText(money(50),{exact:true})).toBeVisible();await expect(card.getByText(copy.caveat,{exact:true})).toBeVisible();
  await card.getByRole('link',{name:copy.open,exact:true}).first().scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`assistant-balances-${locale}.png`)});
  await card.getByRole('link',{name:copy.open,exact:true}).first().click();await expect(page).toHaveURL(/finance_record=sale%3A17900000-0000-4000-8000-000000000010/);await expect(page).toHaveURL(/finance_from=2026-09-01/);await expect(page).toHaveURL(/finance_to=2026-09-18/);
  const visibleRows=page.locator('[data-finance-sale]:visible');await expect(visibleRows).toHaveCount(1);await expect(visibleRows).toContainText('Silk Press 10');await expect(visibleRows).toContainText(new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(75));await expect(visibleRows).not.toContainText('Future service');
  await page.reload();await expect(visibleRows).toHaveCount(1);await expect(visibleRows).toContainText('Own Client 10');expect(writes()).toBe(0);expect(f.unexpected).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}
test('P0 Assistant outstanding balances shows unavailable payment evidence without zero or customer debt',async({page})=>{
 const {writes}=await fixture(page,'en','unavailable');const card=await ask(page,'en');await expect(card.getByText(ASSISTANT_BALANCES_COPY.en.incomplete,{exact:true})).toBeVisible();await expect(card.getByRole('link',{name:ASSISTANT_BALANCES_COPY.en.open,exact:true})).toHaveCount(0);await expect(card).not.toContainText('Own Client');await expect(card).not.toContainText('$0');await expect(card.getByRole('link',{name:ASSISTANT_BALANCES_COPY.en.all,exact:true})).toBeVisible();expect(writes()).toBe(0);
});
test('P0 Assistant outstanding balances keeps bounded records and explicit full counts',async({page})=>{
 await fixture(page,'en','limited');const card=await ask(page,'en');await expect(card.getByRole('heading',{name:'Completed sales (13)',exact:true})).toBeVisible();await expect(card.getByRole('link',{name:ASSISTANT_BALANCES_COPY.en.open,exact:true})).toHaveCount(13);await expect(card.getByText(ASSISTANT_BALANCES_COPY.en.limited,{exact:true})).toBeVisible();await expect(card).not.toContainText('Own Client 22');
});
