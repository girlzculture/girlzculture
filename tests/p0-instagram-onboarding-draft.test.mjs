import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadNodeTypescript } from './helpers/load-node-typescript.mjs';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const load=loadNodeTypescript(process.cwd());
const core=load('src/lib/businessOnboardingDraft.ts');
const own='instagram-asset:18400000-0000-4000-8000-000000000001';
const other='instagram-asset:18400000-0000-4000-8000-000000000002';

test('onboarding accepts only a server-authorized private Instagram asset token for later explicit review',()=>{
 const facts={...core.emptyOnboardingFacts(),photos:[own]};
 assert.deepEqual(core.onboardingFacts(facts,[own]).photos,[own]);
 assert.throws(()=>core.onboardingFacts({...facts,photos:[other]},[own]),/ONBOARDING_PHOTO_NOT_OWNED/);
});

test('Instagram staging does not turn a provider URL or malformed token into an owned onboarding photo',()=>{
 for(const photo of ['https://cdn.instagram.example/private-image.jpg','instagram-asset:not-a-uuid','javascript:alert(1)'])assert.throws(()=>core.onboardingFacts({...core.emptyOnboardingFacts(),photos:[photo]},[own]),/ONBOARDING_PHOTO_NOT_OWNED/);
 assert.deepEqual(core.onboardingOwnedPhotos([own]),[],'private tokens must never be mistaken for existing public gallery URLs');
});

