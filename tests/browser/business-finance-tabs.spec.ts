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

for(const [locale,width,height] of [['en',1440,1000],['fr',390,844],['es',768,1000],['zh-CN',844,390]] as const){
 test(`Business finance ranked team summary preserves ties and selected-period evidence in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});const t=(source:string)=>messages[locale]?.[source]||source;
  const stylists=Array.from({length:15},(_,index)=>({id:`ranking-professional-${index}`,salon_id:f.business.id,name:`Own professional ${index}`}));
  const books:OperatingBooks={sales:[],payments:[],expenses:[],compensation_payments:[],obligations:stylists.map((row,index)=>({id:`ranking-wage-${index}`,salon_id:f.business.id,stylist_id:row.id,due_at:'2026-09-15T14:00:00Z',kind:'wage',amount_cents:index<13?99000:1000,arrangement_version:'saved'}))};
  await page.route('**/api/salon/finances?*',async route=>{const url=new URL(route.request().url());if(url.searchParams.get('options'))return route.fulfill({json:{stylists:f.records.stylists}});return route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(f.business.id,books,{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:f.business.time_zone}),stylists,arrangements:[],evidence:{}}});});
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings?finance=team&finance_from=2026-09-01&finance_to=2026-09-30');
  const ranking=page.getByRole('region',{name:t('Highest recorded earned compensation'),exact:true});await expect(ranking).toBeVisible();await expect(ranking).toContainText(new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(990));await expect(ranking).toContainText(`${t('Professionals tied at this amount')}: 13`);await expect(ranking).toContainText(`${t('Showing tied leaders')}: 12 / 13`);await expect(ranking.getByRole('listitem')).toHaveCount(12);await expect(ranking).toContainText('2026-09-01');await expect(ranking).toContainText('2026-09-30');await expect(ranking).toContainText(f.business.time_zone);await expect(ranking).toContainText('USD');await expect(ranking).toContainText(t('Commission earned plus wages due in the selected period. Service sales and compensation already paid are separate.'));
  await expect(ranking.getByText(f.business.time_zone,{exact:true})).toHaveAttribute('translate','no');
  await expect(ranking.getByRole('listitem')).toHaveText([0,1,10,11,12,2,3,4,5,6,7,8].map(index=>`Own professional ${index}`));
  for(const item of await ranking.getByRole('listitem').all())await expect(item.locator('span')).toHaveAttribute('translate','no');
  await ranking.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('finance-earned-compensation-ranking.png'),fullPage:false});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const audit=await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(audit.violations).toEqual([]);
  const period=page.getByRole('form',{name:t('Reporting period'),exact:true});await period.getByLabel(t('From'),{exact:true}).fill('2026-08-01');await period.getByLabel(t('To'),{exact:true}).fill('2026-08-31');await period.getByRole('button',{name:t('Apply dates'),exact:true}).click();await expect(ranking).toContainText(t('No assigned professional earnings in this period.'));await expect(ranking.getByRole('listitem')).toHaveCount(0);await expect(ranking).not.toContainText('990');expect(f.unexpected).toEqual([]);
 });
}

test('Business finance ranked team summary is withheld from an own-earnings-only professional',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true,role:'salon_team'});
 await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{earnings_own:true},records:{subscriptions:f.records.subscriptions}}}));
 const books:OperatingBooks={sales:[],payments:[],expenses:[],compensation_payments:[],obligations:[{id:'own-wage',salon_id:f.business.id,stylist_id:f.ids.professional,due_at:'2026-09-15T14:00:00Z',kind:'wage',amount_cents:75000,arrangement_version:'saved'}]};
 await page.route('**/api/salon/finances?*',async route=>{const url=new URL(route.request().url());expect(url.searchParams.get('options')).toBeNull();return route.fulfill({json:{scope:{kind:'own',stylist_id:f.ids.professional},books,summary:summarizeOperatingBooks(f.business.id,books,{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:f.business.time_zone}),stylists:f.records.stylists,arrangements:[],evidence:{}}});});
 await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/earnings?finance=team&finance_from=2026-09-01&finance_to=2026-09-30');
 await expect(page.getByRole('heading',{name:'Stylist earnings',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Highest recorded earned compensation',exact:true})).toHaveCount(0);await expect(page.getByRole('tabpanel',{name:'Team earnings',exact:true})).toContainText('$750.00');expect(f.unexpected).toEqual([]);
});

for(const [locale,width,height] of [['en',1440,1000],['fr',390,844],['es',768,1000],['zh-CN',844,390]] as const){
 test(`Business finance ordinary team cards preserve original collision names in ${locale}`,async({page},info)=>{
  const f=await p0OwnerFixture(page,{populated:true,locale});const t=(source:string)=>messages[locale]?.[source]||source;
  // A saved professional name may legitimately match interface vocabulary.
  // It must remain original even though the ordinary Unassigned fallback translates.
  const stylists=[{id:f.ids.professional,salon_id:f.business.id,name:'Save'}];
  const books:OperatingBooks={
   sales:[{id:'unassigned-name-boundary-sale',salon_id:f.business.id,source:'walk_in',kind:'service',occurred_at:'2026-09-15T14:00:00Z',recorded_at:'2026-09-15T14:00:00Z',status:'completed',name:'Fixture unnamed appointment',stylist_id:null,client_id:null,client_name:null,list_cents:10000,discount_cents:0,agreed_cents:10000,cost_cents:null,quantity:1,compensation:{kind:'none',version:null}}],
   payments:[],expenses:[],compensation_payments:[],obligations:[{id:'professional-name-boundary-wage',salon_id:f.business.id,stylist_id:f.ids.professional,due_at:'2026-09-15T14:00:00Z',kind:'wage',amount_cents:99000,arrangement_version:'saved'}],
  };
  await page.route('**/api/salon/finances?*',async route=>{
   expect(route.request().method()).toBe('GET');expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);
   const url=new URL(route.request().url());if(url.searchParams.get('options'))return route.fulfill({json:{stylists}});
   return route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(f.business.id,books,{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:f.business.time_zone}),stylists,arrangements:[],evidence:{}}});
  });
  await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings?finance=team&finance_from=2026-09-01&finance_to=2026-09-30');
  const section=page.getByRole('heading',{name:t('Stylist earnings'),exact:true}).locator('..');
  // Direct child cards exclude FinanceEarningsLeaders, which already protects names.
  const cards=section.locator(':scope > div.grid > div');await expect(cards).toHaveCount(2);
  const money=(amount:number)=>new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(amount);
  const named=cards.filter({has:page.getByText(money(990),{exact:true})});await expect(named).toHaveCount(1);
  const unassigned=cards.filter({has:page.getByText(t('Unassigned'),{exact:true})});await expect(unassigned).toHaveCount(1);
  await expect(unassigned.locator(':scope > b')).toHaveText(t('Unassigned'));if(locale!=='en')expect(t('Unassigned')).not.toBe('Unassigned');
  await expect(named.getByText(t('Wages due'),{exact:true})).toBeVisible();await expect(named.getByText(money(990),{exact:true})).toBeVisible();
  await named.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`finance-original-name-${locale}.png`)});
  await expect(named.locator(':scope > b')).toHaveText('Save');
  const tabs=page.getByRole('tablist',{name:t('Finance workspace')});await tabs.getByRole('tab',{name:t('Reports'),exact:true}).click();await tabs.getByRole('tab',{name:t('Team earnings'),exact:true}).click();
  await expect(named.locator(':scope > b')).toHaveText('Save');await expect(unassigned.locator(':scope > b')).toHaveText(t('Unassigned'));
  await page.reload();await expect(named.locator(':scope > b')).toHaveText('Save');await expect(named.getByText(money(990),{exact:true})).toBeVisible();await expect(unassigned.locator(':scope > b')).toHaveText(t('Unassigned'));
  expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);
 });
}
