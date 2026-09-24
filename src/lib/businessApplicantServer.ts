import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { rejectRequest } from "@/lib/platformErrors";

export async function requireBusinessApplicant(request: Request) {
 const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim();
 if(!token)rejectRequest("Please sign in to continue your application.",401);
 const admin=getSupabaseAdmin();
 const {data,error}=await admin.auth.getUser(token);
 if(error && Number(error.status || 0)>=500)throw error;
 if(error || !data.user)rejectRequest("Please sign in to continue your application.",401);
 const user=data.user;
 const identity=await admin.from("platform_identities").select("primary_role,status,email_normalized").eq("user_id",user.id).maybeSingle();
 if(identity.error)throw identity.error;
 if(identity.data?.primary_role!=="salon_owner" || identity.data?.status!=="Active" || identity.data?.email_normalized!==user.email?.trim().toLowerCase())rejectRequest("This account cannot edit a business application.",403);
 return {admin,user};
}
