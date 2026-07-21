import { randomUUID } from "node:crypto";
import { cleanText } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

type Resource = {
  table:string; permission:string; label:string; nameFields:string[]; actions:string[];
  dependencies?:Array<{table:string;column:string;label:string}>;
};

const resources:Record<string,Resource>={
  service_category:{table:"service_categories",permission:"content",label:"Service categories",nameFields:["name"],actions:["archive","delete"],dependencies:[{table:"service_groups",column:"category_id",label:"service groups"},{table:"service_addons",column:"category_id",label:"add-ons"},{table:"master_styles",column:"category_id",label:"service names"}]},
  service_group:{table:"service_groups",permission:"content",label:"Service groups",nameFields:["name"],actions:["archive","delete","reassign"],dependencies:[{table:"master_styles",column:"service_group_id",label:"service names"}]},
  service_addon:{table:"service_addons",permission:"content",label:"Add-ons",nameFields:["name"],actions:["archive","delete"]},
  master_style:{table:"master_styles",permission:"content",label:"Master service names",nameFields:["name"],actions:["archive","delete","reassign"],dependencies:[{table:"styles",column:"master_style_id",label:"salon services"}]},
  blog_post:{table:"blog_posts",permission:"content",label:"Blog posts",nameFields:["title","slug"],actions:["archive","delete"]},
  content_page:{table:"content_pages",permission:"content",label:"Content pages",nameFields:["title","slug"],actions:["archive"]},
  salon:{table:"salons",permission:"salons",label:"Salons",nameFields:["name","slug"],actions:["offboard"],dependencies:[{table:"bookings",column:"salon_id",label:"bookings"},{table:"styles",column:"salon_id",label:"services"},{table:"stylists",column:"salon_id",label:"stylists"},{table:"subscriptions",column:"salon_id",label:"subscriptions"}]},
  salon_application:{table:"salon_applications",permission:"submissions",label:"Salon applications",nameFields:["business_name","business_email"],actions:["archive"],dependencies:[{table:"salons",column:"id",label:"linked salon"}]},
  stylist:{table:"stylists",permission:"salons",label:"Stylists",nameFields:["name"],actions:["archive","delete"],dependencies:[{table:"bookings",column:"stylist_id",label:"bookings"},{table:"salon_team_members",column:"stylist_id",label:"team access records"}]},
  style:{table:"styles",permission:"salons",label:"Salon services",nameFields:["name"],actions:["archive","delete"],dependencies:[{table:"bookings",column:"style_id",label:"bookings"},{table:"style_materials",column:"style_id",label:"material options"}]},
  salon_product:{table:"salon_products",permission:"salons",label:"Products",nameFields:["name"],actions:["archive","delete"]},
  salon_promotion:{table:"salon_promotions",permission:"marketing",label:"Salon promotions",nameFields:["title"],actions:["archive","delete"]},
  promo_code:{table:"promo_codes",permission:"marketing",label:"Promo codes",nameFields:["code"],actions:["archive","delete"],dependencies:[{table:"promo_code_redemptions",column:"promo_code_id",label:"redemptions"}]},
  customer:{table:"customers",permission:"customers",label:"Customers",nameFields:["name","email"],actions:["anonymize"],dependencies:[{table:"bookings",column:"customer_id",label:"bookings"},{table:"reviews",column:"customer_id",label:"reviews"},{table:"support_tickets",column:"customer_id",label:"support requests"}]},
  booking:{table:"bookings",permission:"bookings",label:"Bookings",nameFields:["confirmation_code","guest_name"],actions:["cancel"],dependencies:[{table:"complaints_log",column:"booking_id",label:"complaints"},{table:"booking_messages",column:"booking_id",label:"messages"}]},
  review:{table:"reviews",permission:"reviews",label:"Reviews",nameFields:["reviewer_name","id"],actions:["archive"]},
  support_ticket:{table:"support_tickets",permission:"support",label:"Support requests",nameFields:["subject","requester_email"],actions:["archive"]},
  featured_campaign:{table:"featured_salon_campaigns",permission:"marketing",label:"Featured campaigns",nameFields:["internal_note","id"],actions:["archive"]},
  trending_campaign:{table:"trending_video_campaigns",permission:"marketing",label:"Trending campaigns",nameFields:["description","id"],actions:["archive"]},
  location_market:{table:"location_markets",permission:"salons",label:"Markets and service areas",nameFields:["name","state_code"],actions:["archive","delete"],dependencies:[{table:"salons",column:"market_id",label:"salons"}]},
  newsletter_subscriber:{table:"newsletter_subscribers",permission:"marketing",label:"Newsletter subscribers",nameFields:["email"],actions:["archive","delete"]},
};