const provenance=load('src/lib/instagramOnboardingMedia.ts');
const media=load('src/lib/instagramOnboardingMediaServer.ts');
const salon='18400000-0000-4000-8000-000000000010',actor='18400000-0000-4000-8000-000000000020',importId='18400000-0000-4000-8000-000000000030',assetId=own.split(':')[1],draftId='18400000-0000-4000-8000-000000000040';
const source={kind:'instagram',reference:'own_business',permitted:true,provider_import:{provider:'instagram',import_id:importId,username:'own_business',imported_at:'2026-09-19T12:00:00Z',media_ids:[assetId]}};
const image=await sharp({create:{width:800,height:600,channels:3,background:'#006b76'}}).jpeg().toBuffer();
const hash=value=>createHash('sha256').update(value).digest('hex');
const actualFetch=globalThis.fetch,signedWrites=new Map();let sequence=0;
before(()=>{globalThis.fetch=async(url,options)=>{const write=signedWrites.get(String(url));assert.ok(write,'Unexpected network request');assert.equal(options.method,'PUT');assert.equal(options.headers['x-upsert'],'false');assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);return write(options);};});
after(()=>{globalThis.fetch=actualFetch;});
function mediaFixture(){
 const state={owner:true,grant:true,uploads:[],signs:[],queries:[],calls:[],objects:new Map(),tables:{salons:[{id:salon,user_id:actor,status:'Pending',is_discoverable:false}],business_onboarding_drafts:[],service_groups:[],business_instagram_imports:[{id:importId,salon_id:salon,owner_id:actor,status:'reading',expires_at:'2035-01-01T00:00:00Z',draft_id:draftId}],business_instagram_import_assets:[{id:assetId,import_id:importId,salon_id:salon,owner_id:actor,status:'reserved',staging_until:'2035-01-01T00:00:00Z'}]}};
 const admin={from(table){const filters=[];let cap=Infinity;const result=()=>{state.queries.push({table,filters:filters.map(([key,value])=>({key,value}))});assert.ok(state.tables[table],`Unexpected table ${table}`);return state.tables[table].filter(row=>filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):value===row[key])).slice(0,cap);};const q={select(){return q;},eq(key,value){filters.push([key,value]);return q;},in(key,value){filters.push([key,value]);return q;},limit(value){cap=value;return q;},order(){return q;},is(key,value){filters.push([key,value]);return q;},single(){return q.maybeSingle();},async maybeSingle(){return {data:result()[0]||null,error:null};},then(resolve,reject){return Promise.resolve({data:result(),error:null}).then(resolve,reject);}};return q;},
  async rpc(name,args){state.calls.push({name,args});assert.equal(args.p_salon,salon);assert.equal(args.p_owner??args.p_user??args.p_actor,actor);if(name==='p0_actor_has_permission')return {data:state.grant,error:null};if(name==='save_business_onboarding_draft'){const row=state.tables.business_onboarding_drafts[0];Object.assign(row,{source:args.p_source,facts:args.p_facts,uncertain:args.p_uncertain,revision:row.revision+1});return {data:row,error:null};}if(name==='apply_business_onboarding_draft'){const row=state.tables.business_onboarding_drafts[0];Object.assign(row,{status:'applied',result:{published:false,services_created:0,team_ids:[]}});state.tables.business_instagram_import_assets.forEach(asset=>{asset.status='applied';});return {data:row,error:null};}assert.equal(name,'manage_business_instagram');const row=state.tables.business_instagram_import_assets.find(row=>row.id===args.p_args.asset_id);if(args.p_action==='begin_prepare'){row.staging_until='2035-01-01T00:00:00Z';return {data:{reserved:true},error:null};}assert.equal(args.p_action,'prepare_asset');assert.equal(args.p_args.draft_id,draftId);assert.equal(args.p_args.revision,1);assert.equal(args.p_args.private_sha256,row.private_sha256);row.status='prepared';row.public_path=args.p_args.public_path;row.public_url=args.p_args.public_url;return {data:{prepared:true},error:null};},
  storage:{from(bucket){return {async createSignedUploadUrl(path){const signedUrl=`https://storage.example.test/storage/v1/object/upload/sign/${bucket}/${path}?token=fixture-${++sequence}`;signedWrites.set(signedUrl,options=>{state.uploads.push({bucket,path,options:{upsert:false}});const key=`${bucket}:${path}`;if(state.objects.has(key))return Response.json({error:'exists'},{status:409});state.objects.set(key,Buffer.from(options.body));if(state.revokeAfterUpload)state.grant=false;if(state.purgeAfterUpload)state.tables.business_instagram_imports[0].status='purge_pending';return Response.json({Key:path});});return {data:{signedUrl},error:null};},async remove(paths){if(state.removeFailure)return {error:{message:'cleanup failure'}};for(const path of paths)state.objects.delete(`${bucket}:${path}`);return {error:null};},async download(path){const bytes=state.objects.get(`${bucket}:${path}`);return bytes?{data:new Blob([bytes]),error:null}:{data:null,error:{message:'not found'}};},async createSignedUrl(path,seconds){state.signs.push({bucket,path,seconds});return state.objects.has(`${bucket}:${path}`)?{data:{signedUrl:`https://storage.example.test/private/${encodeURIComponent(path)}?token=fixture-only`},error:null}:{error:{message:'missing'}};},getPublicUrl(path){return {data:{publicUrl:`https://storage.example.test/storage/v1/object/public/${bucket}/${path}`}};}};}}
 };
 const context={admin,isOwner:true,salon:{id:salon},user:{id:actor}};
 async function stage(){const result=await media.stageInstagramOnboardingPhoto(context,{importId,assetId,bytes:image,declaredMimeType:'image/jpeg'});state.tables.business_instagram_imports[0].status='drafted';state.tables.business_instagram_import_assets=[{id:assetId,import_id:importId,salon_id:salon,owner_id:actor,private_path:result.storage_path,private_sha256:result.checksum_sha256,mime:result.mime_type,width:result.width,height:result.height,status:'staged',public_path:null,public_url:null}];return result;}
 const draft={id:draftId,revision:1,status:'draft',source,facts:{photos:[own]}};
 return {state,context,stage,draft};
}

test('server provenance survives review edits but cannot be forged, moved to another source or supplied by a client',()=>{
 assert.deepEqual(provenance.preservedInstagramOnboardingSource(source,{kind:'instagram',reference:'own_business'}),source.provider_import);
 assert.equal(provenance.preservedInstagramOnboardingSource(source,{kind:'manual',reference:''}),null);
 assert.equal(provenance.preservedInstagramOnboardingSource(source,{kind:'instagram',reference:'another_business'}),null);
 assert.throws(()=>core.onboardingSource(source),/ONBOARDING_INVALID/,'Client source input never accepts provider_import');
 assert.equal(provenance.preservedInstagramOnboardingSource({...source,provider_import:{...source.provider_import,media_ids:['foreign']}},source),null);
});

