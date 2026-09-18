import { expect } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { summarizeOperatingBooks, type OperatingBooks } from '../../src/lib/businessFinanceCore';
import { BUSINESS_FINANCE_SOURCE_MESSAGES } from '../../src/i18n/business-finance-source-catalog';
import { expectOwnerLocaleCoverage } from './helpers/ownerLocaleCoverage';
import AxeBuilder from '@axe-core/playwright';

test.use({ serviceWorkers: 'block' });
test('Business finance tablet ledger is reachable and scrollable with the keyboard',async({page})=>{
  const fixture=await p0OwnerFixture(page,{locale:'es'});
  const t=(text:string)=>BUSINESS_FINANCE_SOURCE_MESSAGES.es[text]||text;
  await page.setViewportSize({width:768,height:1000});
  await page.goto('/salon/dashboard/earnings');
  const filter=page.getByRole('combobox',{name:t('Balance filter'),exact:true});
  await expect(filter).toBeVisible();
  await filter.focus();await page.keyboard.press('Tab');
  const ledger=page.getByRole('region',{name:t('Sales and balances'),exact:true});
  await expect(ledger).toBeFocused();
  await expect.poll(()=>ledger.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect.poll(()=>ledger.evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);
  const audit=await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);expect(fixture.unexpected).toEqual([]);
});
for(const locale of ['en','fr','es','zh-CN'] as const){
  test(`Business finance downloads use the selected ${locale} language and preserve export failure references`,async({page})=>{
    const fixture=await p0OwnerFixture(page,{populated:true,locale});
    const t=(text:string)=>BUSINESS_FINANCE_SOURCE_MESSAGES[locale]?.[text]||text;
    const books:OperatingBooks={sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]};let fail=true;
    await page.route('**/api/salon/finances**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname.endsWith('/export')){
        expect(url.searchParams.get('locale')).toBe(locale);expect(url.searchParams.has('salon_id')).toBe(false);
        if(fail){fail=false;await route.fulfill({status:503,json:{code:'FINANCE_EXPORT_UNAVAILABLE',request_id:'99000000-0000-4000-8000-000000000079'}});return;}
        await route.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-export-fixture')});return;
      }
      if(url.searchParams.get('options')==='entry'){await route.fulfill({json:{stylists:fixture.records.stylists}});return;}
      await route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(fixture.business.id,books,{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:fixture.business.time_zone}),evidence:{},stylists:fixture.records.stylists,arrangements:[]}});
    });
    await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/earnings');
    const button=page.getByRole('button',{name:t('Download PDF'),exact:true});
    await expect(button).toBeVisible();
    await expectOwnerLocaleCoverage(page,locale);
    await button.click();
    await expect(page.getByRole('alert').filter({hasText:'99000000-0000-4000-8000-000000000079'})).toBeVisible();
    const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);expect(download.suggestedFilename()).toMatch(new RegExp(`-${locale}\\.pdf$`));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(fixture.unexpected).toEqual([]);
  });
}
for (const [width,height] of [[390,844],[768,900],[1440,1000],[844,390]]) {
  test(`Business finance entry retains failed input and prevents duplicate receipts at ${width}x${height}`,async({page},info)=>{
    const fixture=await p0OwnerFixture(page,{populated:true});
    const books: OperatingBooks={sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]};
    const responses=new Map<string,object>();const calls:{request_id:string;payload:Record<string,unknown>}[]=[];let fail=true;
    await page.route('**/api/salon/finances**',async route=>{
      const url=new URL(route.request().url());
      if(route.request().method()==='GET'){
        if(url.searchParams.get('options')==='entry'){await route.fulfill({json:{stylists:fixture.records.stylists}});return;}
        const period={from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:fixture.business.time_zone};
        await route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(fixture.business.id,books,period),evidence:{},stylists:fixture.records.stylists,arrangements:[]}});return;
      }
      const input=route.request().postDataJSON();calls.push(input);
      if(responses.has(input.request_id)){await route.fulfill({json:responses.get(input.request_id)});return;}
      const id=crypto.randomUUID(),at=new Date().toISOString();
      expect(input.action).toBe('sale');expect(input.payload.list_cents).toBe(12550);expect(input.payload.method).toBe('cash');
      books.sales.push({id:`sale:${id}`,salon_id:fixture.business.id,source:'walk_in',kind:'service',name:String(input.payload.name),stylist_id:String(input.payload.stylist_id),client_id:null,client_name:null,list_cents:12550,discount_cents:0,agreed_cents:12550,cost_cents:null,quantity:1,status:'completed',recorded_at:at,occurred_at:at,compensation:{kind:'none',version:null}});
      books.payments.push({id:`receipt:${id}`,salon_id:fixture.business.id,sale_id:`sale:${id}`,occurred_at:at,stage:'full',method:'cash',amount_cents:12550,original_payment_id:null});
      responses.set(input.request_id,{id,verified:true});
      if(fail){fail=false;await route.fulfill({status:503,json:{code:'FINANCE_UNAVAILABLE',request_id:'99000000-0000-4000-8000-000000000077'}});return;}
      await route.fulfill({json:{id,verified:true}});
    });
    await page.setViewportSize({width,height});await page.goto('/salon/dashboard/earnings');
    await expect(page.getByRole('heading',{name:'Finances',exact:true})).toBeVisible();
    await expect(page.getByRole('status').filter({hasText:'Loading finance records'})).toHaveCount(0);
    const saleButton=page.getByRole('button',{name:'Record a sale',exact:true});
    await expect(saleButton).not.toHaveCSS('background-color','rgb(255, 255, 255)');
    await expect(saleButton).not.toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await saleButton.click();
    const form=page.getByRole('form',{name:'Record a sale',exact:true});
    await form.getByLabel('Service or product',{exact:true}).fill('Box Braids GC-2026');
    await form.getByLabel('Price paid',{exact:true}).fill('125.50');
    await form.getByLabel('Stylist',{exact:true}).selectOption(fixture.ids.professional);
    await form.getByRole('button',{name:'Save record',exact:true}).click();
    await expect(page.getByRole('region',{name:'Finances',exact:true}).getByRole('alert')).toContainText('99000000-0000-4000-8000-000000000077');
    await expect(form.getByLabel('Price paid',{exact:true})).toHaveValue('125.50');
    await expect(form.getByLabel('Service or product',{exact:true})).toHaveValue('Box Braids GC-2026');
    await form.getByRole('button',{name:'Save record',exact:true}).click();
    await expect(form).not.toBeVisible();
    await expect(page.getByRole('status').filter({hasText:'Record saved.'})).toContainText('No payment was processed.');
    expect(calls).toHaveLength(2);expect(calls[0].request_id).toBe(calls[1].request_id);expect(books.payments).toHaveLength(1);
    await page.reload();const sale=page.locator('[data-finance-sale]:visible').filter({hasText:'Box Braids GC-2026'});await expect(sale).toHaveCount(1);
    await expect(sale).toContainText('$125.50');
    if(width<768) await expect(sale).toHaveJSProperty('tagName','ARTICLE');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.evaluate(()=>document.fonts.load('500 16px Montserrat'));
    expect(await page.evaluate(()=>performance.getEntriesByType('resource').some(item=>new URL(item.name).pathname==='/fonts/montserrat/Montserrat-Medium.woff2'))).toBe(true);
    expect(await page.evaluate(()=>document.fonts.check('500 16px Montserrat'))).toBe(true);
    await page.getByRole('region',{name:'Finances',exact:true}).locator('header').screenshot({path:info.outputPath('finance-header.png')});
    const typography=await saleButton.evaluate(element=>{
      const style=getComputedStyle(element);return {color:style.color,background:style.backgroundColor,opacity:style.opacity,textFill:style.webkitTextFillColor,font:style.font,fontStatus:document.fonts.status,ancestors:[element.parentElement,element.parentElement?.parentElement].filter(Boolean).map(node=>getComputedStyle(node!).opacity)};
    });
    await info.attach('finance-typography',{body:JSON.stringify(typography),contentType:'application/json'});
    expect(typography.opacity).toBe('1');expect(typography.ancestors.every(value=>value==='1')).toBe(true);
    await page.screenshot({path:info.outputPath('finances.png'),fullPage:true});
    expect(fixture.unexpected).toEqual([]);
  });
}

