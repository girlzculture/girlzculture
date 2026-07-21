import type { SupabaseClient } from "@supabase/supabase-js";

export type DeletionRole="customer"|"salon_owner"|"salon_team"|"admin";

export async function assertRecentHighRiskVerification(admin:SupabaseClient,userId:string,scope:"admin"|"salon"){
  const cutoff=new Date(Date.now()-15*60_000).toISOString();
  const{data,error}=await admin.from("auth_mfa_challenges").select("id,used_at").eq("user_id",userId).eq("role_scope",scope).not("used_at","is",null).gte("used_at",cutoff).order("used_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;if(!data)throw new Error("Recent verification is required. Sign out, sign in again, complete the verification code, and retry within 15 minutes.");
}

async function count(admin:SupabaseClient,table:string,column:string,value:string){const{count,error}=await admin.from(table).select("*",{count:"exact",head:true}).eq(column,value);if(error){console.warn("Identity dependency count unavailable",{table,code:error.code});return 0;}return count||0}

export async function identityDependencySummary(admin:SupabaseClient,userId:string,role:DeletionRole,recordId:string){
  if(role==="customer")return{bookings:await count(admin,"bookings","customer_id",userId),reviews:await count(admin,"reviews","customer_id",userId),support_requests:await count(admin,"support_tickets","customer_id",userId),complaints:await count(admin,"complaints_log","customer_id",userId),favorites:await count(admin,"customer_favorites","customer_id",userId)};
  if(role==="salon_team")return{team_memberships:await count(admin,"salon_team_members","user_id",userId),linked_stylists:await count(admin,"stylists","user_id",userId)};
  if(role==="admin")return{security_events:await count(admin,"admin_security_events","actor_user_id",userId),configuration_versions:await count(admin,"engine_setting_versions","created_by",userId),record_actions:await count(admin,"record_management_events","acting_user_id",userId)};
  return{owned_salons:await count(admin,"salons","user_id",userId),record_id:recordId};
}

export async function prepareAndDeleteIdentity(admin:SupabaseClient,input:{targetUserId:string;role:DeletionRole;targetRecordId:string;actorUserId:string;reason:string;dependencies:Record<string,unknown>}){
  const prepared=await admin.rpc("prepare_identity_deletion",{p_target_user_id:input.targetUserId,p_primary_role:input.role,p_target_record_id:input.targetRecordId,p_actor_user_id:input.actorUserId,p_reason:input.reason,p_dependency_summary:input.dependencies});
  if(prepared.error)throw prepared.error;const jobId=String(prepared.data||"");
  const deleted=await admin.auth.admin.deleteUser(input.targetUserId,false);
  if(deleted.error){await admin.from("identity_deletion_jobs").update({status:"Auth deletion failed",error_code:deleted.error.code||"provider_error"}).eq("id",jobId);throw new Error("The database was prepared, but authentication deletion did not finish. The identity remains disabled; contact support with the deletion job ID.");}
  await admin.from("identity_deletion_jobs").update({status:"Completed",completed_at:new Date().toISOString(),error_code:null}).eq("id",jobId);
  return{jobId,reusable:true};
}