test('canonical image staging writes only private originals and verifies identical retries without overwrite',async()=>{
 const f=mediaFixture(),first=await f.stage(),second=await f.stage();
 assert.deepEqual(second,first);assert.equal(first.bucket_id,'media-originals');assert.equal(first.width,800);assert.equal(first.height,600);
 assert.equal(first.storage_path,`${salon}/instagram-onboarding/${importId}/${assetId}.jpg`);
 assert.equal(first.checksum_sha256,hash(f.state.objects.get(`media-originals:${first.storage_path}`)));
 assert.ok(f.state.uploads.every(row=>row.bucket==='media-originals'&&row.options.upsert===false));
 assert.equal(f.state.calls.some(row=>row.name==='manage_business_instagram'),false);assert.equal(f.state.tables.salons[0].gallery_photos,undefined);
});

test('staging rejects nonowners, invalid image bytes and revoked permissions without public storage writes',async()=>{
 const denied=mediaFixture();denied.context.isOwner=false;await assert.rejects(denied.stage(),/ONBOARDING_FORBIDDEN/);assert.equal(denied.state.uploads.length,0);
 const invalid=mediaFixture();await assert.rejects(media.stageInstagramOnboardingPhoto(invalid.context,{importId,assetId,bytes:Buffer.from('not an image'),declaredMimeType:'image/jpeg'}));assert.equal(invalid.state.uploads.length,0);
 const revoked=mediaFixture();revoked.state.revokeAfterUpload=true;await assert.rejects(revoked.stage(),/ONBOARDING_FORBIDDEN/);assert.ok(revoked.state.uploads.every(row=>row.bucket==='media-originals'));
});