test('front desk logging permission does not request or render owner finance totals',async({page})=>{
  const fixture=await p0OwnerFixture(page,{populated:true,role:'salon_team'});
  await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:fixture.business,isOwner:false,isTeamMember:true,permissions:{finance_log:true},records:{subscriptions:fixture.records.subscriptions}}}));
  const requests:string[]=[];
  await page.route('**/api/salon/finances**',async route=>{requests.push(route.request().url());expect(new URL(route.request().url()).searchParams.get('options')).toBe('entry');await route.fulfill({json:{stylists:fixture.records.stylists}});});
  await page.goto('/salon/dashboard/earnings');
  await expect(page.getByRole('button',{name:'Record a sale',exact:true})).toBeVisible();
  await expect(page.getByText('This role does not have access to business finance totals.',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Recorded profit',exact:false})).toHaveCount(0);
  expect(requests.length).toBeGreaterThan(0);
});

test('Business finance wage agreement, obligation and partial payment retain separate totals after refresh',async({page})=>{
  const fixture=await p0OwnerFixture(page,{populated:true});
  const books:OperatingBooks={sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]};
  const arrangements:Record<string,unknown>[]=[];const actions:string[]=[];
  await page.route('**/api/salon/finances**',async route=>{
    const url=new URL(route.request().url());
    if(route.request().method()==='GET'){
      if(url.searchParams.has('options')) {await route.fulfill({json:{stylists:fixture.records.stylists}});return;}
      await route.fulfill({json:{scope:{kind:'business'},books,summary:summarizeOperatingBooks(fixture.business.id,books,{from:url.searchParams.get('from')!,to:url.searchParams.get('to')!,timeZone:fixture.business.time_zone}),stylists:fixture.records.stylists,arrangements,evidence:{}}});return;
    }
    const {action,payload}=route.request().postDataJSON();actions.push(action);const id=crypto.randomUUID();
    if(action==='arrangement'){expect(payload.kind).toBe('employee');expect(payload.amount_cents).toBe(10000);arrangements.push({...payload,id,salon_id:fixture.business.id});}
    else if(action==='obligation'){expect(payload.arrangement_version).toBe(arrangements[0].id);books.obligations.push({id,salon_id:fixture.business.id,stylist_id:fixture.ids.professional,kind:'wage',amount_cents:10000,arrangement_version:String(arrangements[0].id),due_at:payload.due_at});}
    else if(action==='compensation_payment'){expect(payload.obligation_id).toBe(books.obligations[0].id);expect(payload.amount_cents).toBe(4000);books.compensation_payments.push({...payload,id,salon_id:fixture.business.id,occurred_at:new Date().toISOString()});}
    else throw Error(`Unexpected action ${action}`);
    await route.fulfill({json:{id,verified:true}});
  });
  await page.setViewportSize({width:390,height:844});await page.goto('/salon/dashboard/earnings');
  const region=page.getByRole('region',{name:'Compensation and rent',exact:true});
  await region.getByRole('button',{name:'Set an arrangement',exact:true}).click();
  let form=region.getByRole('form',{name:'Set an arrangement',exact:true});
  await form.getByLabel('Arrangement type',{exact:true}).selectOption('employee');
  await form.getByLabel('Stylist',{exact:true}).selectOption(fixture.ids.professional);
  await form.getByLabel('Agreed amount',{exact:true}).fill('100');
  await form.getByRole('button',{name:'Save record',exact:true}).click();await expect(form).toHaveCount(0);
  await region.getByRole('button',{name:'Record wage or rent due',exact:true}).click();
  form=region.getByRole('form',{name:'Record wage or rent due',exact:true});
  await form.getByLabel('Arrangement',{exact:true}).selectOption(String(arrangements[0].id));
  await form.getByRole('button',{name:'Save record',exact:true}).click();await expect(form).toHaveCount(0);
  await region.getByRole('button',{name:'Record payment',exact:true}).click();
  form=region.getByRole('form',{name:'Record compensation payment',exact:true});
  await form.getByLabel('Arrangement type',{exact:true}).selectOption('wage');
  await form.getByLabel('Recorded obligation',{exact:true}).selectOption(books.obligations[0].id);
  await form.getByLabel('Amount paid',{exact:true}).fill('40');
  await form.getByRole('button',{name:'Save record',exact:true}).click();await expect(form).toHaveCount(0);
  await page.reload();await expect(region.getByText('Outstanding compensation',{exact:true}).locator('..')).toContainText('$60.00');
  await expect(page.getByRole('heading',{name:'Recorded profit: -$100.00',exact:true})).toBeVisible();
  expect(actions).toEqual(['arrangement','obligation','compensation_payment']);expect(fixture.unexpected).toEqual([]);
});
