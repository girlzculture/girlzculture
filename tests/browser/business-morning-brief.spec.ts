import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {BUSINESS_MORNING_SOURCE_MESSAGES as messages} from '../../src/i18n/business-morning-source-catalog';

test.use({serviceWorkers:'block'});
const snapshot=()=>({date:'2026-09-18',time_zone:'America/New_York',generated_at:'2026-09-18T16:30:00Z',appointments:{status:'ok',value:{items:[{id:'morning-booking',at:'2026-09-18T17:00:00Z',client:'Fixture Client',service:'Fixture Braids',professional:'Fixture Stylist',status:'Confirmed'}],cancelled:1,no_shows:1,overlaps:1,unassigned:0,overdue:0}},money:{status:'ok',value:{expected_cents:20000,deposit_cents:1000,received_cents:4500,balance_cents:15500}},availability:{status:'ok',value:{gaps:[{start:'2026-09-18T18:00:00Z',end:'2026-09-18T20:00:00Z',professional_name:'Fixture Stylist'}],waitlist_opportunities:1}},inventory:{status:'ok',value:[{name:'Scalp oil',quantity:1}]},followups:{status:'ok',value:[{booking_id:'prior-visit',client:'Followup Client'}]}});
for(const [locale,width,height]of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const)test(`Morning brief remains factual and readable in ${locale}`,async({page},info)=>{
 const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});let calls=0;
 await page.route('**/api/salon/morning-brief',async route=>{expect(route.request().method()).toBe('GET');expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);calls++;await route.fulfill({json:snapshot()});});
 await page.goto('/salon/dashboard');const t=(s:string)=>messages[locale]?.[s]||s,brief=page.getByRole('region',{name:t('Morning brief'),exact:true});
 await expect(brief).toContainText('Fixture Client');await expect(brief).toContainText('Fixture Braids');await expect(brief).toContainText('Fixture Stylist');await expect(brief).toContainText('Scalp oil');
 const money=brief.locator('article').filter({has:page.getByRole('heading',{name:t("Today's appointment money")})});
 const currency=(value:number)=>new Intl.NumberFormat(locale==='es'?'es-US':locale,{style:'currency',currency:'USD'}).format(value);
 await expect(money).toContainText(currency(200));await expect(money).toContainText(currency(10));await expect(money).toContainText(currency(45));await expect(money).toContainText(currency(155));
 const next=brief.locator('article').filter({has:page.getByRole('heading',{name:t('Your next steps')})});await expect(next.getByRole('link')).toHaveCount(2);
 await expect(next.getByRole('link').nth(0)).toHaveAttribute('href','/salon/dashboard/availability');await expect(next.getByRole('link').nth(1)).toHaveAttribute('href','/salon/dashboard/products?tab=inventory');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('morning-brief-'+locale+'.png'),fullPage:true});
 await brief.screenshot({path:info.outputPath('morning-brief-panel-'+locale+'.png')});
 await page.reload();await expect(brief).toContainText('Fixture Client');expect(calls).toBeGreaterThanOrEqual(2);
});
test('Morning brief preserves a partial failure reference and refresh recovers without false zero',async({page})=>{
 await p0OwnerFixture(page,{populated:true});let broken=true;
 await page.route('**/api/salon/morning-brief',route=>{const data:Record<string,unknown>=snapshot();if(broken)data.money={status:'unavailable',request_id:'55000000-0000-4000-8000-000000000001'};return route.fulfill({json:data});});
 await page.goto('/salon/dashboard');const brief=page.getByRole('region',{name:'Morning brief',exact:true}),money=brief.locator('article').filter({has:page.getByRole('heading',{name:"Today's appointment money"})});
 await expect(money).toContainText('Unavailable, not zero.');await expect(money).toContainText('55000000-0000-4000-8000-000000000001');await expect(money).not.toContainText('$0.00');await expect(brief).toContainText('Fixture Client');
 broken=false;await brief.getByRole('button',{name:'Refresh',exact:true}).click();await expect(money).toContainText('$155.00');await expect(money.getByRole('status')).toHaveCount(0);
});
test('Morning brief does not expose owner financial summary to a team workspace',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true,role:'salon_team'});let calls=0;
 await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{overview:true,bookings:true},records:f.records}}));
 await page.route('**/api/salon/morning-brief',route=>{calls++;return route.fulfill({status:403,json:{code:'BRIEF_UNAVAILABLE'}});});
 await page.goto('/salon/dashboard');await expect(page.getByRole('heading',{name:/Welcome back/})).toBeVisible();await expect(page.getByRole('region',{name:'Morning brief',exact:true})).toHaveCount(0);expect(calls).toBe(0);
});
