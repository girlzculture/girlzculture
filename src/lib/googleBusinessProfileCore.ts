import "server-only";
import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from "node:crypto";

export const GOOGLE_BUSINESS_SCOPE="https://www.googleapis.com/auth/business.manage";
export const GOOGLE_ACTIVATION_DEFERRED="Live activation deferred by founder—awaiting a qualifying salon profile, Google approval and live verification.";
export type GoogleProfileConfig={clientId:string;clientSecret:string;key:Buffer;redirectUri:string;mode:"acceptance"|"live";acceptanceOwner:string};
export class GoogleProfileError extends Error {
 constructor(readonly code:string,readonly status=503){super(code);}
}
export function googleProfileConfig(env:NodeJS.ProcessEnv=process.env):GoogleProfileConfig|null {
 const mode=env.GOOGLE_BUSINESS_PROFILE_ACTIVATION;
 if(!["acceptance","live"].includes(mode||"")||env.GOOGLE_BUSINESS_PROFILE_APPROVED!=="true")return null;
 const verifiedAt=Date.parse(env.GOOGLE_BUSINESS_PROFILE_VERIFIED_AT||"");
 if(mode==="live"&&(!Number.isFinite(verifiedAt)||verifiedAt>Date.now()))return null;
 const clientId=env.GOOGLE_BUSINESS_PROFILE_CLIENT_ID||"",clientSecret=env.GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET||"",encoded=env.GOOGLE_BUSINESS_PROFILE_ENCRYPTION_KEY||"";
 if(!clientId.endsWith(".apps.googleusercontent.com")||!clientSecret||/[\r\n\s]/.test(clientSecret)||!/^[A-Za-z0-9+/]{43}=$/.test(encoded))return null;
 const key=Buffer.from(encoded,"base64");if(key.length!==32)return null;
 let redirect:URL;try{redirect=new URL(env.GOOGLE_BUSINESS_PROFILE_REDIRECT_URI||"");}catch{return null;}
 if(redirect.protocol!=="https:"||redirect.username||redirect.password||redirect.port||redirect.search||redirect.hash||redirect.pathname!=="/api/salon/integrations/google/callback")return null;
 if(mode==="live"&&redirect.hostname!=="girlzculture.com")return null;
 if(mode==="acceptance"&&(!/^[a-f0-9]{24}--girlzculture\.netlify\.app$/.test(redirect.hostname)||!env.GOOGLE_BUSINESS_PROFILE_ACCEPTANCE_OWNER_ID))return null;
 return {clientId,clientSecret,key,redirectUri:redirect.toString(),mode:mode as "acceptance"|"live",acceptanceOwner:env.GOOGLE_BUSINESS_PROFILE_ACCEPTANCE_OWNER_ID||""};
}
export function assertGoogleAccess(config:GoogleProfileConfig|null,origin:string,owner:string,background=false):asserts config is GoogleProfileConfig {
 if(!config||new URL(config.redirectUri).origin!==origin||(config.mode==="acceptance"&&(background||config.acceptanceOwner!==owner)))throw new GoogleProfileError("GOOGLE_ACTIVATION_DEFERRED",503);
}
export function googleFingerprint(value:unknown):string {
 function sorted(item:unknown):unknown{return Array.isArray(item)?item.map(sorted):item&&typeof item==="object"?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sorted(v)])):item;}
 return createHash("sha256").update(JSON.stringify(sorted(value))).digest("hex");
}
export function sealGoogleSecret(value:unknown,business:string,purpose:string,key:Buffer) {
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from(`gc-google-v1:${business}:${purpose}`));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),encrypted.toString("base64url"),cipher.getAuthTag().toString("base64url")].join(".");
}
export function openGoogleSecret<T>(value:string,business:string,purpose:string,key:Buffer):T {
 try{const [version,iv,data,tag,...extra]=value.split(".");if(version!=="v1"||extra.length)throw Error();const cipher=createDecipheriv("aes-256-gcm",key,Buffer.from(iv,"base64url"));cipher.setAAD(Buffer.from(`gc-google-v1:${business}:${purpose}`));cipher.setAuthTag(Buffer.from(tag,"base64url"));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data,"base64url")),cipher.final()]).toString("utf8"));}
 catch{throw new GoogleProfileError("GOOGLE_CONNECTION_UNAVAILABLE");}
}
export function googleAuthorization(config:GoogleProfileConfig) {
 const state=randomBytes(32).toString("base64url"),verifier=randomBytes(48).toString("base64url");
 const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
 url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:"code",scope:GOOGLE_BUSINESS_SCOPE,access_type:"offline",prompt:"consent",state,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"}).toString();
 return {state,verifier,url:url.toString(),stateHash:createHash("sha256").update(state).digest("hex")};
}
export function verifyGoogleState(state:string,cookie:string) {
 if(!/^[A-Za-z0-9_-]{43}$/.test(state)||state.length!==cookie.length||!timingSafeEqual(Buffer.from(state),Buffer.from(cookie)))throw new GoogleProfileError("GOOGLE_AUTHORIZATION_EXPIRED",400);
 return createHash("sha256").update(state).digest("hex");
}
export type GoogleTokens={access_token:string;refresh_token:string;expires_at:number};
export type GoogleLocation={name:string;title?:string;storefrontAddress?:Record<string,unknown>;phoneNumbers?:Record<string,unknown>;websiteUri?:string;regularHours?:Record<string,unknown>;profile?:Record<string,unknown>;metadata?:Record<string,unknown>};
const allowedFields=["title","phoneNumbers","websiteUri","regularHours","profile"] as const;
export function googleManagedFields(location:GoogleLocation){return Object.fromEntries(allowedFields.filter(k=>location[k]!==undefined).map(k=>[k,location[k]]));}
export function googleLocationId(value:unknown):string{if(typeof value!=="string"||!/^locations\/\d+$/.test(value))throw new GoogleProfileError("GOOGLE_LOCATION_INVALID",400);return value;}
export function googleAccountId(value:unknown):string{if(typeof value!=="string"||!/^accounts\/\d+$/.test(value))throw new GoogleProfileError("GOOGLE_LOCATION_INVALID",400);return value;}

