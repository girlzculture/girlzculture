import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function authenticatedUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  const { data: ownedSalon } = await admin.from("salons").select("id,push_reachable").eq("user_id", data.user.id).limit(1).maybeSingle();
  if (ownedSalon) return { admin, user: data.user, salon: ownedSalon };
  const { data: membership } = await admin.from("salon_team_members").select("salon_id,salon:salons(id,push_reachable)").eq("user_id", data.user.id).eq("status", "Active").limit(1).maybeSingle();
  const relatedSalon = Array.isArray(membership?.salon) ? membership?.salon[0] : membership?.salon;
  return { admin, user: data.user, salon: relatedSalon || null };
}

async function updateSalonReachability(admin: ReturnType<typeof getSupabaseAdmin>, salonId: string) {
  const { count } = await admin.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("salon_id", salonId).eq("permission_status", "granted").is("revoked_at", null);
  const reachable = Number(count || 0) > 0;
  await admin.from("salons").update({ push_reachable: reachable }).eq("id", salonId);
  return reachable;
}

export async function GET(request: Request) {
  try {
    const { admin, user, salon } = await authenticatedUser(request);
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,installed,permission_status,last_seen_at,revoked_at,device_label")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ configured: Boolean((data || []).length), subscriptions: data || [], salonReachable: Boolean(salon?.push_reachable) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read push notification status.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { admin, user, salon } = await authenticatedUser(request);
    const body = await request.json() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      installed?: boolean;
      deviceLabel?: string;
    };
    const endpoint = String(body.endpoint || "").trim();
    const p256dh = String(body.keys?.p256dh || "").trim();
    const authSecret = String(body.keys?.auth || "").trim();
    const endpointUrl = new URL(endpoint);
    if (endpointUrl.protocol !== "https:" || !p256dh || !authSecret) return NextResponse.json({ error: "A valid secure Web Push subscription is required." }, { status: 400 });
    if (endpoint.length > 4096 || p256dh.length > 512 || authSecret.length > 512) return NextResponse.json({ error: "The Web Push subscription is invalid." }, { status: 400 });
    const now = new Date().toISOString();
    const { error } = await admin.from("push_subscriptions").upsert({
      user_id: user.id,
      salon_id: salon?.id || null,
      endpoint,
      p256dh,
      auth_secret: authSecret,
      user_agent: request.headers.get("user-agent")?.slice(0, 500) || null,
      device_label: String(body.deviceLabel || "Browser").slice(0, 120),
      installed: Boolean(body.installed),
      permission_status: "granted",
      revoked_at: null,
      last_seen_at: now,
      updated_at: now,
    }, { onConflict: "endpoint" });
    if (error) throw error;
    if (salon?.id) await admin.from("salons").update({ pwa_installed_at: body.installed ? now : null, push_enabled_at: now, push_last_seen_at: now, push_reachable: true }).eq("id", salon.id);
    return NextResponse.json({ ok: true, configured: true, salonReachable: Boolean(salon?.id) });
  } catch (error) {
    console.error("Web Push subscription save failed", error);
    const message = error instanceof Error ? error.message : "Unable to save push notification settings.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin, user, salon } = await authenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { endpoint?: string };
    let query = admin.from("push_subscriptions").update({ revoked_at: new Date().toISOString(), permission_status: "denied", updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (body.endpoint) query = query.eq("endpoint", body.endpoint);
    const { error } = await query;
    if (error) throw error;
    const reachable = salon?.id ? await updateSalonReachability(admin, salon.id) : false;
    return NextResponse.json({ ok: true, configured: false, salonReachable: reachable });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to disable push notifications.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