test('private previews are short lived and own-scoped; unavailable previews do not publish or erase the draft',async()=>{
 const f=mediaFixture();await f.stage();const previews=await media.instagramOnboardingPreviews(f.context,[f.draft]);
 assert.equal(previews[0].token,own);assert.match(previews[0].url,/\/private\//);assert.equal(f.state.signs[0].seconds,120);
 assert.ok(f.state.queries.filter(row=>row.table.includes('instagram')).every(row=>row.filters.some(item=>item.key==='salon_id'&&item.value===salon)&&row.filters.some(item=>item.key==='owner_id'&&item.value===actor)));
 f.state.objects.clear();assert.deepEqual(await media.instagramOnboardingPreviews(f.context,[f.draft]),[]);assert.deepEqual(f.draft.facts.photos,[own]);
 assert.equal(f.state.calls.some(row=>row.name==='manage_business_instagram'),false);
});

test('foreign ownership, moved parent, purge state and forged private paths are rejected before signing',async()=>{
 for(const mutate of [f=>{f.state.tables.business_instagram_import_assets[0].owner_id='foreign';},f=>{f.state.tables.business_instagram_imports[0].salon_id='foreign';},f=>{f.state.tables.business_instagram_imports[0].status='purge_pending';},f=>{f.state.tables.business_instagram_import_assets[0].private_path='another-business/secret.jpg';}]){
  const f=mediaFixture();await f.stage();mutate(f);await assert.rejects(media.readInstagramOnboardingAssets(f.context,source,[own]),/ONBOARDING_PHOTO_NOT_OWNED/);assert.equal(f.state.signs.length,0);
 }
});

test('explicit confirmation prepares only selected verified images and canonical SQL alone attaches the gallery',async()=>{
 const f=mediaFixture();await f.stage();assert.equal(f.state.uploads.some(row=>row.bucket==='salon-photos'),false);
 const prepared=await media.prepareInstagramOnboardingPhotos(f.context,f.draft);assert.equal(prepared.length,1);assert.equal(prepared[0].token,own);
 assert.equal(f.state.tables.business_instagram_import_assets[0].status,'prepared');assert.equal(f.state.tables.salons[0].gallery_photos,undefined);
 assert.equal(f.state.calls.filter(row=>row.name==='manage_business_instagram'&&row.args.p_action==='prepare_asset').length,1);assert.equal(f.state.uploads.filter(row=>row.bucket==='salon-photos').length,1);
 await media.prepareInstagramOnboardingPhotos(f.context,f.draft);assert.equal(f.state.objects.size,2,'Retry verifies the same two objects; no duplicate gallery or public path');
});

test('changed staged bytes or a conflicting public object cannot be silently overwritten or marked prepared',async()=>{
 const f=mediaFixture();await f.stage();const row=f.state.tables.business_instagram_import_assets[0];f.state.objects.set(`media-originals:${row.private_path}`,Buffer.from('tampered'));
 await assert.rejects(media.prepareInstagramOnboardingPhotos(f.context,f.draft),/ONBOARDING_INSTAGRAM_UNAVAILABLE/);assert.equal(f.state.uploads.some(row=>row.bucket==='salon-photos'),false);
 const conflicting=mediaFixture();await conflicting.stage();conflicting.state.objects.set(`salon-photos:${conflicting.state.tables.business_instagram_import_assets[0].private_path}`,Buffer.from('different public file'));
 await assert.rejects(media.prepareInstagramOnboardingPhotos(conflicting.context,conflicting.draft),/ONBOARDING_INSTAGRAM_UNAVAILABLE/);assert.equal(conflicting.state.calls.some(row=>row.name==='manage_business_instagram'&&row.args.p_action==='prepare_asset'),false);
});

test('all Instagram controls and private draft messages have explicit four-language copy',()=>{
 const {INSTAGRAM_ONBOARDING_MESSAGES:messages}=load('src/i18n/instagram-onboarding-copy.ts');const keys=Object.keys(messages.en).sort();
 for(const locale of ['en','fr','es','zh-CN']){assert.deepEqual(Object.keys(messages[locale]).sort(),keys);for(const key of keys)assert.ok(messages[locale][key].trim());}
 for(const locale of ['fr','es','zh-CN'])for(const key of ['title','unavailable','permission','private','draft','evidence'])assert.notEqual(messages[locale][key],messages.en[key]);
});

test('deauthorization during staging removes only the newly created private object and surfaces failed cleanup',async()=>{
 const f=mediaFixture();f.state.purgeAfterUpload=true;await assert.rejects(f.stage(),/ONBOARDING_PHOTO_NOT_OWNED/);assert.equal(f.state.objects.size,0);
 const failed=mediaFixture();failed.state.purgeAfterUpload=true;failed.state.removeFailure=true;await assert.rejects(failed.stage(),/ONBOARDING_INSTAGRAM_CLEANUP_PENDING/);assert.equal(failed.state.objects.size,1,'Durable reserved asset remains for backend cleanup; no success claim');
});

test('expired staging leases reject before creating any storage upload',async()=>{
 const f=mediaFixture();f.state.tables.business_instagram_import_assets[0].staging_until=new Date(Date.now()+20_000).toISOString();await assert.rejects(f.stage(),/ONBOARDING_PHOTO_NOT_OWNED/);assert.equal(f.state.uploads.length,0);
});

test('applied photos retain exact approved public previews after private-original retention cleanup',async()=>{
 const f=mediaFixture();await f.stage();await media.prepareInstagramOnboardingPhotos(f.context,f.draft);const row=f.state.tables.business_instagram_import_assets[0];row.status='applied';f.draft.status='applied';f.state.objects.delete(`media-originals:${row.private_path}`);
 const previews=await media.instagramOnboardingPreviews(f.context,[f.draft]);assert.equal(previews[0].url,row.public_url);assert.equal(f.state.signs.length,0);
 row.public_url='https://other-business.example/private';assert.deepEqual(await media.instagramOnboardingPreviews(f.context,[f.draft]),[]);
});

test('an owner can remove a private photo, save, reload and still preview it before selecting it again',async()=>{
 const f=mediaFixture();await f.stage();f.draft.facts.photos=[];
 const previews=await media.instagramOnboardingPreviews(f.context,[f.draft]);assert.equal(previews[0].token,own);assert.deepEqual(f.draft.facts.photos,[]);assert.equal(f.state.tables.salons[0].gallery_photos,undefined);
});

async function routeFixture(){
 const f=mediaFixture();await f.stage();Object.assign(f.draft,{salon_id:salon,created_by:actor,uncertain:['services','hours','team','policies'],facts:{...core.emptyOnboardingFacts(),identity:{...core.emptyOnboardingFacts().identity,name:'Own imported account'},photos:[own]}});f.state.tables.business_onboarding_drafts=[f.draft];
 const api=loadNodeTypescript(process.cwd(),{
  '@/lib/businessOnboardingAiServer':{structureOnboardingWithAi:async()=>{throw Error('Unexpected AI request during private Instagram draft review');}},
  '@/lib/supabaseAdmin':{requireSalonOwner:async()=>({...f.context,salon:{...f.state.tables.salons[0],name:'Owner workspace',gallery_photos:[],slug:'owner-workspace'}})},
  '@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class RateLimitError extends Error{},cleanUsPhone:load('src/lib/requestSecurity.ts').cleanUsPhone},
  '@/lib/platformErrors':{capturePlatformError:async()=> 'INSTAGRAM-EXACT-REFERENCE',safeFailure:(message,reference,status,extra)=>Response.json({...extra,request_id:reference,error:message},{status,headers:{'X-Request-ID':reference}})},
  '@/lib/contentModerationServer':{moderatePublicContent:async()=>{f.state.moderated=true;return {allowed:!f.state.blocked};}},
  '@/lib/operationalMonitoring':{routeMonitoringProfile(){return {};},withOperationalMonitoring(_profile,handler){return handler;}},
 })('src/app/api/salon/onboarding-draft/route.ts');
 const post=body=>api.POST(new Request('https://fixture.invalid/api/salon/onboarding-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
 const save=overrides=>post({action:'draft',id:draftId,revision:f.draft.revision,source:{kind:'instagram',reference:'own_business',permitted:true},facts:f.draft.facts,locale:'en',...overrides});
 const confirm=overrides=>post({action:'confirm',id:draftId,revision:f.draft.revision,reviewed:[...core.ONBOARDING_SECTIONS],confirm:true,keep_unpublished:true,public_impact:false,...overrides});
 return {...f,api,post,save,confirm};
}

test('actual onboarding route preserves only stored import provenance and private facts through edits and GET',async()=>{
 const f=await routeFixture();const response=await f.save({facts:{...f.draft.facts,identity:{...f.draft.facts.identity,name:'Owner reviewed name'}}});assert.equal(response.status,200);const result=await response.json();assert.equal(result.verified,true);assert.equal(result.published,false);assert.deepEqual(result.draft.source.provider_import,source.provider_import);assert.deepEqual(result.draft.facts.photos,[own]);assert.equal(result.draft.facts.identity.name,'Owner reviewed name');
 const read=await f.api.GET(new Request('https://fixture.invalid/api/salon/onboarding-draft'));assert.equal(read.status,200);const data=await read.json();assert.equal(data.private_photos[0].token,own);assert.deepEqual(data.owned_photos,[]);assert.ok(f.state.uploads.every(row=>row.bucket==='media-originals'));
 assert.equal((await f.save({source})).status,400,'The client cannot submit even accurate provider_import metadata');
 assert.equal((await f.save({source:{kind:'instagram',reference:'foreign_business',permitted:true}})).status,400);
 assert.equal(f.state.calls.filter(row=>row.name==='save_business_onboarding_draft').length,1);
});

test('actual confirmation prepares public media only after six reviewed sections, exact revision and moderation',async()=>{
 for(const scenario of ['missing review','stale revision','moderation']){
  const f=await routeFixture();if(scenario==='moderation')f.state.blocked=true;
  const response=await f.confirm(scenario==='missing review'?{reviewed:['identity']}:scenario==='stale revision'?{revision:2}:{});assert.ok(response.status>=400);assert.equal(f.state.uploads.some(row=>row.bucket==='salon-photos'),false);assert.equal(f.state.calls.some(row=>row.name==='apply_business_onboarding_draft'),false);
 }
 const f=await routeFixture();const response=await f.confirm();assert.equal(response.status,200);const data=await response.json();assert.equal(data.verified,true);assert.equal(data.draft.status,'applied');assert.equal(data.current_is_discoverable,false);assert.equal(f.state.moderated,true);
 const names=f.state.calls.map(row=>row.name==='manage_business_instagram'?row.args.p_action:row.name);assert.ok(names.indexOf('prepare_asset')<names.indexOf('apply_business_onboarding_draft'));assert.equal(f.state.uploads.filter(row=>row.bucket==='salon-photos').length,1);
 const before=f.state.uploads.length;assert.equal((await f.confirm()).status,200);assert.equal(f.state.uploads.length,before,'Canonical apply replay does not upload again');
});

test('actual route cannot preview or prepare a transferred or purged import and retains the protected incident reference',async()=>{
 const f=await routeFixture();f.state.tables.business_instagram_import_assets[0].owner_id='foreign-owner';
 const result=await f.confirm();assert.equal(result.status,409);const body=await result.json();assert.equal(body.code,'ONBOARDING_PHOTO_NOT_OWNED');assert.equal(body.request_id,'INSTAGRAM-EXACT-REFERENCE');assert.equal(result.headers.get('X-Request-ID'),body.request_id);assert.ok(f.state.uploads.every(row=>row.bucket==='media-originals'));assert.equal(f.state.calls.some(row=>row.name==='apply_business_onboarding_draft'),false);
});
