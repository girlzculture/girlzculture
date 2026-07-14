import { requireAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const { adminUser } = await requireAdmin(request);
    const row = adminUser as { email?: string; role?: string; permissions?: Record<string, boolean>; is_super_admin?: boolean };
    console.info("Admin login verification", { email: row.email, result: "allowed", isSuperAdmin: Boolean(row.is_super_admin) });
    return Response.json({
      isAdmin: true,
      email: row.email || null,
      role: row.role || null,
      permissions: row.permissions && typeof row.permissions === "object" ? row.permissions : {},
      is_super_admin: Boolean(row.is_super_admin),
    });
  } catch (error) {
    console.warn("Admin login verification denied", error);
    return Response.json({ isAdmin: false }, { status: 403 });
  }
}
