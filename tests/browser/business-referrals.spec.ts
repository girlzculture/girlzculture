import { expect, type Page, type Route } from '@playwright/test';
import { test } from './helpers/hydration';
import { p0OwnerFixture } from './helpers/p0OwnerFixture';
import { referralCopy } from '../../src/i18n/business-referral-copy';
import type { ReferralWorkspace } from '../../src/lib/businessReferrals';
import { buildAuthStorageKeys } from '../../src/lib/authSessionCore';
test.use({serviceWorkers:'block'});
const campaign='17600000-0000-4000-8000-000000000021';
const claimFailureReference='17600000-0000-4000-8000-000000000099';
async function fixture(page:Page,locale='en') {
 const auth=await p0OwnerFixture(page,{locale,populated:true});
 const workspace:ReferralWorkspace={campaigns:[{id:campaign,title:'Reviewed referral campaign GC176',status:'active',revision:1,terms:{currency:'usd',amount_cents:700,recipient:'referrer',starts_at:'2026-01-01T00:00:00Z',ends_at:'2099-01-01T00:00:00Z',minimum_payment_cents:8900,qualifying_days:30,hold_days:14,max_rewards_per_referrer:5}}],codes:[],claim:null,rewards:[],issuance_enabled:false};
 const state={calls:[] as string[],claims:0,uncertain:false,denied:false,verifiedPayment:false,hold:null as Promise<void>|null};
 const handler=async(route:Route)=>{
  expect(route.request().headers().authorization).toBe(`Bearer ${auth.session.access_token}`);
  if(state.denied)return route.fulfill({status:403,json:{code:'REFERRAL_FORBIDDEN',error:'The business owner must sign in to manage referrals.'}});
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();expect(body.salon_id).toBeUndefined();state.calls.push(body.action);
   if(state.hold)await state.hold;
   if(body.action==='code'){expect(body.campaign_id).toBe(campaign);workspace.codes=[{campaign_id:campaign,code:'a'.repeat(32)}];}
   else if(body.action==='claim'){
    expect(body.code).toBe('b'.repeat(32));expect(body.confirm).toBe(true);
    if(!workspace.claim){state.claims++;workspace.claim={id:campaign,status:'pending',campaign_title:workspace.campaigns[0].title,created_at:new Date().toISOString()};}
    if(state.uncertain){state.uncertain=false;return route.fulfill({status:503,headers:{'X-Request-ID':claimFailureReference},json:{code:'REFERRAL_UNAVAILABLE',request_id:claimFailureReference}});}
   }else{expect(body.action).toBe('refresh');if(state.verifiedPayment)workspace.rewards=[{id:campaign,status:'pending_review',amount_cents:700,currency:'usd',campaign_title:'Reviewed referral campaign GC176',qualified_at:'2026-09-19T00:00:00Z',eligible_at:'2026-10-03T00:00:00Z'}];}
  }
  return route.fulfill({json:workspace});
 };
 await page.route('**/api/salon/referrals',handler);
 return {state,workspace,handler};
}
for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Business referrals preserve own code claim and unissued reward after return in ${locale}`,async({page,browser},info)=>{
  const f=await fixture(page,locale),t=(value:string)=>referralCopy(locale,value);await page.setViewportSize({width,height});await page.goto('/salon/dashboard/subscription/referrals');
  const panel=page.getByRole('region',{name:t('Business referrals'),exact:true});
  await panel.getByRole('button',{name:t('Create my referral code'),exact:true}).click();await expect(panel.getByLabel(t('Your referral code'),{exact:true})).toHaveValue('a'.repeat(32));
  const record=panel.getByRole('button',{name:t('Record referral'),exact:true});await expect(record).toBeDisabled();await panel.getByLabel(t('Referral code from another business'),{exact:true}).fill('b'.repeat(32));await panel.getByRole('checkbox').check();await record.click();await expect(panel.getByRole('status')).toContainText(t('Referral recorded and verified.'));expect(f.state.claims).toBe(1);
  await page.reload();await expect(panel).toContainText(t('Your recorded referral'));await expect(panel.getByLabel(t('Your referral code'),{exact:true})).toHaveValue('a'.repeat(32));
  const subscriptionNavigation=page.getByRole('navigation',{name:t('Subscription workspaces'),exact:true});await subscriptionNavigation.getByRole('link',{name:t('Subscription'),exact:true}).click();await expect(page).toHaveURL(/\/salon\/dashboard\/subscription$/);await subscriptionNavigation.getByRole('link',{name:t('Business referrals'),exact:true}).click();await expect(panel).toContainText(t('Your recorded referral'));
  f.state.verifiedPayment=true;await panel.getByRole('button',{name:t('Refresh referral status'),exact:true}).click();await expect(panel).toContainText(t('Qualifying payment verified — awaiting review'));await expect(panel).toContainText(t('Not issued'));await expect(panel).not.toContainText(/cus_|sub_|Other salon/);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await panel.screenshot({path:info.outputPath(`referrals-${locale}-${width}.png`)});
  const context=await browser.newContext({baseURL:new URL(page.url()).origin,viewport:{width:width===390?1440:390,height:844},serviceWorkers:'block'});
  try{const second=await context.newPage();await p0OwnerFixture(second,{locale,populated:true});await second.route('**/api/salon/referrals',f.handler);await second.goto('/salon/dashboard/subscription/referrals');await expect(second.getByRole('region',{name:t('Business referrals'),exact:true})).toContainText(t('Not issued'));expect(f.state.claims).toBe(1);}finally{await context.close();}
 });
}
test('Business referrals keep absent campaign terms inactive and hide claim controls',async({page})=>{
 const f=await fixture(page);f.workspace.campaigns=[];await page.goto('/salon/dashboard/subscription/unknown-workspace');await expect(page.getByRole('heading',{name:'This page is not available.',exact:true})).toBeVisible();await page.goto('/salon/dashboard/subscription/referrals');const panel=page.getByRole('region',{name:'Business referrals',exact:true});await expect(panel).toContainText('No referral campaign is active.');await expect(panel.getByRole('button',{name:'Record referral',exact:true})).toHaveCount(0);await expect(panel.getByRole('button',{name:'Create my referral code',exact:true})).toHaveCount(0);expect(f.state.calls).toEqual([]);
});
test('Business referrals retain a failed claim and retry without duplicate attribution',async({page})=>{
 const f=await fixture(page);await page.goto('/salon/dashboard/subscription/referrals');const panel=page.getByRole('region',{name:'Business referrals',exact:true});await panel.getByLabel('Referral code from another business',{exact:true}).fill('b'.repeat(32));await panel.getByRole('checkbox').check();f.state.uncertain=true;let release!:()=>void;f.state.hold=new Promise<void>(resolve=>{release=resolve;});const save=panel.getByRole('button',{name:'Record referral',exact:true});await save.click();await expect(save).toBeDisabled();release();await expect(panel.getByRole('alert')).toContainText(claimFailureReference);await expect(panel.getByLabel('Referral code from another business',{exact:true})).toHaveValue('b'.repeat(32));f.state.hold=null;await save.click();await expect(panel.getByRole('status')).toContainText('Referral recorded and verified.');expect(f.state.claims).toBe(1);expect(f.state.calls).toEqual(['claim','claim']);
});
test('Business referrals do not replace permission failure with an editable empty workspace',async({page})=>{
 const f=await fixture(page);f.state.denied=true;await page.goto('/salon/dashboard/subscription/referrals');const panel=page.getByRole('region',{name:'Business referrals',exact:true});await expect(panel.getByRole('alert')).toContainText('The business owner must sign in');await expect(panel.getByRole('button',{name:'Record referral',exact:true})).toHaveCount(0);expect(f.state.calls).toEqual([]);
});

test('Referral configuration denies a settings administrator without platform-owner access',async({page})=>{
 const auth=await p0OwnerFixture(page,{role:'admin'});const provider=process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL||'http://127.0.0.1:3105';let calls=0;
 await page.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:buildAuthStorageKeys(provider).admin,session:auth.session});
 await page.route('**/api/admin/verify',route=>route.fulfill({json:{is_super_admin:false,permissions:{settings:true}}}));await page.route('**/api/admin/data?**',route=>route.fulfill({json:{admin_users:[]}}));await page.route('**/api/admin/inbox-counts',route=>route.fulfill({json:{support:0,complaints:0}}));await page.route('**/api/admin/referral-campaigns',route=>{calls++;return route.fulfill({status:403,json:{error:'Denied'}});});
 await page.goto('/admin/settings');await expect(page.getByRole('link',{name:/Referral campaigns/})).toHaveCount(0);await page.goto('/admin/settings/referrals');await expect(page.getByRole('main').getByRole('alert')).toHaveText('Only a Super Admin can configure referral campaigns.');await expect(page.getByRole('button',{name:'New inactive campaign',exact:true})).toHaveCount(0);expect(calls).toBe(0);
});

for(const [locale,width,height] of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const){
 test(`Referral configuration saves final terms inactive and verifies refresh in ${locale}`,async({page},info)=>{
  const auth=await p0OwnerFixture(page,{locale,role:'admin'}),t=(value:string)=>referralCopy(locale,value);const provider=process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL||'http://127.0.0.1:3105';
  await page.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:buildAuthStorageKeys(provider).admin,session:auth.session});
  await page.route('**/api/admin/verify',route=>route.fulfill({json:{is_super_admin:true}}));await page.route('**/api/admin/data?**',route=>route.fulfill({json:{admin_users:[]}}));await page.route('**/api/admin/inbox-counts',route=>route.fulfill({json:{support:0,complaints:0}}));
  const campaigns:ReferralWorkspace['campaigns']=[];const actions:string[]=[];
  await page.route('**/api/admin/referral-campaigns',async route=>{
   expect(route.request().headers().authorization).toBe(`Bearer ${auth.session.access_token}`);
   if(route.request().method()==='POST'){
    const body=route.request().postDataJSON();actions.push(body.action);expect(body.action).toBe('save');expect(body.status).toBeUndefined();expect(body.terms).toEqual({currency:'usd',amount_cents:700,recipient:'referred',starts_at:'2026-10-01T09:00:00.000Z',ends_at:'2026-11-01T09:00:00.000Z',minimum_payment_cents:8900,qualifying_days:30,hold_days:14,max_rewards_per_referrer:5});
    campaigns.splice(0,campaigns.length,{id:body.id,title:body.title,revision:body.revision+1,status:'inactive',terms:body.terms});
   }
   return route.fulfill({json:{campaigns,activation_enabled:false,issuance_enabled:false}});
  });
  await page.setViewportSize({width,height});await page.goto('/admin/settings');await page.getByRole('link',{name:new RegExp(t('Referral campaigns'))}).click();await expect(page).toHaveURL(/\/admin\/settings\/referrals$/);const panel=page.getByRole('region',{name:t('Referral campaign configuration'),exact:true});await panel.getByRole('button',{name:t('New inactive campaign'),exact:true}).click();
  await panel.getByLabel(t('Campaign title'),{exact:true}).fill('Final draft GC176');await panel.getByRole('combobox',{name:t('Recipient'),exact:true}).selectOption('referred');
  for(const [label,value] of [['Reward amount (USD cents)','700'],['Minimum qualifying payment (USD cents)','8900'],['Qualification window (days)','30'],['Review hold (days)','14'],['Maximum rewards per referring business','5'],['Campaign start (UTC)','2026-10-01T09:00'],['Campaign end (UTC)','2026-11-01T09:00']])await panel.getByLabel(t(label),{exact:true}).fill(value);
  await panel.getByRole('button',{name:t('Save inactive campaign'),exact:true}).click();await expect(panel.getByRole('status')).toContainText(t('Campaign draft saved and verified. It remains inactive.'));expect(actions).toEqual(['save']);
  await page.reload();await panel.getByRole('button',{name:`Final draft GC176 · ${t('inactive')}`,exact:true}).click();await expect(panel.getByLabel(t('Reward amount (USD cents)'),{exact:true})).toHaveValue('700');await expect(panel.getByRole('combobox',{name:t('Recipient'),exact:true})).toHaveValue('referred');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await panel.screenshot({path:info.outputPath(`referral-configuration-${locale}-${width}.png`)});
  expect(campaigns[0].status).toBe('inactive');expect(actions).toEqual(['save']);
 });
}
