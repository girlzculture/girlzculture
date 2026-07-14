import { cleanEmail, cleanText, cleanUsPhone, errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { inviteOrFindUser } from "@/lib/teamInvite";

export const SALON_PERMISSION_KEYS = ["overview","my_page","photos","styles","stylists","products","availability","bookings","reviews","earnings","promotions","subscription","settings"] as const;
function permissions(value: unknown) { const input = value && typeof value === "object" ? value as Record<string, unknown> : {}; return Object.fromEntries(SALON_PERMISSION_KEYS.map((key) => [key, Boolean(input[key])])); }
async function owner(request: Request) { const context = await requireSalonOwner(request); if (!context.isOwner) throw new Error("Only the salon owner can manage team users."); return context; }

export async function GET(request: Request) {
  try { const { admin, salon, isOwner, teamMember } = await requireSalonOwner(request); if (!isOwner && !(teamMember?.permissions as Record<string,boolean>)?.settings) throw new Error("Forbidden"); const [{ data, error }, { data: stylists }] = await Promise.all([admin.from("salon_team_members").select("*").eq("salon_id", salon.id).order("name"), admin.from("stylists").select("id,name,user_id").eq("salon_id", salon.id).order("name")]); if (error) throw error; return Response.json({ users: data || [], stylists: stylists || [], can_manage: isOwner }); }
  catch (error) { return errorResponse(error, "Unable to load salon users."); }
}

export async function POST(request: Request) {
  try {
    const { admin, salon, user } = await owner(request); const body = await request.json() as Record<string, unknown>;
    const email = cleanEmail(body.email); const phone = cleanUsPhone(body.phone); const name = cleanText(body.name, 120); const role = ["Manager","Front Desk","Stylist","Staff"].includes(cleanText(body.role, 30)) ? cleanText(body.role, 30) : "Staff"; const stylistId = cleanText(body.stylist_id, 50) || null;
    if (!name) throw new Error("Name is required."); if (role === "Stylist" && !stylistId) throw new Error("Choose the stylist profile linked to this login.");
    if (stylistId) { const { data: stylist } = await admin.from("stylists").select("id").eq("id", stylistId).eq("salon_id", salon.id).maybeSingle(); if (!stylist) throw new Error("The selected stylist does not belong to this salon."); }
    const invited = await inviteOrFindUser(admin, email, "salon_staff");
    const { data, error } = await admin.from("salon_team_members").upsert({ salon_id: salon.id, user_id: invited.user.id, stylist_id: stylistId, email, phone, name, role, permissions: permissions(body.permissions), status: invited.user.last_sign_in_at ? "Active" : "Invited", invited_by: user.id, activated_at: invited.user.last_sign_in_at || null }).select().single(); if (error) throw error;
    if (stylistId) await admin.from("stylists").update({ user_id: invited.user.id }).eq("id", stylistId).eq("salon_id", salon.id);
    return Response.json({ user: data, invitation_sent: invited.invited });
  } catch (error) { console.error("Salon team invitation failed", error); return errorResponse(error, "Unable to invite salon user."); }
}

export async function PATCH(request: Request) {
  try { const { admin, salon } = await owner(request); const body = await request.json() as Record<string, unknown>; const id = cleanText(body.id, 50); const { data: existing } = await admin.from("salon_team_members").select("stylist_id,user_id").eq("id", id).eq("salon_id", salon.id).single(); const changes = { name: cleanText(body.name, 120), phone: cleanUsPhone(body.phone), role: cleanText(body.role, 30), status: cleanText(body.status, 20) === "Inactive" ? "Inactive" : "Active", stylist_id: cleanText(body.stylist_id, 50) || null, permissions: permissions(body.permissions) }; const { data, error } = await admin.from("salon_team_members").update(changes).eq("id", id).eq("salon_id", salon.id).select().single(); if (error) throw error; if (existing?.stylist_id && existing.stylist_id !== changes.stylist_id) await admin.from("stylists").update({ user_id: null }).eq("id", existing.stylist_id); if (changes.stylist_id) await admin.from("stylists").update({ user_id: existing?.user_id }).eq("id", changes.stylist_id).eq("salon_id", salon.id); return Response.json({ user: data }); }
  catch (error) { return errorResponse(error, "Unable to update salon user."); }
}

export async function DELETE(request: Request) {
  try { const { admin, salon } = await owner(request); const id = new URL(request.url).searchParams.get("id") || ""; const { data: member } = await admin.from("salon_team_members").select("stylist_id").eq("id", id).eq("salon_id", salon.id).maybeSingle(); const { error } = await admin.from("salon_team_members").delete().eq("id", id).eq("salon_id", salon.id); if (error) throw error; if (member?.stylist_id) await admin.from("stylists").update({ user_id: null }).eq("id", member.stylist_id); return Response.json({ removed: true }); }
  catch (error) { return errorResponse(error, "Unable to remove salon user."); }
}
