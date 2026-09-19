import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {p0OwnerFixture} from './helpers/p0OwnerFixture';
import {GOOGLE_BUSINESS_SOURCE_MESSAGES as messages} from '../../src/i18n/google-business-source-catalog';
test.use({serviceWorkers:'block'});
for(const [locale,width,height]of [['en',390,844],['fr',768,1024],['es',1440,1000],['zh-CN',844,390]] as const)test(`Google Business Profile deferred availability in ${locale}`,async({page},info)=>{
 const f=await p0OwnerFixture(page,{populated:true,locale});await page.setViewportSize({width,height});let writes=0;
 await page.route('**/api/salon/integrations/google',async route=>{expect(route.request().headers().authorization).toBe(`Bearer ${f.session.access_token}`);if(route.request().method()==='POST')writes++;await route.fulfill({json:{available:false,status:'deferred'}});});
 await page.goto('/salon/dashboard/settings/integrations');
 const t=(s:string)=>messages[locale]?.[s]||s,region=page.getByRole('region',{name:t('Google Business Profile'),exact:true});
 await expect(region).toContainText(t('Google Business Profile is not available yet. Activation awaits a qualifying salon profile, Google approval and live verification.'));
 await expect(region.getByRole('button',{name:t('Connect Google profile')})).toHaveCount(0);
 await expect(region.getByRole('checkbox')).toHaveCount(0);
 await region.getByRole('button',{name:'Refresh',exact:true}).or(region.getByRole('button').filter({hasText:/Actualiser|Actualizar|刷新/})).click();
 await expect(region).toContainText(t('Your Girlz Culture page and booking tools continue to work. No Google profile changes or background synchronization are running.'));
 await page.reload();await expect(region).toBeVisible();expect(writes).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('google-deferred.png'),fullPage:true});
});
for(const [width,height]of [[390,844],[1440,1000]])test(`Google Business Profile reviewed update conflict and disconnect at ${width}`,async({page},info)=>{
 await p0OwnerFixture(page,{populated:true});await page.setViewportSize({width,height});
 let status='connected',auto=false,lastError:string|null=null,reviews=0,sends=0;const payloads:Record<string,unknown>[]=[];
 await page.route('**/api/salon/integrations/google',async route=>{
  const body=route.request().method()==='POST'?route.request().postDataJSON():null;
  if(body){payloads.push(body);expect(body).not.toHaveProperty('salon_id');
   if(body.action==='preview'){reviews++;return route.fulfill({json:{before:{title:'Fixture Salon',profile:{description:'Prior description'}},after:{title:'Fixture Salon',profile:{description:'Current description'}},review_hash:'review-'+reviews}});}
   if(body.action==='sync'){sends++;if(sends===1)return route.fulfill({status:409,json:{code:'GOOGLE_REVIEW_CHANGED',request_id:'55000000-0000-4000-8000-000000000001'}});return route.fulfill({json:{status:'completed'}});}
   if(body.action==='auto_sync'){auto=body.enabled;lastError=null;}
   if(body.action==='disconnect'){status='disconnected';auto=false;return route.fulfill({json:{status,revoked:true}});}
  }
  await route.fulfill({json:{available:true,status,auto_sync:auto,last_error:lastError,operations:[]}});
 });
 await page.goto('/salon/dashboard/settings/integrations');const region=page.getByRole('region',{name:'Google Business Profile',exact:true});
 await region.getByRole('button',{name:'Review Google update',exact:true}).click();
 await expect(region.getByText('Prior description',{exact:true})).toBeVisible();await expect(region.getByText('Current description',{exact:true})).toBeVisible();expect(sends).toBe(0);
 await region.getByRole('button',{name:'Send reviewed update'}).click();await expect(region.getByRole('alert')).toContainText('55000000-0000-4000-8000-000000000001');
 await region.getByRole('button',{name:'Review Google update',exact:true}).click();await region.getByRole('button',{name:'Send reviewed update'}).click();await expect(region.getByRole('status')).toContainText('Google accepted the reviewed update.');
 const sent=payloads.filter(x=>x.action==='sync');expect(sent[0].id).not.toBe(sent[1].id);expect(sent[1].review_hash).toBe('review-2');
 await region.getByRole('checkbox').check();await expect(region.getByRole('status')).toHaveText('Automatic synchronization preference saved.');await page.reload();await expect(region.getByRole('checkbox')).toBeChecked();
 await page.screenshot({path:info.outputPath('google-connected-simulated.png'),fullPage:true});
 await region.getByRole('button',{name:'Disconnect Google profile'}).click();await expect(region.getByRole('status')).toContainText('Disconnected. Background synchronization has stopped.');
 await page.reload();await expect(region.getByRole('button',{name:'Connect Google profile'})).toBeVisible();await expect(region.getByRole('checkbox')).toHaveCount(0);
 expect(auto).toBe(false);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('Google Business Profile staff cannot open owner connection controls',async({page})=>{
 const f=await p0OwnerFixture(page,{populated:true,role:'salon_team'});let calls=0;
 await page.route('**/api/salon/workspace',route=>route.fulfill({json:{salon:f.business,isOwner:false,isTeamMember:true,permissions:{settings:true},records:f.records}}));
 await page.route('**/api/salon/integrations/google',route=>{calls++;return route.fulfill({status:403,json:{code:'GOOGLE_ACCESS_DENIED'}});});
 await page.goto('/salon/dashboard/settings/integrations');await expect(page.getByText('Owner-only access',{exact:true})).toBeVisible();expect(calls).toBe(0);
});
