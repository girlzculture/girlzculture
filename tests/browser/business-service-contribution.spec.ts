import {expect,type Page} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {businessServiceContribution,type ContributionEvidence} from '../../src/lib/businessServiceContribution';
import {contributionCopy} from '../../src/i18n/business-service-contribution-copy';
import {intlLocale} from '../../src/i18n/catalog';
import {serviceCapacityCopy} from '../../src/i18n/business-service-capacity-copy';
test.use({serviceWorkers:'block'});
const reference='18300000-0000-4000-8000-000000000090';
const id=(n:number)=>`18300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const path='/salon/dashboard/earnings?finance_from=2026-08-01&finance_to=2026-08-28';

async function capacityFixture(page:Page,locale='en') {
 const f=await fixture(page,locale),reads:URLSearchParams[]=[];
 const state:{fail:boolean;hold:Promise<void>|null}={fail:false,hold:null};
 await page.route('**/api/salon/service-capacity?**',async route=>{
  expect(route.request().method()).toBe('GET');const query=new URL(route.request().url()).searchParams;reads.push(query);
  expect(query.get('style_id')).toBe(f.ids.service);expect(query.get('days')).toBe('7');expect(query.get('from')).toBe('2026-08-01');expect(query.get('to')).toBe('2026-08-28');
  if(state.hold)await state.hold;if(state.fail)return route.fulfill({status:503,json:{code:'SERVICE_CAPACITY_UNAVAILABLE',request_id:reference}});
  const first=query.get('date')!,through=new Date(first+'T12:00:00Z');through.setUTCDate(through.getUTCDate()+6);
  const selected=JSON.parse(query.get('selected_options')!);const chosen=selected.some((group:{group_id:string;values:string[]})=>group.group_id==='finish'&&group.values.includes('long'));
  const slots=chosen?['09:00','09:30'].map(time=>({date:first,time,stylist_id:f.ids.professional,professional_name:'Capacity professional',href:'/salon/dashboard/availability?'+new URLSearchParams({date:first,stylist:f.ids.professional})})):[];
  return route.fulfill({json:{available:chosen,reason:chosen?null:'selection_required',service_id:f.ids.service,service_name:'Own contribution service183',date:first,through:through.toISOString().slice(0,10),time_zone:f.business.time_zone,as_of:new Date().toISOString(),duration_minutes:chosen?180:null,duration_basis:'maximum_saved_duration',buffer_minutes:chosen?15:null,option_groups:[{id:'finish',label:'Service finish',required:true,multiple:false,options:[{value:'long',label:'Long finish',duration_minutes:120}]}],total:chosen?2:null,shown_count:slots.length,is_excerpt:false,days:chosen?[{date:first,total:2}]:[],slots,definition:'Current own-business start alternatives, not additional appointments.'}});
 });
 return {...f,capacityReads:reads,capacityState:state};
}
async function openReviewedCapacity(page:Page,locale='en') {
 const review=await fillReview(page,locale);await review.form.getByRole('button',{name:review.t('Save reviewed allocation'),exact:true}).click();await expect(review.panel.getByText(review.t('Saved allocation verified against current records.'),{exact:true})).toBeVisible();
 const copy=(source:string,values:Record<string,string>={})=>serviceCapacityCopy(locale,source,values);
 await review.panel.getByRole('button',{name:copy('Check openings for this service'),exact:true}).click();const capacity=review.panel.getByRole('region',{name:copy('Service openings'),exact:true});
 await expect(capacity.getByRole('status')).toHaveText(copy('Choose the required service options, then check again.'));
 return {...review,capacity,copy};
}
for(const [locale,width,height]of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]]as const){
 test(`Business service capacity requires selected duration and keeps honest calendar alternatives in ${locale}`,async({page},info)=>{
  const f=await capacityFixture(page,locale);await page.setViewportSize({width,height});await page.goto(path);const {capacity,copy}=await openReviewedCapacity(page,locale);
  await expect(capacity.getByRole('link',{name:copy('Review calendar'),exact:true})).toHaveCount(0);await capacity.getByRole('combobox',{name:'Service finish',exact:true}).selectOption('long');await capacity.getByRole('button',{name:copy('Check next seven days'),exact:true}).click();
  await expect(capacity.getByText(copy('{duration} minutes plus {buffer} minutes of buffer.',{duration:'180',buffer:'15'}),{exact:false})).toBeVisible();await expect(capacity.getByText(copy('Uses the longest saved duration for this service range.'),{exact:false})).toBeVisible();
  await expect(capacity.getByRole('status')).toHaveText(copy('{total} start-time alternatives; showing {shown}.',{total:'2',shown:'2'}));await expect(capacity.getByText(copy('Start times overlap; this is not a count of extra appointments. No time is reserved. Booking checks customer eligibility and availability again.'),{exact:true})).toBeVisible();
  const link=capacity.getByRole('link',{name:copy('Review calendar'),exact:true}).first(),last=f.capacityReads.at(-1)!;await expect(link).toHaveAttribute('href','/salon/dashboard/availability?'+new URLSearchParams({date:last.get('date')!,stylist:f.ids.professional}));
  expect(f.capacityReads.length).toBe(2);expect(f.requests.length).toBe(1);await expect(capacity.getByRole('combobox',{name:'Service finish'})).toHaveValue('long');
  for(const control of [capacity.getByRole('button',{name:copy('Check next seven days'),exact:true}),link])expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await capacity.screenshot({path:info.outputPath(`service-capacity-${locale}-${width}.png`)});
 });
}
test('Business service capacity hides old starts during a held or failed new selection and retains choices',async({page},info)=>{
 const f=await capacityFixture(page);await page.setViewportSize({width:320,height:740});await page.goto(path);const {capacity,copy}=await openReviewedCapacity(page);await capacity.getByRole('combobox',{name:'Service finish'}).selectOption('long');await capacity.getByRole('button',{name:copy('Check next seven days'),exact:true}).click();await expect(capacity.getByRole('link',{name:'Review calendar',exact:true})).toHaveCount(2);
 let release!:()=>void;f.capacityState.hold=new Promise<void>(resolve=>{release=resolve;});f.capacityState.fail=true;const input=capacity.getByLabel('First date',{exact:true}),later=new Date((await input.inputValue())+'T12:00:00Z');later.setUTCDate(later.getUTCDate()+1);await input.fill(later.toISOString().slice(0,10));await expect(capacity.getByRole('link',{name:'Review calendar',exact:true})).toHaveCount(0);await capacity.getByRole('button',{name:'Check next seven days',exact:true}).click();await expect(capacity.getByRole('status')).toHaveText('Checking openings…');await expect(capacity.getByRole('link',{name:'Review calendar',exact:true})).toHaveCount(0);release();
 await expect(capacity.getByRole('alert')).toContainText(reference);await expect(capacity.getByRole('combobox',{name:'Service finish'})).toHaveValue('long');await expect(input).toHaveValue(later.toISOString().slice(0,10));await expect(capacity.getByRole('link',{name:'Review calendar',exact:true})).toHaveCount(0);await capacity.screenshot({path:info.outputPath('service-capacity-failure-320.png')});
 f.capacityState.fail=false;f.capacityState.hold=null;await capacity.getByRole('button',{name:'Check next seven days',exact:true}).click();await expect(capacity.getByRole('link',{name:'Review calendar',exact:true})).toHaveCount(2);await expect(capacity.getByRole('alert')).toHaveCount(0);expect(f.requests.length).toBe(1);
});
for(const availability of [false,true])test(`Business service capacity staff availability grant ${availability} governs the control`,async({page})=>{
 const f=await capacityFixture(page);await page.goto(path);const {panel,form,t}=await fillReview(page);await form.getByRole('button',{name:t('Save reviewed allocation'),exact:true}).click();await expect(panel.getByText(t('Saved allocation verified against current records.'),{exact:true})).toBeVisible();
 f.state.canReview=false;await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{earnings:true,bookings:true,styles:true,availability},records:f.records}}));await page.reload();
 const current=page.getByRole('region',{name:'Service contribution',exact:true});await expect(current.getByText('Own contribution service183',{exact:true})).toBeVisible();await expect(current.getByRole('button',{name:'Check openings for this service',exact:true})).toHaveCount(availability?1:0);await expect(current.getByRole('button',{name:'Review costs',exact:true})).toHaveCount(0);expect(f.capacityReads.length).toBe(0);
});
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
  await expect(panel.getByText(t('Contribution uses owner-reviewed costs; it is not verified net profit or cash received.'),{exact:true})).toBeVisible();
  const method=panel.locator('details').filter({has:page.getByText(t('How this is calculated'),{exact:true})}),methodSummary=method.locator('summary');
  const breakdown=panel.locator('details').filter({has:page.getByText(t('View cost breakdown'),{exact:true})}),breakdownSummary=breakdown.locator('summary');
  await expect(method).toHaveJSProperty('open',false);await expect(breakdown).toHaveJSProperty('open',false);
  await expect(method.getByText(t('Recorded contribution is not net profit or cash received. Cost completeness is declared by the owner, not verified by the platform.'),{exact:true})).not.toBeVisible();
  expect((await panel.getByRole('link',{name:t('Review service'),exact:true}).boundingBox())!.y).toBeLessThan((await breakdownSummary.boundingBox())!.y);
  expect((await breakdownSummary.boundingBox())!.y).toBeLessThan((await methodSummary.boundingBox())!.y);
  for(const control of [methodSummary,breakdownSummary])expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await methodSummary.focus();await page.keyboard.press('Enter');await expect(method).toHaveJSProperty('open',true);
  const day=(value:string)=>new Intl.DateTimeFormat(intlLocale(locale),{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
  const visiblePeriod=panel.getByText(contributionCopy(locale,'Current period: {from} to {to}. Comparison: {previousFrom} to {previousTo}.',{from:day('2026-08-01'),to:day('2026-08-28'),previousFrom:day('2026-07-04'),previousTo:day('2026-07-31')}),{exact:true});await expect(visiblePeriod).toBeVisible();
  await expect(method.getByText(contributionCopy(locale,'Business time zone: {zone}.',{zone:f.business.time_zone}),{exact:true})).toBeVisible();
  await expect(method.getByText(t('Completed appointments with a saved service identity only. Fewer appointments do not prove spare capacity or lower demand.'),{exact:true})).toBeVisible();
  await expect(method.getByText(t('Recorded contribution is not net profit or cash received. Cost completeness is declared by the owner, not verified by the platform.'),{exact:true})).toBeVisible();
  await methodSummary.focus();await page.keyboard.press('Space');await expect(method).toHaveJSProperty('open',false);await expect(visiblePeriod).toBeVisible();expect(f.state.reads).toBe(1);expect(f.requests).toEqual([]);
  await expect(panel.getByText(t('Positive recorded contribution with fewer appointments. Review this service and your current calendar before planning promotion.'),{exact:true})).toHaveCount(0);
  const {form}=await fillReview(page,locale);await expect(form.getByRole('link',{name:t('Record missing expenses'),exact:true})).toHaveAttribute('href','/salon/dashboard/earnings?finance=expenses&finance_from=2026-08-01&finance_to=2026-08-28');
  await methodSummary.focus();await page.keyboard.press('Enter');await methodSummary.focus();await page.keyboard.press('Space');
  await expect(form.getByRole('textbox').first()).toHaveValue('30');await expect(form.getByRole('textbox',{name:t('Allocation explanation'),exact:true})).toHaveValue('Recorded materials, labor and overhead reviewed183');await expect(form.getByRole('checkbox',{name:t('I reviewed all applicable materials, labor and allocated overhead for these completed appointments, without counting a cost twice.'),exact:true})).toBeChecked();expect(f.requests).toEqual([]);
  await form.getByRole('button',{name:t('Save reviewed allocation'),exact:true}).click();await expect(panel.getByRole('status')).toContainText(t('Saved allocation verified against current records.'));
  const amount=new Intl.NumberFormat(intlLocale(locale),{style:'currency',currency:'USD'}).format(50);await expect(panel.getByText(amount,{exact:true})).toBeVisible();
  await expect(panel.getByText(t('Positive contribution, fewer appointments. Review your calendar before promoting.'),{exact:true})).toBeVisible();
  await breakdownSummary.focus();await page.keyboard.press('Enter');await expect(breakdown).toHaveJSProperty('open',true);
  const formatted=(value:number)=>new Intl.NumberFormat(intlLocale(locale),{style:'currency',currency:'USD'}).format(value);
  for(const [label,value]of [['Recorded value after refunds',100],['Saved commission',20],['Recorded direct costs',0],['Allocated expenses and wages',30]]as const)await expect(breakdown.locator('dl > div').filter({has:page.getByText(t(label),{exact:true})}).locator('dd')).toHaveText(formatted(value));
  await expect(breakdown.getByText(t('Positive recorded contribution with fewer appointments. Review this service and your current calendar before planning promotion.'),{exact:true})).toBeVisible();
  await breakdownSummary.focus();await page.keyboard.press('Space');await expect(breakdown).toHaveJSProperty('open',false);await expect(panel.getByText(amount,{exact:true})).toBeVisible();expect(f.requests.length).toBe(1);
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