const catalogRpcTypes=new Set(["service_category","service_group","service_addon","master_style","blog_post","content_page","promo_code"]);
const publicSummary=(row:Record<string,unknown>,resource:Resource)=>({id:String(row.id||row.slug||""),label:resource.nameFields.map(key=>String(row[key]||"").trim()).filter(Boolean).join(" · ")||"Untitled record",status:String(row.status??(row.is_active===false?"Inactive":row.is_visible===false?"Hidden":"Active")),archived:Boolean(row.archived_at)});

async function dependencyPlan(admin:Awaited<ReturnType<typeof requireAdminPermission>>["admin"],resource:Resource,id:string){
  const details=[] as Array<{label:string;count:number;retention:string}>;
  for(const dependency of resource.dependencies||[]){
    const query=admin.from(dependency.table).select("*",{count:"exact",head:true}).eq(dependency.column,id);
    const{count,error}=await query;
    if(error){console.warn("Record dependency unavailable",{table:dependency.table,code:error.code});continue;}
    details.push({label:dependency.label,count:count||0,retention:["bookings","subscriptions","redemptions","complaints","messages"].some(word=>dependency.label.includes(word))?"must be retained":"can be reassigned or removed when eligible"});
  }
  return{details,total:details.reduce((sum,item)=>sum+item.count,0)};
}

function friendlyFailure(error:unknown,requestId:string){const message=error instanceof Error?error.message:"The record could not be changed.";if(/still used|must be archived|retained|cannot|Choose|permission|not found|reason|reassign/i.test(message))return message;console.error("Managed record operation failed",{requestId,error});return `The operation could not be completed safely. Nothing was changed. Reference ${requestId}.`;}

export async function GET(request:Request){
  const requestId=randomUUID();
  try{
    const type=new URL(request.url).searchParams.get("resource")||"";const id=new URL(request.url).searchParams.get("id")||"";
    const base=resources[type];const permission=base?.permission||"settings";const{admin}=await requireAdminPermission(request,permission);
    if(type&&base&&id){const{data,error}=await admin.from(base.table).select("*").eq(base.table==="content_pages"?"slug":"id",id).maybeSingle();if(error)throw error;if(!data)return Response.json({error:"Record not found."},{status:404});return Response.json({record:publicSummary(data,base),resource:{type,label:base.label,actions:base.actions},dependencies:await dependencyPlan(admin,base,id)});}
    if(type&&base){const{data,error}=await admin.from(base.table).select("*").order(base.table==="content_pages"?"slug":base.nameFields[0],{ascending:true}).limit(250);if(error)throw error;return Response.json({resource:{type,label:base.label,actions:base.actions},records:(data||[]).map(row=>publicSummary(row,base))});}
    const available=Object.entries(resources).map(([key,value])=>({type:key,label:value.label,actions:value.actions}));
    return Response.json({resources:available});
  }catch(error){console.error("Managed record load failed",{requestId,error});return Response.json({error:`Unable to load record management. Reference ${requestId}.`},{status:500});}
}

