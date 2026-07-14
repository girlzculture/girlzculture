import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!token)return Response.json({isAdmin:false},{status:401});
  const admin=getSupabaseAdmin();
  const {data}=await admin.auth.getUser(token);
  const email=data.user?.email?.trim().toLowerCase()||"";
  const {data:rows}=await admin.from("admin_users").select("id,email,role,status,permissions,is_super_admin").ilike("email",email);
  const found=(rows||[]).find(row=>row.email?.trim().toLowerCase()===email&&row.status!=="Inactive");
  if(found?.status==="Invited")await admin.from("admin_users").update({status:"Active",activated_at:new Date().toISOString()}).eq("id",found.id).eq("status","Invited");
  console.info("Admin login verification",{email,foundInAdminUsers:Boolean(found),result:found?"allowed":"denied"});
  return Response.json({isAdmin:Boolean(found),email,role:found?.role||null,permissions:found?.permissions||{},is_super_admin:Boolean(found?.is_super_admin)},{status:found?200:403});
}
