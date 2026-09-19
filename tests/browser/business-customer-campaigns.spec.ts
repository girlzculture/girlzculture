import { expect, type Page, type Route } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { campaignCopy } from '../../src/i18n/business-customer-campaign-copy';
import type { CampaignWorkspace } from '../../src/lib/businessCustomerCampaigns';
import type { MarketingLocale } from '../../src/lib/businessMarketing';
test.use({ serviceWorkers: 'block' });
const id=(n:number)=>`18100000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const reference=id(99);
async function fixture(page:Page,locale:MarketingLocale='en') {
 const auth=await p0OwnerFixture(page,{locale,populated:true});
 const copy=(language:MarketingLocale)=>({title:`Reviewed update ${language}`,body:`Saved approved content ${language}. No changed service price.`,tags:[]});
 const copies={en:copy('en'),fr:copy('fr'),es:copy('es'),'zh-CN':copy('zh-CN')};
 const workspace:CampaignWorkspace={clients:[{id:id(1),name:'Own client181',locale,email_hint:'o***@example.test'},{id:id(2),name:'Second client181',locale:'es',email_hint:'s***@example.test'}],clients_capped:false,posts:[{id:id(3),revision:2,copies,booking_path:'/salon/gc-fixture/book'}],campaigns:[],channel:'email',email_available:true,verified:true};
 const state={calls:[] as string[],saves:0,sends:0,lostSave:false,denied:false,outcome:'accepted' as 'accepted'|'uncertain'|'skipped',hold:null as Promise<void>|null};
 const handler=async(route:Route)=>{
  expect(route.request().headers().authorization).toBe(`Bearer ${auth.session.access_token}`);
  if(state.denied)return route.fulfill({status:403,json:{code:'CAMPAIGN_FORBIDDEN',error:'The business owner manages client updates.'}});
  if(route.request().method()==='POST') {
   const body=route.request().postDataJSON();state.calls.push(body.action);expect(body.salon_id).toBeUndefined();expect(body.destination).toBeUndefined();
   if(state.hold)await state.hold;
   if(body.action==='save') {
    expect(body.post_id).toBe(id(3));expect(body.post_revision).toBe(2);
    if(!workspace.campaigns.some(item=>item.id===body.id)){state.saves++;workspace.campaigns.unshift({id:body.id,revision:1,status:'draft',copies,booking_path:'/salon/gc-fixture/book',created_at:'2026-09-19T09:00:00Z',recipients:workspace.clients.filter(client=>body.customer_ids.includes(client.id)).map(client=>({...client,status:'pending',outcome_code:null}))});}
    if(state.lostSave){state.lostSave=false;return route.fulfill({status:503,headers:{'X-Request-ID':reference},json:{code:'CAMPAIGN_UNAVAILABLE',request_id:reference}});}
   } else {
    expect(body.confirm).toBe(true);const saved=workspace.campaigns.find(item=>item.id===body.id)!;expect(saved).toBeTruthy();
    if(body.action==='confirm'){expect(body.revision).toBe(saved.revision);expect(new Set(body.reviewed_locales)).toEqual(new Set(saved.recipients.map(client=>client.locale)));saved.status='confirmed';saved.revision++;}
    else if(body.action==='send'){expect(saved.status).toBe('confirmed');const recipient=saved.recipients.find(client=>client.status==='pending');if(recipient){state.sends++;recipient.status=state.outcome;recipient.outcome_code=state.outcome==='uncertain'?'review_required':state.outcome==='skipped'?'consent_changed':null;recipient.support_reference=state.outcome==='uncertain'?reference:null;}}
    else {expect(body.action).toBe('cancel');saved.status='cancelled';for(const recipient of saved.recipients)if(recipient.status==='pending'){recipient.status='skipped';recipient.outcome_code='cancelled';}}
   }
  }
  return route.fulfill({json:workspace});
 };
 await page.route('**/api/salon/customer-campaigns**',handler);
 return {state,workspace,handler};
}
async function saveOne(page:Page,locale:MarketingLocale='en') {
 const t=(text:string)=>campaignCopy(locale,text),panel=page.getByRole('region',{name:t('Email updates'),exact:true});
 await expect(panel).toHaveAccessibleName(t('Email updates'));
 await panel.getByRole('combobox',{name:t('Approved content'),exact:true}).selectOption(id(3));
 await panel.getByRole('checkbox',{name:/^Own client181/}).check();
 await panel.getByRole('button',{name:t('Save selection for review'),exact:true}).click();
 return {panel,review:panel.getByRole('article',{name:t('Review saved selection'),exact:true}),t};
}
for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Business client updates select review and send an own approved email with saved readback in ${locale}`,async({page,browser},info)=>{
  const f=await fixture(page,locale);await page.setViewportSize({width,height});await page.goto('/salon/dashboard/messages/campaigns');const {panel,review,t}=await saveOne(page,locale);
  expect(f.state.sends).toBe(0);await expect(review).toContainText(`Saved approved content ${locale}`);await expect(review).not.toContainText('Second client181');
  const approve=review.getByRole('button',{name:t('Approve this exact selection'),exact:true});await expect(approve).toBeDisabled();await review.getByRole('checkbox').check();await approve.click();expect(f.state.sends).toBe(0);
  await review.getByRole('button',{name:t('Send next approved email'),exact:true}).click();await expect(review).toContainText(t('Accepted by email provider'));expect(f.state.sends).toBe(1);await expect(review.getByRole('button',{name:t('Send next approved email'),exact:true})).toBeDisabled();
  await page.reload();await panel.getByRole('button',{name:new RegExp(`Reviewed update ${locale}.*${t('Approved')}`)}).click();await expect(review).toContainText(t('Accepted by email provider'));expect(f.state.calls).toEqual(['save','confirm','send']);
  await page.getByRole('navigation',{name:t('Client updates'),exact:true}).getByRole('link',{name:t('Booking messages'),exact:true}).click();await expect(page).toHaveURL(/\/messages$/);await page.goBack();await expect(panel).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath(`client-updates-${locale}-${width}-viewport.png`)});
  const context=await browser.newContext({baseURL:new URL(page.url()).origin,viewport:{width:width===390?1440:390,height:844},serviceWorkers:'block'});
  try{const second=await context.newPage();await p0OwnerFixture(second,{locale,populated:true});await second.route('**/api/salon/customer-campaigns**',f.handler);await second.goto('/salon/dashboard/messages/campaigns');await second.getByRole('button',{name:new RegExp(`Reviewed update ${locale}.*${t('Approved')}`)}).click();await expect(second.getByRole('article',{name:t('Review saved selection'),exact:true})).toContainText(t('Accepted by email provider'));expect(f.state.sends).toBe(1);}finally{await context.close();}
 });
}
test('Business client updates preserve selection and request identity after a lost save response',async({page})=>{
 const f=await fixture(page);f.state.lostSave=true;await page.goto('/salon/dashboard/messages/campaigns');let release!:()=>void;f.state.hold=new Promise<void>(resolve=>{release=resolve;});const {panel}=await saveOne(page);const save=panel.getByRole('button',{name:'Save selection for review',exact:true});await expect(save).toBeDisabled();release();await expect(panel.getByRole('alert')).toContainText(reference);await expect(panel.getByRole('checkbox',{name:/^Own client181/})).toBeChecked();f.state.hold=null;await save.click();await expect(panel.getByRole('article',{name:'Review saved selection',exact:true})).toBeVisible();expect(f.state.saves).toBe(1);expect(f.state.sends).toBe(0);expect(f.state.calls).toEqual(['save','save']);
});
test('Business client updates never retry uncertain attempts and preserve status after refresh',async({page})=>{
 const f=await fixture(page);f.state.outcome='uncertain';await page.goto('/salon/dashboard/messages/campaigns');const {review,panel}=await saveOne(page);await review.getByRole('checkbox').check();await review.getByRole('button',{name:'Approve this exact selection',exact:true}).click();await review.getByRole('button',{name:'Send next approved email',exact:true}).click();await expect(review).toContainText('Uncertain — support review needed');await expect(review).toContainText(reference);await expect(review.getByRole('button',{name:'Send next approved email',exact:true})).toBeDisabled();await panel.getByRole('button',{name:'Refresh saved status',exact:true}).click();await expect(review).toContainText('Uncertain — support review needed');expect(f.state.sends).toBe(1);
});
test('Business client updates show a fresh opt-out skip and cancel remaining unstarted recipients',async({page})=>{
 const f=await fixture(page);f.state.outcome='skipped';await page.goto('/salon/dashboard/messages/campaigns');
 const panel=page.getByRole('region',{name:'Email updates',exact:true});await expect(panel).toHaveAccessibleName('Email updates');await panel.getByRole('combobox',{name:'Approved content',exact:true}).selectOption(id(3));
 await panel.getByRole('checkbox',{name:/^Own client181/}).check();await panel.getByRole('checkbox',{name:/^Second client181/}).check();await panel.getByRole('button',{name:'Save selection for review',exact:true}).click();
 const review=panel.getByRole('article',{name:'Review saved selection',exact:true});await expect(review.getByRole('checkbox')).toHaveCount(2);for(const checkbox of await review.getByRole('checkbox').all())await checkbox.check();
 await review.getByRole('button',{name:'Approve this exact selection',exact:true}).click();await review.getByRole('button',{name:'Send next approved email',exact:true}).click();
 await expect(review.getByRole('listitem').filter({hasText:'Own client181'})).toContainText('Skipped after a fresh eligibility check');
 await review.getByRole('button',{name:'Cancel unsent emails',exact:true}).click();await expect(review.getByRole('heading',{name:'Review saved selection · Cancelled',exact:true})).toBeVisible();
 await expect(review.getByRole('listitem').filter({hasText:'Second client181'})).toContainText('Cancelled before sending');
 await expect(review.getByRole('listitem').filter({hasText:'Own client181'})).toContainText('Skipped after a fresh eligibility check');
 await expect(review.getByRole('button',{name:'Send next approved email',exact:true})).toHaveCount(0);expect(f.state.sends).toBe(1);
});
test('Business client updates keep unconfigured email and absent consent honest without send controls',async({page})=>{
 const f=await fixture(page);f.workspace.email_available=false;f.workspace.clients=[];await page.goto('/salon/dashboard/messages/campaigns');const panel=page.getByRole('region',{name:'Email updates',exact:true});await expect(panel).toContainText('Email sending is unavailable.');await expect(panel).toContainText('No eligible clients match.');await expect(panel.getByRole('button',{name:'Save selection for review',exact:true})).toBeDisabled();expect(f.state.calls).toEqual([]);
});
test('Business client updates preserve authorization denial instead of displaying an editable empty campaign',async({page})=>{
 const f=await fixture(page);f.state.denied=true;await page.goto('/salon/dashboard/messages/campaigns');const panel=page.getByRole('region',{name:'Email updates',exact:true});await expect(panel.getByRole('alert')).toHaveText('The business owner manages client updates.');await expect(panel.getByRole('button',{name:'Save selection for review',exact:true})).toHaveCount(0);expect(f.state.calls).toEqual([]);
});
