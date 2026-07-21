import { createClient } from "@supabase/supabase-js";
import { normalizePlan } from "@/lib/plans";
import {
  assertEmailAvailableForNewIdentity,
  auditIdentityEvent,
  IdentityUnavailableError,
  IDENTITY_UNAVAILABLE_MESSAGE,
  type PrimaryIdentityRole,
} from "@/lib/identityServer";
import {
  cleanEmail,
  cleanText,
  cleanUsPhone,
  enforceRateLimit,
  rejectBot,
} from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function signupClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) throw new Error("Authentication is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function publicFailure(error: unknown) {
  if (error instanceof IdentityUnavailableError) {
    return Response.json({ error: IDENTITY_UNAVAILABLE_MESSAGE }, { status: 409 });
  }
  return Response.json(
    { error: "Your account could not be created. Please try again or contact support." },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  let createdUserId = "";
  try {
    enforceRateLimit(request, "canonical-signup", 5, 15 * 60_000);
    const body = (await request.json()) as Record<string, unknown>;
    rejectBot(body);
    const requestedScope = cleanText(body.scope, 30);
    const role: PrimaryIdentityRole =
      requestedScope === "salon_owner" ? "salon_owner" : "customer";
    if (!["customer", "salon_owner"].includes(requestedScope)) {
      throw new Error("Unsupported signup scope.");
    }
    const email = cleanEmail(body.email);
    const password = cleanText(body.password, 200);
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    const name = cleanText(body.name, 120);
    if (role === "customer" && !name) throw new Error("Name is required.");
    const phone = role === "salon_owner" ? cleanUsPhone(body.phone) : "";
    const plan = normalizePlan(body.selected_plan);
    await assertEmailAvailableForNewIdentity(email, role, `${role}_signup`, request);

    const auth = await signupClient().auth.signUp({
      email,
      password,
      options: {
        data:
          role === "customer"
            ? { role, name }
            : { role, phone, selected_plan: plan },
      },
    });
    if (auth.error || !auth.data.user) {
      await auditIdentityEvent({
        request,
        eventType: "identity_signup_rejected",
        email,
        role,
        source: `${role}_signup`,
        details: { provider_code: auth.error?.code || "no_user" },
      });
      throw new IdentityUnavailableError();
    }
    createdUserId = auth.data.user.id;
    const admin = getSupabaseAdmin();
    if (role === "customer") {
      const { error } = await admin.from("customers").insert({
        id: createdUserId,
        name,
        email,
        status: "Active",
      });
      if (error) throw error;
    } else {
      const { error } = await admin.from("salons").insert({
        user_id: createdUserId,
        email,
        phone,
        name: "Pending salon application",
        slug: `pending-${createdUserId.slice(0, 8)}`,
        status: "Pending",
        verification_status: "Pending",
        subscription_tier: plan,
        subscription_status: "inactive",
      });
      if (error) throw error;
    }
    await auditIdentityEvent({
      request,
      eventType: "identity_created",
      email,
      role,
      source: `${role}_signup`,
      actorUserId: createdUserId,
    });
    return Response.json({
      user_id: createdUserId,
      confirmation_required: !auth.data.session,
      session: auth.data.session
        ? {
            access_token: auth.data.session.access_token,
            refresh_token: auth.data.session.refresh_token,
            expires_at: auth.data.session.expires_at,
          }
        : null,
    });
  } catch (error) {
    if (createdUserId) {
      const cleanup = await getSupabaseAdmin().auth.admin.deleteUser(createdUserId);
      if (cleanup.error) {
        console.error("Failed to remove incomplete signup identity", {
          userId: createdUserId,
          code: cleanup.error.code,
        });
      }
    }
    console.error("Canonical signup failed", {
      kind: error instanceof IdentityUnavailableError ? "identity_unavailable" : "validation_or_provider",
    });
    return publicFailure(error);
  }
}

