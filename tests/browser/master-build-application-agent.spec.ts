import {expect} from '@playwright/test';
import {test} from './helpers/hydration';
import {buildAuthStorageKeys} from '../../src/lib/authSessionCore';
import {applicationDraftFixture,completeDraft} from './helpers/application';
import {APPLICATION_HELP,applicationQuestions,currentApplicationQuestion,emptyInterview,type ApplicationInterview} from '../../src/lib/applicationInterview';
import {INITIAL_APPLICATION_FIELDS,type ApplicationFields} from '../../src/lib/applicationProgress';
import {masterBuildMessages} from '../../src/i18n/master-build-source-catalog';
test.use({serviceWorkers:'block'});
const provider=process.env.PLAYWRIGHT_ACCEPTANCE_SUPABASE_URL||'http://127.0.0.1:3105';
const user={id:'11111111-1111-4111-8111-111111111111',email:'owner@example.com',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{role:'salon_owner',locale:'en'}};
test.beforeEach(async({page})=>{
 const session={user,access_token:[Buffer.from('{"alg":"none"}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,exp:2147483647})).toString('base64url'),'fixture'].join('.'),refresh_token:'fixture',expires_in:3600,expires_at:2147483647,token_type:'bearer'};
 await page.addInitScript(({key,session})=>sessionStorage.setItem(key,JSON.stringify(session)),{key:buildAuthStorageKeys(provider).salon,session});
 await page.route(`${provider}/auth/v1/user`,r=>r.fulfill({json:user}));
 await page.route('**/api/i18n/preference',r=>r.fulfill({json:{locale:r.request().postDataJSON().locale}}));
});
test('Master application agent completes all questions, uploads, resumes and submits through the shared consent pipeline',async({page},info)=>{
 // 25+ serialized, server-acknowledged autosaves plus upload and final review.
 test.setTimeout(90000);
 const f=await applicationDraftFixture(page),path=`${user.id}/documents/license.png`;
 const submitted:Record<string,unknown>[]=[];const uploads:string[]=[];
 await page.route('**/api/salon/application/documents/prepare',r=>{uploads.push('prepare');return r.fulfill({json:{upload_id:'11111111-1111-4111-8111-111111111112',bucket:'application-documents',path,token:'fixture-signed-upload'}});});
 await page.route(`${provider}/storage/v1/object/upload/sign/**`,r=>{uploads.push('upload');return r.fulfill({json:{Key:path}});});
 await page.route('**/api/salon/application/documents/finalize',r=>{uploads.push('finalize');return r.fulfill({json:{uploaded:true,path}});});
 await page.route('**/api/salon/application',r=>{submitted.push(r.request().postDataJSON());return r.fulfill({json:{ok:true}});});
 await page.setViewportSize({width:390,height:844});await page.goto('/business/apply?plan=solo');
 await page.getByRole('button',{name:'Complete your application with your assistant',exact:true}).click();
 const region=page.getByRole('region',{name:'Application AI Assistant',exact:true});
 const answers:Record<string,string>={operator_type:'solo',owner_name:'Fictional Owner',business_name:'Fixture Studio',business_email:user.email,phone:'2125550123',years_in_operation:'4',location_type:'home',street_address:'123 Fictional Street',address_line2:'',city:'Brooklyn',state:'NY',zip_code:'11201',home_address_public:'false',public_neighborhood:'Bedford-Stuyvesant',offers_mobile:'true',travel_radius_miles:'12',travel_fee:'12.50',services_offered:'Boho / Knotless Braids',price_range:'$180',insurance:'yes',website_url:'',instagram_url:'',plan:'Solo'};
 let count=0,interrupted=false;
 while(true){
  await expect(page.locator('form').getByRole('status').filter({hasText:'Progress saved.'})).toBeVisible();
  const fields=(f.draft?.payload.fields||INITIAL_APPLICATION_FIELDS) as ApplicationFields,state=(f.draft?.payload.assistant||emptyInterview()) as ApplicationInterview;
  const q=currentApplicationQuestion(fields,state);if(!q)break;if(++count>40)throw new Error('Interview did not advance');
  await expect(region.locator('legend')).toHaveText(q.label);
  if(q.key==='documents'){
   await region.locator('input[type="file"]').setInputFiles({name:'license.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCWQAAAAASUVORK5CYII=','base64')});
   await expect.poll(()=>f.draft?.payload.documents).toEqual([path]);await region.getByRole('button',{name:'Continue',exact:true}).click();
  }else if(q.choices){const choice=q.choices.find(([value])=>value===answers[q.key]);expect(choice).toBeTruthy();await region.getByRole('button',{name:choice![1],exact:true}).click();}
  else if(answers[q.key]==='')await region.getByRole('button',{name:'Skip for now',exact:true}).click();
  else{await region.getByLabel('Your answer or application question').fill(answers[q.key]);await region.getByRole('button',{name:'Use this answer',exact:true}).click();}
  await expect.poll(()=>((f.draft?.payload.assistant as ApplicationInterview)?.answered||[]).includes(q.key)).toBe(true);
  if(q.key==='street_address'&&!interrupted){await page.reload();await expect(region).toBeVisible();interrupted=true;expect((f.draft?.payload.fields as ApplicationFields).street_address).toBe(answers.street_address);}
 }
 expect(interrupted).toBe(true);expect(uploads).toEqual(['prepare','upload','finalize']);expect(submitted).toEqual([]);
 await page.screenshot({path:info.outputPath('application-interview-mobile.png'),fullPage:true});
 await region.getByRole('button',{name:'Review & submit',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Review & submit',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Submit Application',exact:true}).click();expect(submitted.length).toBe(0);
 for(const checkbox of await page.locator('form input[type="checkbox"]').all())await checkbox.check();
 await page.getByRole('button',{name:'Submit Application',exact:true}).click();
 await expect.poll(()=>submitted.length).toBe(1);expect(submitted[0]).toMatchObject({operator_type:'solo',selected_plan:'Solo',business_name:'Fixture Studio',services_offered:'Boho / Knotless Braids',street_address:'123 Fictional Street',home_address_public:'false',travel_fee:'12.50',document_urls:[path],consent_authorized:true,consent_terms:true,consent_photos:true});
 await expect(page).toHaveURL(/\/salon\/application-submitted$/);
});
for(const [locale,column] of [['fr',1],['es',2],['zh-CN',3]] as const)test(`Master application agent ${locale} retains a failed message and retries without duplicating or changing an answer`,async({page})=>{
 const f=await applicationDraftFixture(page),draft=completeDraft({operator_type:'solo',stylist_count:'1',location_type:'home'},'Solo');
 const questions=applicationQuestions(draft.fields);const current=questions.findIndex(q=>q.key==='street_address');
 f.draft={revision:3,payload:{...draft,locale,entry_mode:'conversation',assistant:{answered:questions.slice(0,current).map(q=>q.key),turns:[]}}};
 let calls=0;await page.route('**/api/business/application/assistant',r=>{calls++;expect(r.request().postDataJSON()).toEqual({message:'Why do you need this address?',revision:f.draft!.revision});return calls===1?r.fulfill({status:503,json:{error:'The application assistant could not respond. Your draft is safe; retry or continue with the form.'}}):r.fulfill({json:{topic:'address',reply:APPLICATION_HELP.address,value:null,field:'street_address',revision:f.draft!.revision,provider:'openai'}});});
 const dictionary=masterBuildMessages(column),t=(source:string)=>dictionary[source]||source;
 await page.goto('/business/apply');const region=page.getByRole('region',{name:t('Application AI Assistant'),exact:true});
 const input=region.getByLabel(t('Your answer or application question'));await input.fill('Why do you need this address?');
 await region.getByRole('button',{name:t('Ask AI'),exact:true}).click();await expect(input).toHaveValue('');
 await expect(region.getByRole('alert')).toContainText(t('The application assistant could not respond. Your draft is safe; retry or continue with the form.'));
 await expect(region.getByRole('log').getByText('Why do you need this address?',{exact:true})).toHaveCount(1);
 await expect.poll(()=>((f.draft?.payload.assistant as ApplicationInterview)?.failed_message)).toBe('Why do you need this address?');
 await page.reload();await expect(region.getByRole('log').getByText('Why do you need this address?',{exact:true})).toHaveCount(1);
 await region.getByRole('button',{name:t('Retry this message'),exact:true}).click();
 await expect(region.getByRole('log')).toContainText(t(APPLICATION_HELP.address));expect(calls).toBe(2);
 await expect(region.getByRole('log').getByText('Why do you need this address?',{exact:true})).toHaveCount(1);
 await expect.poll(()=>((f.draft?.payload.assistant as ApplicationInterview)?.turns||[]).length).toBe(2);
 await page.reload();await expect(region.getByRole('log')).toContainText(t(APPLICATION_HELP.address));
 expect((f.draft?.payload.fields as ApplicationFields).street_address).toBe('123 Test Street');
 await expect(region.locator('legend')).toHaveText(t('Verification street address'));
});
