import {expect,type Page} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {businessServiceContribution,type ContributionEvidence} from '../../src/lib/businessServiceContribution';
import {contributionCopy} from '../../src/i18n/business-service-contribution-copy';
import {intlLocale} from '../../src/i18n/catalog';
test.use({serviceWorkers:'block'});
const reference='18300000-0000-4000-8000-000000000090';
const id=(n:number)=>`18300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const path='/salon/dashboard/earnings?finance_from=2026-08-01&finance_to=2026-08-28';
async function fixture(page:Page,locale='en',shared?:ContributionEvidence){
 const f=await p0OwnerFixture(page,{populated:true,locale}),requests:Record<string,unknown>[]=[];
 const bookings=[1,2,3].map(n=>({id:id(n),salon_id:f.business.id,stylist_id:f.ids.professional,status:'Completed',booking_origin:'business_added',payment_mode:'live',created_at:'2026-07-01T12:00:00Z',appointment_datetime:n===1?'2026-08-10T12:00:00Z':`2026-07-${n===2?'12':'20'}T12:00:00Z`,service_completed_at:null,estimated_total:100,deposit_amount:0,refund_amount:0,operating_compensation:{kind:'commission',version:id(4),basis:'after_discount',percent:20}}));
 const evidence:ContributionEvidence=shared||{salon_id:f.business.id,period:{from:'2026-08-01',to:'2026-08-28',timeZone:f.business.time_zone},as_of:'2026-09-01T12:00:00Z',fingerprint:'a'.repeat(32),finance:{scope:{kind:'business',stylist_id:null},sales:[],bookings,receipts:[],expenses:[{id:id(5),salon_id:f.business.id,occurred_at:'2026-08-05T12:00:00Z',category:'Recorded supplies183',amount_cents:3000,treatment:'operating'}],obligations:[],compensation_payments:[],arrangements:[],stylists:[]},services:[{id:f.ids.service,salon_id:f.business.id,name:'Own contribution service183'}],booking_services:bookings.map(row=>({id:row.id,salon_id:f.business.id,style_id:f.ids.service})),reviews:[]};
 const state={failSave:false,failRead:false,stale:false,canReview:true,reads:0};
 await page.route('**/api/salon/service-contribution**',async route=>{
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();requests.push(body);
   if(state.stale)return route.fulfill({status:409,json:{code:'CONTRIBUTION_SOURCE_CHANGED',request_id:reference}});
   evidence.reviews=[{...body.payload,revision:1}];
   if(state.failSave){state.failSave=false;return route.fulfill({status:503,json:{code:'CONTRIBUTION_UNAVAILABLE',request_id:reference}});}
   return route.fulfill({json:{...businessServiceContribution(f.business.id,evidence),can_review:state.canReview,verified:true}});
  }
  state.reads++;return state.failRead?route.fulfill({status:503,json:{code:'CONTRIBUTION_UNAVAILABLE',request_id:reference}}):route.fulfill({json:{...businessServiceContribution(f.business.id,evidence),can_review:state.canReview}});
 });
 return {...f,evidence,state,requests};
}
async function fillReview(page:Page,locale='en'){
 const t=(s:string)=>contributionCopy(locale,s),panel=page.getByRole('region',{name:t('Service contribution'),exact:true});
 await panel.getByRole('button',{name:t('Review costs'),exact:true}).click();const form=panel.getByRole('form',{name:t('Review costs'),exact:true});
 await form.getByRole('textbox').first().fill('30');await form.getByRole('textbox',{name:t('Allocation explanation'),exact:true}).fill('Recorded materials, labor and overhead reviewed183');
 await form.getByRole('checkbox',{name:t('I reviewed all applicable materials, labor and allocated overhead for these completed appointments, without counting a cost twice.'),exact:true}).check();
 return {panel,form,t};
}
for(const [locale,width,height]of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]]as const){
 test(`Business service contribution reviews canonical costs and saved contribution in ${locale}`,async({page,browser},info)=>{
  const f=await fixture(page,locale),t=(s:string)=>contributionCopy(locale,s),expenseBefore=structuredClone(f.evidence.finance.expenses);await page.setViewportSize({width,height});await page.goto(path);
  const panel=page.getByRole('region',{name:t('Service contribution'),exact:true});await expect(panel.getByText('Own contribution service183',{exact:true})).toBeVisible();
  await expect(panel.getByText(t('Positive recorded contribution with fewer appointments. Review this service and your current calendar before planning promotion.'),{exact:true})).toHaveCount(0);
  const {form}=await fillReview(page,locale);await expect(form.getByRole('link',{name:t('Record missing expenses'),exact:true})).toHaveAttribute('href','/salon/dashboard/earnings?finance=expenses&finance_from=2026-08-01&finance_to=2026-08-28');
  await form.getByRole('button',{name:t('Save reviewed allocation'),exact:true}).click();await expect(panel.getByRole('status')).toContainText(t('Saved allocation verified against current records.'));
  const amount=new Intl.NumberFormat(intlLocale(locale),{style:'currency',currency:'USD'}).format(50);await expect(panel.getByText(amount,{exact:true})).toBeVisible();
  await expect(panel.getByText(t('Positive recorded contribution with fewer appointments. Review this service and your current calendar before planning promotion.'),{exact:true})).toBeVisible();
  await page.reload();await expect(panel.getByText(amount,{exact:true})).toBeVisible();await expect(panel.getByRole('link',{name:t('Review service'),exact:true})).toHaveAttribute('href',`/salon/dashboard/services/${f.ids.service}`);
  expect(f.requests.length).toBe(1);expect(f.evidence.finance.expenses).toEqual(expenseBefore);expect(f.evidence.finance.receipts).toEqual([]);expect(f.actions).toEqual([]);expect(f.unexpected).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(locale==='en'){const fresh=await browser.newContext({baseURL:new URL(page.url()).origin,serviceWorkers:'block'});try{const next=await fresh.newPage();await fixture(next,locale,f.evidence);await next.goto(path);await expect(next.getByRole('region',{name:'Service contribution',exact:true}).getByText(amount,{exact:true})).toBeVisible();}finally{await fresh.close();}}
  const offset=await page.locator('.gc-owner-header').evaluate(el=>el.getBoundingClientRect().bottom);await panel.evaluate((el,y)=>window.scrollBy(0,el.getBoundingClientRect().top-y),offset+16);await page.screenshot({path:info.outputPath(`service-contribution-${locale}-${width}-viewport.png`)});
 });
}
test('Business service contribution retries a lost save with the exact original request and retains its draft',async({page})=>{
 const f=await fixture(page);f.state.failSave=true;await page.goto(path);const {panel,form}=await fillReview(page);await form.getByRole('button',{name:'Save reviewed allocation',exact:true}).click();await expect(panel.getByRole('alert')).toContainText(reference);await expect(form.getByRole('textbox').first()).toHaveValue('30');await form.getByRole('button',{name:'Save reviewed allocation',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Saved allocation verified');expect(f.requests.length).toBe(2);expect(f.requests[0]).toEqual(f.requests[1]);
});
test('Business service contribution clears failed refresh evidence and never retains stale positive advice',async({page})=>{
 const f=await fixture(page);await page.goto(path);const {panel,form}=await fillReview(page);await form.getByRole('button',{name:'Save reviewed allocation',exact:true}).click();await expect(panel.getByText('$50.00',{exact:true})).toBeVisible();f.state.failRead=true;await panel.getByRole('button',{name:'Refresh evidence',exact:true}).click();await expect(panel.getByRole('alert')).toContainText(reference);await expect(panel.getByText('$50.00',{exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:'Review costs',exact:true})).toHaveCount(0);f.state.failRead=false;await panel.getByRole('button',{name:'Refresh evidence',exact:true}).click();await expect(panel.getByText('$50.00',{exact:true})).toBeVisible();
});
test('Business service contribution rejects changed sources with retained review and no success claim',async({page})=>{
 const f=await fixture(page);f.state.stale=true;await page.goto(path);const {panel,form}=await fillReview(page);await form.getByRole('button',{name:'Save reviewed allocation',exact:true}).click();await expect(panel.getByRole('alert')).toContainText(reference);await expect(form.getByRole('textbox').first()).toHaveValue('30');await expect(panel.getByText('Saved allocation verified against current records.',{exact:true})).toHaveCount(0);expect(f.evidence.reviews.length).toBe(0);
 f.state.stale=false;f.evidence.fingerprint='b'.repeat(32);await panel.getByRole('button',{name:'Refresh evidence',exact:true}).click();await expect(form.getByRole('textbox').first()).toHaveValue('30');await expect(form.getByRole('textbox',{name:'Allocation explanation',exact:true})).toHaveValue('Recorded materials, labor and overhead reviewed183');
 const declaration=form.getByRole('checkbox',{name:'I reviewed all applicable materials, labor and allocated overhead for these completed appointments, without counting a cost twice.',exact:true});await expect(declaration).not.toBeChecked();await expect(form.getByRole('button',{name:'Save reviewed allocation',exact:true})).toBeDisabled();expect(f.requests.length).toBe(1);await declaration.check();await form.getByRole('button',{name:'Save reviewed allocation',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Saved allocation verified');expect(f.requests.length).toBe(2);expect(f.requests[1].request_id).not.toEqual(f.requests[0].request_id);expect((f.requests[1].payload as Record<string,unknown>).fingerprint).toBe('b'.repeat(32));
 await panel.getByRole('button',{name:'Review costs',exact:true}).click();f.evidence.fingerprint='c'.repeat(32);f.evidence.finance.expenses=[];await panel.getByRole('button',{name:'Refresh evidence',exact:true}).click();await expect(form.getByText('Unavailable cost allocation: 30',{exact:true})).toBeVisible();await declaration.check();await expect(form.getByRole('button',{name:'Save reviewed allocation',exact:true})).toBeDisabled();await form.getByRole('button',{name:'Remove unavailable allocation',exact:true}).click();await expect(declaration).not.toBeChecked();await expect(form.getByRole('textbox',{name:'Allocation explanation',exact:true})).toHaveValue('Recorded materials, labor and overhead reviewed183');expect(f.requests.length).toBe(2);
});
test('Business service contribution requires the finance bookings and styles permission intersection',async({page})=>{
 const f=await fixture(page);await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{earnings:true,bookings:true},records:f.records}}));await page.goto(path);await expect(page.getByRole('heading',{name:'Completed sales by day',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Service contribution',exact:true})).toHaveCount(0);expect(f.state.reads).toBe(0);
});
test('Business service contribution offers a completed-period action from the default current-day report',async({page})=>{
 const f=await fixture(page);await page.goto('/salon/dashboard/earnings');const panel=page.getByRole('region',{name:'Service contribution',exact:true});await expect(panel.getByRole('button',{name:'Use previous 28 completed days',exact:true})).toBeVisible();expect(f.state.reads).toBe(0);
 await page.route('**/api/salon/service-contribution**',async route=>{const query=new URL(route.request().url()).searchParams;f.evidence.period={...f.evidence.period,from:query.get('from')!,to:query.get('to')!};f.evidence.as_of=new Date().toISOString();return route.fulfill({json:{...businessServiceContribution(f.business.id,f.evidence),can_review:true}});});
 await panel.getByRole('button',{name:'Use previous 28 completed days',exact:true}).click();await expect(panel.getByRole('button',{name:'Refresh evidence',exact:true})).toBeVisible();const params=new URL(page.url()).searchParams;expect((Date.parse(params.get('finance_to')!+'T12:00:00Z')-Date.parse(params.get('finance_from')!+'T12:00:00Z'))/86400000).toBe(27);await expect(panel.getByRole('alert')).toHaveCount(0);
});
test('Business service contribution authorized finance staff can read but cannot declare owner-reviewed costs',async({page})=>{
 const f=await fixture(page);f.state.canReview=false;await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{earnings:true,bookings:true,styles:true},records:f.records}}));await page.goto(path);const panel=page.getByRole('region',{name:'Service contribution',exact:true});await expect(panel.getByText('Own contribution service183',{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'Review costs',exact:true})).toHaveCount(0);expect(f.requests.length).toBe(0);
});
