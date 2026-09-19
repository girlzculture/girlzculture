import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeFailureDiagnostics, stripeGet, stripeRequest } from "@/lib/stripeServer";
import { UserSafeRequestError } from "@/lib/platformErrors";
import { archiveExplicitPhaseResponse } from '@/lib/subscriptionPaymentExplicitPhase';

/** Serializes app-controlled plan/cancellation writes with method setup. An
 * uncertain provider response retains its durable write-started hold until
 * billing reconciliation; expiry alone cannot authorize a conflicting write. */
export async function withSubscriptionMutation<T>(input:{admin:SupabaseClient;salonId:string;actorId:string;subscriptionId:string}, run:(provider:{get:typeof stripeGet;post:typeof stripeRequest;intentKey:(stage:string)=>string})=>Promise<T>) {
 const lease=randomUUID();
 const args={p_salon:input.salonId,p_actor:input.actorId,p_subscription:input.subscriptionId,p_lease:lease};
 const acquired=await input.admin.rpc("acquire_subscription_mutation",args);
 if(acquired.error){
  if(/SUBSCRIPTION_MUTATION_REVIEW_REQUIRED/.test(acquired.error.message))throw Object.assign(new Error("SUBSCRIPTION_MUTATION_REVIEW_REQUIRED"),{code:"SUBSCRIPTION_MUTATION_REVIEW_REQUIRED"});
  if(/SUBSCRIPTION_MUTATION_BUSY/.test(acquired.error.message))throw new UserSafeRequestError("A billing update is already in progress. Finish or cancel the payment-method setup before changing the subscription.",409);
  throw acquired.error;
 }
 const signal=AbortSignal.timeout(45_000);
 const reads:Record<string,string>={};let mayHaveWritten=false;
 const release=async()=>{const result=await input.admin.rpc("release_subscription_mutation",args);if(result.error||result.data!==true)throw new Error("SUBSCRIPTION_MUTATION_RELEASE_FAILED");};
 const provider={
  // The lease is durable before callback entry; each exact key/payload is also
  // recorded before send. Opposite completed intents in one billing period
  // must never reuse Stripe's cached response from an earlier generation.
  intentKey:(stage:string)=>{if(!/^[a-z][a-z0-9-]{0,79}$/.test(stage))throw new Error('SUBSCRIPTION_MUTATION_STAGE_INVALID');return `subscription-mutation:${lease}:${stage}`;},
  get:async<V>(path:string,options?:Parameters<typeof stripeGet>[1])=>{const value=await stripeGet<V>(path,{...options,signal});reads[path]=createHash("sha256").update(JSON.stringify(value)).digest("hex");return value;},
  post:async<V>(path:string,values:Parameters<typeof stripeRequest>[1],options?:Parameters<typeof stripeRequest>[2])=>{
   signal.throwIfAborted();
   // Stripe previews create no invoice/subscription change. A failed preview
   // must not leave a durable mutation latch merely because its verb is POST.
   if(path==='/invoices/create_preview'){
    const allowed=await input.admin.rpc('assert_subscription_mutation',args);
    if(allowed.error||allowed.data!==true)throw new Error('SUBSCRIPTION_MUTATION_LEASE_LOST');
    signal.throwIfAborted();return stripeRequest<V>(path,values,{...options,signal});
   }
   const checked=await input.admin.rpc("record_subscription_mutation_request",{...args,p_intent:{path,values,idempotency_key:options?.idempotencyKey||null,baseline_hashes:reads}});
   if(checked.error||checked.data!==true)throw new Error("SUBSCRIPTION_MUTATION_LEASE_LOST");
   signal.throwIfAborted();
   const priorWrite=mayHaveWritten;mayHaveWritten=true;let requestId:string|null=null;
   try{
    const value=await stripeRequest<V>(path,values,{...options,signal,onResponse:evidence=>{requestId=evidence.requestId;options?.onResponse?.(evidence);}});
    const recorded=await input.admin.rpc("record_subscription_mutation_response",{...args,p_request_id:requestId});
    if(recorded.error||recorded.data!==true)throw Object.assign(new Error("SUBSCRIPTION_MUTATION_EVIDENCE_FAILED"),{code:'SUBSCRIPTION_MUTATION_REVIEW_REQUIRED'});
    try{await archiveExplicitPhaseResponse({admin:input.admin,salonId:input.salonId,actorId:input.actorId,subscriptionId:input.subscriptionId,leaseId:lease,path,values,response:value,apiVersion:options?.apiVersion});}
    catch(error){throw Object.assign(error instanceof Error?error:new Error('SUBSCRIPTION_MUTATION_EVIDENCE_FAILED'),{code:'SUBSCRIPTION_MUTATION_REVIEW_REQUIRED'});}
    return value;
   }catch(error){
    const detail=error&&typeof error==='object'?error as {provider?:string;status?:number;deliveryUncertain?:boolean}:{};
    const diagnostics=stripeFailureDiagnostics(error);
    // A payment-required402 or idempotency409 can have billing effects. Only
    // explicit pre-execution parameter rejection plus unchanged authoritative
    // reads can clear the first-write hold.
    if(!priorWrite&&detail.provider==='stripe'&&detail.deliveryUncertain===false&&detail.status===400&&diagnostics?.provider_type==='invalid_request_error'&&['parameter_missing','parameter_unknown','parameter_invalid_integer','parameter_invalid_empty','parameter_invalid_string_blank'].includes(diagnostics.provider_code)&&Object.keys(reads).length){
     try{let unchanged=true;for(const [path,digest] of Object.entries(reads)){const value=await stripeGet(path,{signal});if(createHash('sha256').update(JSON.stringify(value)).digest('hex')!==digest)unchanged=false;}if(unchanged)mayHaveWritten=false;}catch{/* Unverified readback retains the hold. */}
    }
    throw error;
   }
  },
 };
 let result:T;
 try{result=await run(provider);}
 catch(error){if(!mayHaveWritten){await release();throw error;}throw Object.assign(error instanceof Error?error:new Error('SUBSCRIPTION_MUTATION_UNCERTAIN'),{code:'SUBSCRIPTION_MUTATION_REVIEW_REQUIRED'});}
 await release();return result;
}