/** Static Google endpoints only. Never include provider response bodies in exceptions/logs. */
export class GoogleProfileProvider {
 constructor(private config:GoogleProfileConfig,private transport:typeof fetch=fetch,private deadline=Date.now()+45_000){}
 private async call(url:string,init:RequestInit={}) {
  const remaining=this.deadline-Date.now();if(remaining<=0)throw new GoogleProfileError("GOOGLE_DEADLINE_EXCEEDED");
  let res:Response;try{res=await this.transport(url,{...init,redirect:"error",signal:AbortSignal.timeout(Math.min(12_000,remaining)),cache:"no-store"});}catch{throw new GoogleProfileError("GOOGLE_NETWORK_UNCERTAIN");}
  if(!res.ok){const code=res.status===401?"GOOGLE_AUTH_RECONNECT":res.status===403?"GOOGLE_ACCESS_UNAVAILABLE":res.status===429?"GOOGLE_RATE_LIMITED":res.status>=500?"GOOGLE_PROVIDER_UNAVAILABLE":"GOOGLE_REQUEST_REJECTED";throw new GoogleProfileError(code,res.status===429?429:503);}
  if(res.status===204)return {};
  try{const text=await res.text();return text?JSON.parse(text) as Record<string,unknown>:{};}catch{throw new GoogleProfileError("GOOGLE_RESPONSE_INVALID");}
 }
 private async token(params:Record<string,string>,prior?:GoogleTokens):Promise<GoogleTokens>{
  const result=await this.call("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({...params,client_id:this.config.clientId,client_secret:this.config.clientSecret})});
  const refresh=String(result.refresh_token||prior?.refresh_token||"");
  if(typeof result.access_token!=="string"||!refresh||Number(result.expires_in)<1||!Number.isFinite(Number(result.expires_in)))throw new GoogleProfileError("GOOGLE_AUTH_RECONNECT");
  if(result.scope&&!String(result.scope).split(" ").includes(GOOGLE_BUSINESS_SCOPE))throw new GoogleProfileError("GOOGLE_AUTH_RECONNECT");
  return {access_token:result.access_token,refresh_token:refresh,expires_at:Date.now()+Number(result.expires_in)*1000};
 }
 exchange(code:string,verifier:string){return this.token({code,code_verifier:verifier,redirect_uri:this.config.redirectUri,grant_type:"authorization_code"});}
 refresh(tokens:GoogleTokens){return this.token({refresh_token:tokens.refresh_token,grant_type:"refresh_token"},tokens);}
 async revoke(token:string){await this.call("https://oauth2.googleapis.com/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token})});}
 async locations(token:string,account:string,pageToken?:string){
  const query=new URLSearchParams({readMask:"name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,profile,metadata",pageSize:"100"});if(pageToken)query.set("pageToken",pageToken);
  return this.call(`https://mybusinessbusinessinformation.googleapis.com/v1/${googleAccountId(account)}/locations?${query}`,{headers:{Authorization:`Bearer ${token}`}});
 }
 accounts(token:string){return this.call("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20",{headers:{Authorization:`Bearer ${token}`}});}
 async location(token:string,name:string):Promise<GoogleLocation>{return await this.call(`https://mybusinessbusinessinformation.googleapis.com/v1/${googleLocationId(name)}?readMask=name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,profile,metadata`,{headers:{Authorization:`Bearer ${token}`}}) as GoogleLocation;}
 async patch(token:string,name:string,patch:Record<string,unknown>){
  if(!Object.keys(patch).length||Object.keys(patch).some(k=>!allowedFields.includes(k as typeof allowedFields[number])))throw new GoogleProfileError("GOOGLE_FIELDS_INVALID",400);
  return this.call(`https://mybusinessbusinessinformation.googleapis.com/v1/${googleLocationId(name)}?updateMask=${encodeURIComponent(Object.keys(patch).join(","))}`,{method:"PATCH",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({name,...patch})});
 }
 createMedia(token:string,account:string,location:string,media:Record<string,unknown>){return this.call(`https://mybusiness.googleapis.com/v4/${googleAccountId(account)}/${googleLocationId(location)}/media`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(media)});}
 createPost(token:string,account:string,location:string,post:Record<string,unknown>){return this.call(`https://mybusiness.googleapis.com/v4/${googleAccountId(account)}/${googleLocationId(location)}/localPosts`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(post)});}
}
