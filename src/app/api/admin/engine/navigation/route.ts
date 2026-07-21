import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { cleanText, errorResponse } from "@/lib/requestSecurity";

const SURFACES = new Set(["header", "mobile_menu", "mobile_bottom", "footer"]);
const KEY_PATTERN = /^[a-z][a-z0-9_.-]{1,79}$/;
const GROUP_PATTERN = /^[a-z][a-z0-9_-]{1,39}$/;
const INTERNAL_HREF = /^\/[A-Za-z0-9_/?=&.%#-]*$/;

function validated(body:Record<string,unknown>) {
  const surface = cleanText(body.surface, 30);
  const groupKey = cleanText(body.group_key, 40);
  const itemKey = cleanText(body.item_key, 80);
  const label = cleanText(body.label, 80);
  const translationKey = cleanText(body.translation_key, 180) || null;
  const href = cleanText(body.href, 240);
  const sortOrder = Number(body.sort_order);
  if (!SURFACES.has(surface)) throw new Error("Choose a supported navigation surface.");
  if (!GROUP_PATTERN.test(groupKey)) throw new Error("Use a valid lowercase group key.");
  if (!KEY_PATTERN.test(itemKey)) throw new Error("Use a valid lowercase item key.");
  if (!label) throw new Error("Enter a navigation label.");
  if (translationKey && !/^[a-z][a-z0-9_.-]{1,179}$/.test(translationKey)) throw new Error("Enter a valid translation key or leave it blank.");
  if (!INTERNAL_HREF.test(href)) throw new Error("Navigation destinations must be safe internal paths beginning with /.");
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) throw new Error("Order must be between 0 and 100,000.");
  return { surface, group_key:groupKey, item_key:itemKey, label, translation_key:translationKey, href, sort_order:sortOrder, is_enabled:body.is_enabled !== false, show_new_badge:body.show_new_badge === true };
}

async function audit(admin:Awaited<ReturnType<typeof requireAdminPermission>>["admin"], actorUserId:string, action:string, details:Record<string,unknown>) {
  const { error } = await admin.from("admin_security_events").insert({ actor_user_id:actorUserId, action, result:"Allowed", details });
  if (error) console.error("Navigation audit write failed", { action, code:error.code });
}

export async function GET(request:Request) {
  try {
    const { admin } = await requireAdminPermission(request, "content");
    const { data, error } = await admin.from("navigation_items").select("*").order("surface").order("group_key").order("sort_order");
    if (error) throw error;
    return Response.json({ items:data || [] });
  } catch (error) {
    console.error("Navigation registry load failed", error);
    return errorResponse(error, "Unable to load navigation.");
  }
}

export async function POST(request:Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "content");
    const body = await request.json() as Record<string,unknown>;
    const values = validated(body);
    const { data, error } = await admin.from("navigation_items").insert({ ...values, updated_by:user.id }).select().single();
    if (error) throw error;
    await audit(admin, user.id, "navigation_item_created", { id:data.id, surface:data.surface, item_key:data.item_key });
    return Response.json({ item:data }, { status:201 });
  } catch (error) {
    console.error("Navigation item create failed", error);
    return errorResponse(error, "Unable to create the navigation item.");
  }
}

export async function PATCH(request:Request) {
  try {
    const { admin, user } = await requireAdminPermission(request, "content");
    const body = await request.json() as Record<string,unknown>;
    const id = cleanText(body.id, 80);
    const action = cleanText(body.action, 30) || "update";
    if (!id) throw new Error("Choose a navigation item.");
    const { data:before, error:readError } = await admin.from("navigation_items").select("*").eq("id", id).single();
    if (readError) throw readError;
    let patch:Record<string,unknown>;
    if (action === "archive") patch = { archived_at:new Date().toISOString(), is_enabled:false, updated_by:user.id, updated_at:new Date().toISOString() };
    else if (action === "restore") patch = { archived_at:null, updated_by:user.id, updated_at:new Date().toISOString() };
    else if (action === "update") patch = { ...validated(body), updated_by:user.id, updated_at:new Date().toISOString() };
    else throw new Error("Choose a supported navigation action.");
    const { data, error } = await admin.from("navigation_items").update(patch).eq("id", id).select().single();
    if (error) throw error;
    await audit(admin, user.id, `navigation_item_${action}`, { id, before, after:data });
    return Response.json({ item:data });
  } catch (error) {
    console.error("Navigation item update failed", error);
    return errorResponse(error, "Unable to update the navigation item.");
  }
}