export async function POST(request:Request){
  const requestId=randomUUID();
  try{
    const body=await request.json() as Record<string,unknown>;const type=cleanText(body.resource,60);const id=cleanText(body.id,100);const action=cleanText(body.action,30);const reason=cleanText(body.reason,500);const reassignTo=cleanText(body.reassign_to,100)||null;const resource=resources[type];
    if(!resource||!resource.actions.includes(action))return Response.json({error:"Choose an available safe action."},{status:400});
    const{admin,user}=await requireAdminPermission(request,resource.permission);const{data:row,error:readError}=await admin.from(resource.table).select("*").eq(resource.table==="content_pages"?"slug":"id",id).maybeSingle();if(readError)throw readError;if(!row)return Response.json({error:"Record not found."},{status:404});
    const record=publicSummary(row,resource);if(cleanText(body.confirmation,200)!==record.label)return Response.json({error:`Type “${record.label}” exactly to confirm.`},{status:400});if(reason.length<5)return Response.json({error:"Enter a reason of at least 5 characters."},{status:400});
    const dependencies=await dependencyPlan(admin,resource,id);
    if(catalogRpcTypes.has(type)){const result=await admin.rpc("admin_manage_catalog_record",{p_record_type:type,p_record_id:id,p_action:action,p_reassign_to:reassignTo,p_actor_user_id:user.id,p_reason:reason,p_dependency_summary:dependencies});if(result.error)throw result.error;return Response.json({result:result.data,dependencies});}
    let after:Record<string,unknown>|null=null;
    if(type==="salon"&&action==="offboard"){const result=await admin.rpc("admin_change_salon_status",{acting_admin_id:user.id,target_salon_id:id,requested_status:"Offboarded",internal_reason:reason});if(result.error)throw result.error;after=result.data as Record<string,unknown>;}
    else if(type==="salon_application"&&action==="archive"){const result=await admin.from(resource.table).update({status:"Rejected",rejection_reason:reason}).eq("id",id).select().single();if(result.error)throw result.error;after=result.data;}
    else if(type==="stylist"||type==="style"){const hasHistory=dependencies.details.some(item=>item.label==="bookings"&&item.count>0);if(action==="delete"&&hasHistory)throw new Error("This record has booking history and must be archived, not deleted.");if(action==="archive"){const result=await admin.from(resource.table).update({archived_at:new Date().toISOString()}).eq("id",id).select().single();if(result.error)throw result.error;after=result.data;}else{const result=await admin.from(resource.table).delete().eq("id",id);if(result.error)throw result.error;}}
    else if(type==="salon_product"){if(action==="archive"){const result=await admin.from(resource.table).update({is_visible:false,archived_at:new Date().toISOString()}).eq("id",id).select().single();if(result.error)throw result.error;after=result.data;}else{const result=await admin.from(resource.table).delete().eq("id",id);if(result.error)throw result.error;}}
    else if(type==="salon_promotion"){if(action==="archive"){const result=await admin.from(resource.table).update({is_active:false,archived_at:new Date().toISOString()}).eq("id",id).select().single();if(result.error)throw result.error;after=result.data;}else{const result=await admin.from(resource.table).delete().eq("id",id);if(result.error)throw result.error;}}
    else if(type==="booking"&&action==="cancel"){if(["completed","cancelled","canceled"].includes(String(row.status||"").toLowerCase()))throw new Error("Completed or already cancelled bookings cannot be changed here.");const result=await admin.from(resource.table).update({status:"Cancelled",cancellation_reason:reason,cancelled_at:new Date().toISOString()}).eq("id",id).select().single();if(result.error)throw result.error;after=result.data;}
    else if(type==="review"&&action==="archive"){const result=await admin.from(resource.table).update({archived_at:new Date().toISOString()}).eq("id",id).select().single();if(result.error)throw result.error;after=result.data;}
    else if(type==="support_ticket"&&action==="archive"){const result=await admin.from(resource.table).update({status:"Closed",archived_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).select().single();if(result.error)throw result.error;after=result.data;}
    else if(["featured_campaign","trending_campaign"].includes(type)&&action==="archive"){const result=await admin.from(resource.table).update({status:type==="featured_campaign"?"Paused":"Draft",updated_at:new Date().toISOString()}).eq("id",id).select().single();if(result.error)throw result.error;after=result.data;}
    else if(type==="location_market"){if(action==="delete"&&dependencies.total)throw new Error("This market is assigned to salons and must be archived or reassigned first.");const result=action==="archive"?await admin.from(resource.table).update({is_active:false,archived_at:new Date().toISOString()}).eq("id",id).select().single():await admin.from(resource.table).delete().eq("id",id).select().maybeSingle();if(result.error)throw result.error;after=result.data;}
    else if(type==="newsletter_subscriber"){const result=action==="archive"?await admin.from(resource.table).update({status:"Unsubscribed",archived_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).select().single():await admin.from(resource.table).delete().eq("id",id).select().maybeSingle();if(result.error)throw result.error;after=result.data;}
    else if(type==="customer"&&action==="anonymize")return Response.json({error:"Use the protected Identity Deletion workflow so authentication and retained history are handled together."},{status:409});
    else throw new Error("This record uses a dedicated workflow and was not changed.");
    await admin.from("record_management_events").insert({record_type:type,record_id:id,record_label:record.label,action:action==="cancel"?"Cancelled":action==="offboard"?"Offboarded":action==="archive"?"Archived":"Deleted",dependency_summary:dependencies,before_values:row,after_values:after,reason,acting_user_id:user.id,acting_scope:"platform_admin"});
    return Response.json({result:{ok:true,action,label:record.label},dependencies});
  }catch(error){const message=friendlyFailure(error,requestId);return Response.json({error:message},{status:/not found/i.test(message)?404:409});}
}
