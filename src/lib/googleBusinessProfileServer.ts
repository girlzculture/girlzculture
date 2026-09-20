import "server-only";
import {getSupabaseAdmin,requireSalonOwner} from "@/lib/supabaseAdmin";
import {assertGoogleAccess,googleProfileConfig,GoogleProfileError,GoogleProfileProvider,googleFingerprint,googleManagedFields,googleAuthorization,sealGoogleSecret,openGoogleSecret,verifyGoogleState,googleAccountId,googleLocationId,type GoogleTokens,type GoogleLocation,type GoogleProfileConfig} from "@/lib/googleBusinessProfileCore";
import {capturePlatformError} from "@/lib/platformErrors";
import {enforceRateLimit} from "@/lib/requestSecurity";
import {randomUUID} from "node:crypto";

type Row=Record<string,unknown>;
type Context=Awaited<ReturnType<typeof requireSalonOwner>>;
type Connection={salon_id:string;owner_id:string;status:string;secret:string;generation:number;account_name:string;location_name:string;remote_hash:string;local_hash:string;auto_sync:boolean;last_success_at:string|null;last_error:string|null;lease_id:string|null;lease_until:string|null};
const cookieName="__Host-gc-google-flow";
const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
const validId=(id:unknown)=>typeof id==="string"&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
const normalize=(value:unknown)=>String(value||"").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
function failure(error:unknown){return error instanceof GoogleProfileError?error:new GoogleProfileError(error instanceof Error&&/^(Unauthorized|Forbidden)/.test(error.message)?"GOOGLE_ACCESS_DENIED":"GOOGLE_CONNECTION_UNAVAILABLE",error instanceof Error&&/^(Unauthorized|Forbidden)/.test(error.message)?403:503);}
async function mutate(c:Context,action:string,args:Row={}) {
 const result=await c.admin.rpc("manage_business_google",{p_salon:c.salon.id,p_owner:c.user.id,p_action:action,p_args:args});
 if(result.error){const code=/^GOOGLE_[A-Z_]+$/.test(result.error.message)?result.error.message:"GOOGLE_CONNECTION_UNAVAILABLE";throw new GoogleProfileError(code,/CONFLICT|CHANGED|BUSY/.test(code)?409:503);}return result.data as Row;
}
async function connection(c:Context):Promise<Connection|null>{const r=await c.admin.from("business_google_connections").select("*").eq("salon_id",c.salon.id).eq("owner_id",c.user.id).maybeSingle();if(r.error)throw new GoogleProfileError("GOOGLE_CONNECTION_UNAVAILABLE");return r.data as Connection|null;}
async function session(c:Context,config:GoogleProfileConfig,deadline?:number){
 const row=await connection(c);if(!row||row.status==="disconnected")throw new GoogleProfileError("GOOGLE_CONNECT_REQUIRED",409);
 const provider=new GoogleProfileProvider(config,fetch,deadline);let tokens=openGoogleSecret<GoogleTokens>(row.secret,c.salon.id,"tokens",config.key);
 if(tokens.expires_at<=Date.now()+60_000){tokens=await provider.refresh(tokens);await mutate(c,"tokens",{generation:row.generation,prior_secret:row.secret,secret:sealGoogleSecret(tokens,c.salon.id,"tokens",config.key)});}
 return {row,tokens,provider};
}
export function googleProfileMatchesBusiness(location:GoogleLocation,salon:Row){
 if(normalize(location.title)!==normalize(salon.name))return false;
 const address=location.storefrontAddress||{},phones=location.phoneNumbers||{};
 const samePhone=normalize(phones.primaryPhone).replace(/^1(?=\d{10}$)/,"")===normalize(salon.phone).replace(/^1(?=\d{10}$)/,"")&&Boolean(normalize(salon.phone));
 const sameAddress=Boolean(salon.address_street&&salon.address_zip)&&normalize((address.addressLines as string[]|undefined)?.join(" "))===normalize(salon.address_street)&&normalize(address.postalCode)===normalize(salon.address_zip);
 return samePhone||sameAddress;
}
export function googleBusinessFields(salon:Row):Record<string,unknown>{
 const fields:Row={title:String(salon.name||"")};
 if(salon.phone)fields.phoneNumbers={primaryPhone:String(salon.phone)};
 if(salon.description)fields.profile={description:String(salon.description)};
 const days=["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
 const hours=salon.hours as Row|undefined;const periods:Row[]=[];
 if(hours&&days.every(day=>Object.hasOwn(hours,day)||Object.hasOwn(hours,day[0].toUpperCase()+day.slice(1)))){
  for(let index=0;index<days.length;index++){
   const day=days[index],raw=hours[day]??hours[day[0].toUpperCase()+day.slice(1)];
   const range=raw&&typeof raw==="object"?raw as Row:null;
   if(range?.closed===true||range?.enabled===false||/^closed$/i.test(String(raw||"")))continue;
   const [start,end]=range?[String(range.open||""),String(range.close||"")]:String(raw).split(/\s*(?:-|–|—|to)\s*/i);
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start||"")||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end||""))throw new GoogleProfileError("GOOGLE_HOURS_INVALID",400);
   const [oh,om]=start.split(":").map(Number),[ch,cm]=end.split(":").map(Number);
   periods.push({openDay:day.toUpperCase(),openTime:{hours:oh,minutes:om},closeDay:days[(index+(end<=start?1:0))%7].toUpperCase(),closeTime:{hours:ch,minutes:cm}});
  }
  fields.regularHours={periods};
 }
 return fields;
}
async function ownedLocations(c:Context,provider:GoogleProfileProvider,token:string){
 const accounts=await provider.accounts(token);const matches:Array<{account:string;location:GoogleLocation}>=[];
 // Only matching current-business locations leave this server. Never return other
 // locations, accounts or reviews to the UI, assistant, cache, memory or logs.
 for(const account of (Array.isArray(accounts.accounts)?accounts.accounts:[]).slice(0,20) as Row[]){
  const name=googleAccountId(account.name);let pageToken:string|undefined;
  for(let page=0;page<5;page++){
   const response=await provider.locations(token,name,pageToken);
   for(const loc of (Array.isArray(response.locations)?response.locations:[]) as GoogleLocation[])if(googleProfileMatchesBusiness(loc,c.salon))matches.push({account:name,location:loc});
   pageToken=typeof response.nextPageToken==="string"?response.nextPageToken:undefined;if(!pageToken)break;
  }
 }
 return matches;
}
function ownedMedia(salon:Row,url:unknown){
 if(typeof url!=="string"||!url.startsWith("https://")||!(Array.isArray(salon.gallery_photos)?salon.gallery_photos:[]).includes(url))throw new GoogleProfileError("GOOGLE_MEDIA_UNAVAILABLE",400);
 return {mediaFormat:"PHOTO",sourceUrl:url,locationAssociation:{category:"ADDITIONAL"}};
}
function postPayload(input:Row){
 if(typeof input.summary!=="string"||!input.summary.trim()||input.summary.length>1500||!["en","fr","es","zh-CN"].includes(String(input.locale)))throw new GoogleProfileError("GOOGLE_POST_INVALID",400);
 return {languageCode:input.locale,summary:input.summary.trim(),topicType:"STANDARD"};
}
function reviewedPayload(kind:string,input:Row,salon:Row){return kind==="info"?googleBusinessFields(salon):kind==="media"?ownedMedia(salon,input.url):kind==="post"?postPayload(input):(()=>{throw new GoogleProfileError("GOOGLE_INVALID_INPUT",400);})();}
async function snapshot(c:Context,config:GoogleProfileConfig,kind:string,input:Row,deadline?:number){
 const {row,tokens,provider}=await session(c,config,deadline);if(row.status!=="connected")throw new GoogleProfileError("GOOGLE_LOCATION_REQUIRED",409);
 const remote=await provider.location(tokens.access_token,row.location_name);
 if(remote.name!==row.location_name||!googleProfileMatchesBusiness(remote,c.salon))throw new GoogleProfileError("GOOGLE_LOCATION_MISMATCH",409);
 const payload=reviewedPayload(kind,input,c.salon),remoteFields=googleManagedFields(remote);
 const remoteHash=googleFingerprint(remoteFields),localHash=googleFingerprint(payload);
 return {row,tokens,provider,payload,remoteFields,remoteHash,localHash,reviewHash:googleFingerprint({business:c.salon.id,generation:row.generation,kind,localHash,remoteHash})};
}
async function sync(c:Context,config:GoogleProfileConfig,input:Row,background=false,deadline?:number){
 if(!validId(input.id))throw new GoogleProfileError("GOOGLE_INVALID_INPUT",400);
 const kind=String(input.kind),state=await snapshot(c,config,kind,input,deadline);
 if(background&&(!state.row.auto_sync||state.row.remote_hash!==state.remoteHash))throw new GoogleProfileError("GOOGLE_REMOTE_CONFLICT",409);
 if(!background&&input.review_hash!==state.reviewHash)throw new GoogleProfileError("GOOGLE_REVIEW_CHANGED",409);
 const claim=await mutate(c,"claim",{id:input.id,generation:state.row.generation,kind,payload_hash:googleFingerprint({kind,payload:state.payload})});
 if(claim.existing)return {status:claim.status,repeated:true};
 let wrote=false;
 try{
  // Check both gate and connection again immediately before the provider mutation.
  assertGoogleAccess(googleProfileConfig(),new URL(config.redirectUri).origin,c.user.id,background);
  const current=await connection(c);if(current?.generation!==state.row.generation||current.status!=="connected"||current.lease_id!==input.id)throw new GoogleProfileError("GOOGLE_CONNECTION_CHANGED",409);
  let result:Row;
  if(kind==="info")result=await state.provider.patch(state.tokens.access_token,state.row.location_name,state.payload);
  else if(kind==="media")result=await state.provider.createMedia(state.tokens.access_token,state.row.account_name,state.row.location_name,state.payload);
  else result=await state.provider.createPost(state.tokens.access_token,state.row.account_name,state.row.location_name,state.payload);
  wrote=true;
  const remote=await state.provider.location(state.tokens.access_token,state.row.location_name);
  if(kind==="info"&&Object.entries(state.payload).some(([key,value])=>googleFingerprint((remote as unknown as Row)[key]??null)!==googleFingerprint(value)))throw new GoogleProfileError("GOOGLE_SYNC_UNVERIFIED");
  if(kind!=="info"&&(typeof result.name!=="string"||!result.name.startsWith(`${state.row.account_name}/${state.row.location_name}/`)))throw new GoogleProfileError("GOOGLE_SYNC_UNVERIFIED");
  await mutate(c,"finish",{id:input.id,generation:state.row.generation,status:"completed",provider_name:typeof result.name==="string"?result.name:null,remote_hash:googleFingerprint(googleManagedFields(remote)),local_hash:kind==="info"?state.localHash:state.row.local_hash});
  return {status:"completed"};
 }catch(error){
  const safe=failure(error),uncertain=wrote||safe.code==="GOOGLE_NETWORK_UNCERTAIN";
  await mutate(c,"finish",{id:input.id,generation:state.row.generation,status:uncertain?"uncertain":"failed",error_code:safe.code}).catch(()=>{});
  throw safe;
 }
}
export async function googleBusinessProfileRequest(request:Request){
 let c:Context|undefined;
 try{
  c=await requireSalonOwner(request);if(!c.isOwner)throw new GoogleProfileError("GOOGLE_ACCESS_DENIED",403);
  enforceRateLimit(request,`google-business:${c.user.id}`,30,60_000);
  if(new URL(request.url).searchParams.size)throw new GoogleProfileError("GOOGLE_INVALID_INPUT",400);
  const config=googleProfileConfig();let available=false;
  try{assertGoogleAccess(config,new URL(request.url).origin,c.user.id);available=true;}catch{}
  if(request.method==="GET"){
   if(!available)return Response.json({available:false,status:"deferred"},{headers});
   const row=await connection(c);
   const operations=await c.admin.from("business_google_sync_operations").select("id,kind,status,error_code,created_at,completed_at").eq("salon_id",c.salon.id).order("created_at",{ascending:false}).limit(20);
   if(operations.error)throw new GoogleProfileError("GOOGLE_CONNECTION_UNAVAILABLE");
   return Response.json({available:true,status:row?.status||"disconnected",auto_sync:row?.auto_sync||false,last_success_at:row?.last_success_at||null,last_error:row?.last_error||null,operations:operations.data},{headers});
  }
  const raw=await request.text();if(raw.length>5000)throw new GoogleProfileError("GOOGLE_INVALID_INPUT",400);const input=JSON.parse(raw) as Row;
  if(!input||Array.isArray(input)||Object.keys(input).some(k=>!["action","id","kind","account","location","url","summary","locale","review_hash","enabled"].includes(k)))throw new GoogleProfileError("GOOGLE_INVALID_INPUT",400);
  if(input.action==="disconnect"){
   const result=await mutate(c,"disconnect");let revoked=false;
   if(result.secret&&config){try{const tokens=openGoogleSecret<GoogleTokens>(String(result.secret),c.salon.id,"tokens",config.key);await new GoogleProfileProvider(config).revoke(tokens.refresh_token);revoked=true;}catch{}}
   return Response.json({status:"disconnected",revoked},{headers});
  }
  assertGoogleAccess(config,new URL(request.url).origin,c.user.id);
  if(input.action==="authorize"){
   const auth=googleAuthorization(config);await mutate(c,"flow",{state_hash:auth.stateHash,verifier_secret:sealGoogleSecret(auth.verifier,c.salon.id,"pkce",config.key)});
   return Response.json({url:auth.url},{headers:{...headers,"Set-Cookie":`${cookieName}=${auth.state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`}});
  }
  if(input.action==="locations"){
   const auth=await session(c,config);const choices=await ownedLocations(c,auth.provider,auth.tokens.access_token);
   return Response.json({locations:choices.map(x=>({account:x.account,name:x.location.name,title:x.location.title,address:x.location.storefrontAddress}))},{headers});
  }
  if(input.action==="connect"){
   const auth=await session(c,config),account=googleAccountId(input.account),location=googleLocationId(input.location);
   const choices=await ownedLocations(c,auth.provider,auth.tokens.access_token),chosen=choices.find(x=>x.account===account&&x.location.name===location);
   if(!chosen)throw new GoogleProfileError("GOOGLE_LOCATION_MISMATCH",403);
   await mutate(c,"connect",{generation:auth.row.generation,account,location,remote_hash:googleFingerprint(googleManagedFields(chosen.location)),local_hash:googleFingerprint(googleBusinessFields(c.salon))});
   return Response.json({status:"connected"},{headers});
  }
  if(input.action==="preview"){
   const state=await snapshot(c,config,String(input.kind),input);return Response.json({before:state.remoteFields,after:state.payload,review_hash:state.reviewHash},{headers});
  }
  if(input.action==="sync")return Response.json(await sync(c,config,input),{headers});
  if(input.action==="auto_sync"&&typeof input.enabled==="boolean"){await mutate(c,"auto_sync",{enabled:input.enabled});return Response.json({auto_sync:input.enabled},{headers});}
  throw new GoogleProfileError("GOOGLE_INVALID_INPUT",400);
 }catch(error){
  const safe=error instanceof SyntaxError?new GoogleProfileError("GOOGLE_INVALID_INPUT",400):failure(error);
  const reference=await capturePlatformError({admin:c?.admin,error:Error(safe.code),feature:"google-business-profile",action:"owner-operation",actorRole:"salon",actorId:c?.user.id,salonId:c?.salon.id,safeMessage:"The Google Business Profile operation could not be completed."});
  return Response.json({code:safe.code,request_id:reference},{status:safe.status,headers:{...headers,"X-Request-ID":reference}});
 }
}
export async function googleBusinessCallback(request:Request){
 try{
  const config=googleProfileConfig();if(!config)throw new GoogleProfileError("GOOGLE_ACTIVATION_DEFERRED");
  const url=new URL(request.url),cookie=request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(cookieName+"="))?.slice(cookieName.length+1)||"";
  const hash=verifyGoogleState(url.searchParams.get("state")||"",cookie),admin=getSupabaseAdmin();
  const consumed=await admin.rpc("consume_business_google_flow",{p_hash:hash});
  if(consumed.error||!consumed.data)throw new GoogleProfileError("GOOGLE_AUTHORIZATION_EXPIRED",400);
  const flow=consumed.data as {salon_id:string;owner_id:string;generation:number;verifier_secret:string};
  assertGoogleAccess(config,url.origin,flow.owner_id);
  if(url.searchParams.has("error"))throw new GoogleProfileError("GOOGLE_AUTHORIZATION_CANCELLED",400);
  const code=url.searchParams.get("code");if(!code||code.length>4096)throw new GoogleProfileError("GOOGLE_AUTHORIZATION_EXPIRED",400);
  const verifier=openGoogleSecret<string>(flow.verifier_secret,flow.salon_id,"pkce",config.key);
  const tokens=await new GoogleProfileProvider(config).exchange(code,verifier);
  const saved=await admin.rpc("manage_business_google",{p_salon:flow.salon_id,p_owner:flow.owner_id,p_action:"authorize",p_args:{generation:flow.generation,secret:sealGoogleSecret(tokens,flow.salon_id,"tokens",config.key)}});
  if(saved.error){await new GoogleProfileProvider(config).revoke(tokens.refresh_token).catch(()=>{});throw new GoogleProfileError("GOOGLE_CONNECTION_CHANGED",409);}
  return new Response(null,{status:303,headers:{...headers,Location:"/salon/dashboard/settings/integrations?google=authorized","Set-Cookie":`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}});
 }catch(error){const safe=failure(error);const reference=await capturePlatformError({error:Error(safe.code),feature:"google-business-profile",action:"oauth-callback",actorRole:"salon",safeMessage:"Google authorization could not be completed."});return Response.json({code:safe.code,request_id:reference},{status:safe.status,headers:{...headers,"X-Request-ID":reference,"Set-Cookie":`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}});}
}
export async function processGoogleBusinessProfiles(){
 const config=googleProfileConfig();if(!config||config.mode!=="live")return {disabled:true,checked:0};
 const deadline=Date.now()+18_000;
 const admin=getSupabaseAdmin(),due=await admin.rpc("due_business_google");
 if(due.error)throw new GoogleProfileError("GOOGLE_CONNECTION_UNAVAILABLE");let checked=0;
 for(const row of due.data||[]){
  const owned=await admin.rpc("google_business_owner",{p_salon:row.salon_id,p_owner:row.owner_id});if(owned.data!==true||owned.error)continue;
  const salon=await admin.from("salons").select("*").eq("id",row.salon_id).eq("user_id",row.owner_id).single();if(salon.error||!salon.data)continue;
  const c={admin,salon:salon.data,user:{id:row.owner_id},isOwner:true,teamMember:null} as Context;
  try{const current=await connection(c);checked++;if(current?.local_hash===googleFingerprint(googleBusinessFields(c.salon)))continue;await sync(c,config,{id:randomUUID(),kind:"info"},true,deadline);}
  catch(error){const safe=failure(error);await mutate(c,"check_failed",{generation:row.generation,error_code:safe.code}).catch(()=>{});await capturePlatformError({admin,error:Error(safe.code),feature:"google-business-profile",action:"background-sync",actorRole:"system",salonId:row.salon_id,safeMessage:"Google profile synchronization needs owner review."});}
 }
 return {disabled:false,checked};
}
