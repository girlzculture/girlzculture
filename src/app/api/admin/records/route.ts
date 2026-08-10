import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { randomUUID } from "node:crypto";
import { cleanText } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { assertRecentHighRiskVerification } from "@/lib/identityDeletionServer";
import {
  isClearlyExpectedMessage,
  isPermissionDenialMessage,
} from "@/lib/operationalMonitoringCore";

type Resource = {
  table: string;
  permission: string;
  label: string;
  nameFields: string[];
  actions: string[];
  dependencies?: Array<{ table: string; column: string; label: string }>;
};

const resources: Record<string, Resource> = {
  service_category: {
    table: "service_categories",
    permission: "content",
    label: "Service categories",
    nameFields: ["name"],
    actions: ["archive", "restore", "delete"],
    dependencies: [
      { table: "service_groups", column: "category_id", label: "service groups" },
      { table: "service_addons", column: "category_id", label: "add-ons" },
      { table: "master_styles", column: "category_id", label: "service names" },
    ],
  },
  service_group: {
    table: "service_groups",
    permission: "content",
    label: "Service groups",
    nameFields: ["name"],
    actions: ["archive", "restore", "delete", "reassign"],
    dependencies: [
      { table: "master_styles", column: "service_group_id", label: "service names" },
      { table: "styles", column: "service_group_id", label: "salon services" },
    ],
  },
  service_addon: {
    table: "service_addons",
    permission: "content",
    label: "Add-ons",
    nameFields: ["name"],
    actions: ["archive", "restore", "delete"],
  },
  master_style: {
    table: "master_styles",
    permission: "content",
    label: "Master service names",
    nameFields: ["name"],
    actions: ["archive", "restore", "delete", "reassign"],
    dependencies: [
      { table: "styles", column: "master_style_id", label: "salon services" },
    ],
  },
  blog_post: {
    table: "blog_posts",
    permission: "content",
    label: "Blog posts",
    nameFields: ["title", "slug"],
    actions: ["archive", "restore", "delete"],
  },
  content_page: {
    table: "content_pages",
    permission: "content",
    label: "Content pages",
    nameFields: ["title", "slug"],
    actions: ["archive", "restore"],
  },
  salon: {
    table: "salons",
    permission: "salons",
    label: "Salons",
    nameFields: ["name", "slug"],
    actions: ["offboard", "delete", "delete_test"],
    dependencies: [
      { table: "bookings", column: "salon_id", label: "bookings (retained and contact-anonymized)" },
      { table: "subscriptions", column: "salon_id", label: "subscriptions (retained)" },
      { table: "billing_events", column: "salon_id", label: "billing events (retained)" },
      { table: "booking_financial_events", column: "salon_id", label: "booking financial events (retained)" },
      { table: "booking_refund_operations", column: "salon_id", label: "refund operations (retained)" },
      { table: "salon_recovery_balances", column: "salon_id", label: "recovery balances (retained)" },
      { table: "subscription_change_requests", column: "salon_id", label: "subscription changes (retained)" },
      { table: "product_orders", column: "salon_id", label: "product orders (retained)" },
      { table: "styles", column: "salon_id", label: "services (archived)" },
      { table: "stylists", column: "salon_id", label: "stylists (archived)" },
      { table: "salon_products", column: "salon_id", label: "products (archived)" },
      { table: "salon_promotions", column: "salon_id", label: "promotions (archived)" },
      { table: "salon_team_members", column: "salon_id", label: "team access records (disabled)" },
      { table: "reviews", column: "salon_id", label: "reviews (archived)" },
      { table: "salon_applications", column: "salon_id", label: "applications (deleted after audit preservation)" },
      { table: "featured_salon_campaigns", column: "salon_id", label: "featured campaigns (paused)" },
      { table: "trending_video_campaigns", column: "salon_id", label: "trending campaigns (returned to draft)" },
      { table: "salon_publication_overrides", column: "salon_id", label: "publication overrides (revoked)" },
      { table: "availability", column: "salon_id", label: "availability rows (removed)" },
      { table: "salon_blockouts", column: "salon_id", label: "availability blockouts (removed)" },
    ],
  },
  salon_application: {
    table: "salon_applications",
    permission: "submissions",
    label: "Salon applications",
    nameFields: ["business_name", "business_email"],
    actions: ["archive", "restore", "delete"],
    dependencies: [
      { table: "salon_publication_overrides", column: "application_id", label: "publication overrides" },
      { table: "salon_publication_override_audit", column: "application_id", label: "publication override audit records" },
    ],
  },
  stylist: {
    table: "stylists",
    permission: "salons",
    label: "Stylists",
    nameFields: ["name"],
    actions: ["archive", "restore", "delete"],
    dependencies: [
      { table: "bookings", column: "stylist_id", label: "bookings" },
      { table: "salon_team_members", column: "stylist_id", label: "team access records" },
    ],
  },
  style: {
    table: "styles",
    permission: "salons",
    label: "Salon services",
    nameFields: ["name"],
    actions: ["archive", "restore", "delete"],
    dependencies: [
      { table: "bookings", column: "style_id", label: "bookings" },
      { table: "style_materials", column: "style_id", label: "material options" },
    ],
  },
  salon_product: {
    table: "salon_products",
    permission: "salons",
    label: "Products",
    nameFields: ["name"],
    actions: ["archive", "restore", "delete"],
  },
  salon_promotion: {
    table: "salon_promotions",
    permission: "marketing",
    label: "Salon promotions",
    nameFields: ["title"],
    actions: ["archive", "restore", "delete"],
  },
  promo_code: {
    table: "promo_codes",
    permission: "marketing",
    label: "Promo codes",
    nameFields: ["code"],
    actions: ["archive", "restore", "delete"],
    dependencies: [
      { table: "promo_code_redemptions", column: "promo_code_id", label: "redemptions" },
    ],
  },
  customer: {
    table: "customers",
    permission: "customers",
    label: "Customers",
    nameFields: ["name", "email"],
    actions: ["anonymize"],
    dependencies: [
      { table: "bookings", column: "customer_id", label: "bookings" },
      { table: "reviews", column: "customer_id", label: "reviews" },
      { table: "support_tickets", column: "customer_id", label: "support requests" },
    ],
  },
  salon_team: {
    table: "salon_team_members",
    permission: "settings",
    label: "Salon team identities",
    nameFields: ["name", "email"],
    actions: ["anonymize"],
    dependencies: [
      { table: "stylists", column: "user_id", label: "linked stylist profiles" },
    ],
  },
  booking: {
    table: "bookings",
    permission: "bookings",
    label: "Bookings",
    nameFields: ["public_reference", "confirmation_code", "guest_name"],
    actions: ["cancel"],
    dependencies: [
      { table: "complaints_log", column: "booking_id", label: "complaints" },
      { table: "booking_messages", column: "booking_id", label: "messages" },
    ],
  },
  review: {
    table: "reviews",
    permission: "reviews",
    label: "Reviews",
    nameFields: ["reviewer_name", "id"],
    actions: ["archive", "restore"],
  },
  support_ticket: {
    table: "support_tickets",
    permission: "support",
    label: "Support requests",
    nameFields: ["subject", "requester_email"],
    actions: ["archive", "restore"],
  },
  featured_campaign: {
    table: "featured_salon_campaigns",
    permission: "marketing",
    label: "Featured campaigns",
    nameFields: ["internal_note", "id"],
    actions: ["archive"],
  },
  trending_campaign: {
    table: "trending_video_campaigns",
    permission: "marketing",
    label: "Trending campaigns",
    nameFields: ["description", "id"],
    actions: ["archive"],
  },
  location_market: {
    table: "location_markets",
    permission: "salons",
    label: "Markets and service areas",
    nameFields: ["name", "state_code"],
    actions: ["archive", "restore", "delete"],
    dependencies: [{ table: "salons", column: "market_id", label: "salons" }],
  },
  newsletter_subscriber: {
    table: "newsletter_subscribers",
    permission: "marketing",
    label: "Newsletter subscribers",
    nameFields: ["email"],
    actions: ["archive", "restore", "delete"],
  },
};

const catalogRpcTypes = new Set([
  "service_category",
  "service_group",
  "service_addon",
  "master_style",
  "blog_post",
  "content_page",
  "promo_code",
]);

const publicSummary = (row: Record<string, unknown>, resource: Resource) => ({
  id: String(row.id || row.slug || ""),
  label:
    resource.nameFields
      .map((key) => String(row[key] || "").trim())
      .filter(Boolean)
      .join(" · ") || "Untitled record",
  status: String(
    row.status ??
      (row.is_active === false
        ? "Inactive"
        : row.is_visible === false
          ? "Hidden"
          : "Active"),
  ),
  archived: Boolean(row.archived_at),
});

type TrustedDeploymentEnvironment = "development" | "preview" | "production";

function trustedDeploymentEnvironment(): TrustedDeploymentEnvironment | null {
  const explicit = String(
    process.env.CONTEXT ||
      process.env.DEPLOY_CONTEXT ||
      process.env.VERCEL_ENV ||
      process.env.GIRLZ_CULTURE_ENVIRONMENT ||
      "",
  )
    .trim()
    .toLowerCase();
  if (explicit === "production") return "production";
  if (["preview", "deploy-preview", "branch-deploy"].includes(explicit))
    return "preview";
  if (["development", "dev"].includes(explicit)) return "development";
  if (
    !explicit &&
    (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")
  )
    return "development";
  return null;
}

function publishedBoolean(value: unknown) {
  return value === true || value === "true";
}

async function dependencyPlan(
  admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"],
  resource: Resource,
  id: string,
) {
  const details: Array<{ label: string; count: number; retention: string }> = [];
  for (const dependency of resource.dependencies || []) {
    const query = admin
      .from(dependency.table)
      .select("*", { count: "exact", head: true })
      .eq(dependency.column, id);
    const { count, error } = await query;
    if (error) {
      noteOperationalFailure("Record dependency unavailable", {
        table: dependency.table,
        error,
      });
      continue;
    }
    const explicitEffect = dependency.label.match(/\(([^)]+)\)\s*$/)?.[1];
    details.push({
      label: dependency.label.replace(/\s*\([^)]+\)\s*$/, ""),
      count: count || 0,
      retention:
        explicitEffect ||
        (["bookings", "subscriptions", "redemptions", "complaints", "messages"].some(
          (word) => dependency.label.includes(word),
        )
          ? "must be retained"
          : "can be reassigned or removed when eligible"),
    });
  }
  return {
    details,
    total: details.reduce((sum, item) => sum + item.count, 0),
  };
}

async function salonTestDeletionState(
  admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"],
  row: Record<string, unknown>,
  isSuperAdmin: boolean,
) {
  const id = String(row.id || "");
  const environment = trustedDeploymentEnvironment();
  const [marker, maintenance] = await Promise.all([
    admin
      .from("test_data_registry")
      .select(
        "id,batch_id,record_label,metadata,test_data_batches(name,environment,status)",
      )
      .eq("record_type", "salon")
      .eq("record_id", id)
      .maybeSingle(),
    admin
      .from("engine_settings")
      .select("published_value,status")
      .eq("setting_key", "maintenance.test_data_enabled")
      .maybeSingle(),
  ]);
  if (marker.error) throw marker.error;
  if (maintenance.error) throw maintenance.error;
  const offboarded = String(row.status || "").toLowerCase() === "offboarded";
  const alreadyDeleted = Boolean(row.deleted_at);
  const marked = Boolean(marker.data);
  const batchValue = (marker.data as { test_data_batches?: unknown } | null)
    ?.test_data_batches;
  const batch = (Array.isArray(batchValue) ? batchValue[0] : batchValue) as
    | { name?: string; environment?: string; status?: string }
    | null
    | undefined;
  const maintenanceEnabled =
    maintenance.data?.status === "Published" &&
    publishedBoolean(maintenance.data.published_value);
  const batchOpen =
    Boolean(batch) && String(batch?.status || "").toLowerCase() !== "cleared";
  const environmentMatches = Boolean(
    environment && batch?.environment === environment,
  );
  const eligible =
    isSuperAdmin &&
    offboarded &&
    marked &&
    batchOpen &&
    maintenanceEnabled &&
    environmentMatches &&
    !alreadyDeleted;
  const blocker = alreadyDeleted
    ? "This test salon has already been removed from operational records."
    : !isSuperAdmin
      ? "Only a Super Admin can permanently delete an offboarded test salon."
      : !offboarded
        ? "Offboard the salon before permanent test deletion."
        : !environment
          ? "The current deployment environment could not be verified. Configure the trusted deployment context before permanent deletion."
          : !maintenanceEnabled
            ? "Publish maintenance.test_data_enabled in The Engine for this environment before permanent deletion."
            : !marked
              ? "Register this exact salon in Test-data maintenance before permanent deletion."
              : !batchOpen
                ? "The salon's registered test-data batch is already cleared. Register it in an open batch before permanent deletion."
                : !environmentMatches
                  ? `This salon belongs to a ${String(batch?.environment || "different")} test batch, not the trusted ${environment} deployment environment.`
                  : null;
  return {
    eligible,
    blocker,
    environment,
    maintenance_enabled: maintenanceEnabled,
    test_marker: marker.data || null,
    confirmation_phrase: `DELETE TEST SALON ${String(row.name || "")}`,
    retained_history: [
      "bookings",
      "payments",
      "refunds",
      "subscriptions",
      "product orders",
      "disputes",
      "audit events",
    ],
    operational_effects: [
      "Owner and team access disabled",
      "Public salon and slug removed",
      "Services, stylists, products, promotions, and reviews archived",
      "Availability removed",
      "Marketing campaigns paused or returned to draft",
      "Applications deleted after override audit preservation",
    ],
  };
}

function ownerConfirmation(type: string, row: Record<string, unknown>) {
  if (type === "salon") return `DELETE SALON ${String(row.name || "")}`;
  if (type === "salon_application")
    return `DELETE APPLICATION ${String(row.business_name || "")}`;
  return "";
}

function friendlyFailure(error: unknown) {
  const message =
    error instanceof Error ? error.message : "The record could not be changed.";
  return isClearlyExpectedMessage(message) || isPermissionDenialMessage(message)
    ? message
    : null;
}

async function GETHandler(request: Request) {
  const requestId = randomUUID();
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("resource") || "";
    const id = url.searchParams.get("id") || "";
    const base = resources[type];
    const permission = base?.permission || "settings";
    const { admin, adminUser } = await requireAdminPermission(
      request,
      permission,
    );
    if (type && base && id) {
      const query = admin
        .from(base.table)
        .select("*")
        .eq(base.table === "content_pages" ? "slug" : "id", id);
      if (type === "salon") query.is("deleted_at", null);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data)
        return Response.json({ error: "Record not found." }, { status: 404 });
      let destructive: Record<string, unknown> | null = null;
      if (type === "salon") {
        try {
          destructive = await salonTestDeletionState(
            admin,
            data,
            Boolean((adminUser as { is_super_admin?: boolean }).is_super_admin),
          );
        } catch (error) {
          noteOperationalFailure(
            "Protected test-salon eligibility preview unavailable",
            { requestId, error },
          );
          destructive = {
            eligible: false,
            blocker: `Permanent test deletion is disabled because its protected eligibility preview could not be verified. Reference ${requestId}.`,
            confirmation_phrase: `DELETE TEST SALON ${String(data.name || "")}`,
            retained_history: [
              "bookings",
              "payments",
              "refunds",
              "subscriptions",
              "product orders",
              "disputes",
              "audit events",
            ],
            operational_effects: [],
          };
        }
      }
      return Response.json({
        record: publicSummary(data, base),
        resource: { type, label: base.label, actions: base.actions },
        dependencies: await dependencyPlan(admin, base, id),
        destructive,
        owner_confirmation_phrase: ownerConfirmation(type, data),
        is_super_admin: Boolean(
          (adminUser as { is_super_admin?: boolean }).is_super_admin,
        ),
      });
    }
    if (type && base) {
      let query = admin.from(base.table).select("*");
      if (type === "salon") query = query.is("deleted_at", null);
      const { data, error } = await query
        .order(base.table === "content_pages" ? "slug" : base.nameFields[0], {
          ascending: true,
        })
        .limit(250);
      if (error) throw error;
      return Response.json({
        resource: { type, label: base.label, actions: base.actions },
        records: (data || []).map((row) => publicSummary(row, base)),
      });
    }
    return Response.json({
      resources: Object.entries(resources).map(([key, value]) => ({
        type: key,
        label: value.label,
        actions: value.actions,
      })),
    });
  } catch (error) {
    noteOperationalFailure("Managed record load failed", { requestId, error });
    return Response.json(
      { error: `Unable to load record management. Reference ${requestId}.` },
      { status: 500 },
    );
  }
}

async function POSTHandler(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const type = cleanText(body.resource, 60);
    const id = cleanText(body.id, 100);
    const action = cleanText(body.action, 30);
    const reason = cleanText(body.reason, 500);
    const reassignTo = cleanText(body.reassign_to, 100) || null;
    const resource = resources[type];
    if (!resource || !resource.actions.includes(action))
      return Response.json(
        { error: "Choose an available safe action." },
        { status: 400 },
      );
    const { admin, user, adminUser } = await requireAdminPermission(
      request,
      resource.permission,
    );
    const rowQuery = admin
      .from(resource.table)
      .select("*")
      .eq(resource.table === "content_pages" ? "slug" : "id", id);
    if (type === "salon") rowQuery.is("deleted_at", null);
    const { data: row, error: readError } = await rowQuery.maybeSingle();
    if (readError) throw readError;
    if (!row)
      return Response.json({ error: "Record not found." }, { status: 404 });
    const record = publicSummary(row, resource);
    const isSuperAdmin = Boolean(
      (adminUser as { is_super_admin?: boolean }).is_super_admin,
    );

    if (type === "salon" && action === "delete_test") {
      if (!isSuperAdmin)
        throw new Error(
          "Only a Super Admin can permanently delete an offboarded test salon.",
        );
      await assertRecentHighRiskVerification(admin, user.id, "admin");
      const state = await salonTestDeletionState(admin, row, true);
      if (!state.eligible)
        throw new Error(
          state.blocker || "This salon is not eligible for permanent test deletion.",
        );
      const confirmation = cleanText(body.confirmation, 260);
      if (confirmation !== state.confirmation_phrase)
        return Response.json(
          { error: `Type “${state.confirmation_phrase}” exactly to confirm.` },
          { status: 400 },
        );
      if (reason.length < 8)
        return Response.json(
          { error: "Enter a reason of at least 8 characters." },
          { status: 400 },
        );
      if (body.acknowledge_retention !== true)
        return Response.json(
          {
            error:
              "Confirm that immutable financial and audit history will be retained.",
          },
          { status: 400 },
        );
      const dependencies = await dependencyPlan(admin, resource, id);
      if (!state.environment)
        throw new Error(
          "The current deployment environment could not be verified. Permanent test deletion is disabled.",
        );
      const result = await admin.rpc("admin_delete_offboarded_test_salon", {
        p_salon_id: id,
        p_actor_user_id: user.id,
        p_reason: reason,
        p_confirmation: confirmation,
        p_dependency_summary: dependencies,
        p_environment: state.environment,
      });
      if (result.error) throw result.error;
      return Response.json({ result: result.data, dependencies });
    }

    if (type === "salon" && action === "delete") {
      if (!isSuperAdmin)
        throw new Error("Only a Super Admin can permanently remove a salon.");
      const expected = ownerConfirmation(type, row);
      const confirmation = cleanText(body.confirmation, 260);
      if (confirmation !== expected)
        return Response.json(
          { error: `Type “${expected}” exactly to confirm.` },
          { status: 400 },
        );
      if (reason.length < 8)
        return Response.json(
          { error: "Enter a reason of at least 8 characters." },
          { status: 400 },
        );
      const dependencies = await dependencyPlan(admin, resource, id);
      const result = await admin.rpc("admin_operationally_delete_salon", {
        p_salon_id: id,
        p_actor_user_id: user.id,
        p_reason: reason,
        p_confirmation: confirmation,
        p_dependency_summary: dependencies,
      });
      if (result.error) throw result.error;
      return Response.json({ result: result.data, dependencies });
    }

    if (type === "salon_application") {
      const dependencies = await dependencyPlan(admin, resource, id);
      if (action === "delete") {
        if (!isSuperAdmin)
          throw new Error(
            "Only a Super Admin can permanently delete a salon application.",
          );
        const expected = ownerConfirmation(type, row);
        const confirmation = cleanText(body.confirmation, 260);
        if (confirmation !== expected)
          return Response.json(
            { error: `Type “${expected}” exactly to confirm.` },
            { status: 400 },
          );
        if (reason.length < 8)
          return Response.json(
            { error: "Enter a reason of at least 8 characters." },
            { status: 400 },
          );
        const result = await admin.rpc("admin_delete_salon_application", {
          p_application_id: id,
          p_actor_user_id: user.id,
          p_reason: reason,
          p_confirmation: confirmation,
          p_dependency_summary: dependencies,
        });
        if (result.error) throw result.error;
        return Response.json({ result: result.data, dependencies });
      }
      if (cleanText(body.confirmation, 200) !== record.label)
        return Response.json(
          { error: `Type “${record.label}” exactly to confirm.` },
          { status: 400 },
        );
      if (reason.length < 5)
        return Response.json(
          { error: "Enter a reason of at least 5 characters." },
          { status: 400 },
        );
      const result = await admin.rpc(
        action === "archive"
          ? "admin_archive_salon_application"
          : "admin_restore_salon_application",
        {
          p_application_id: id,
          p_actor_user_id: user.id,
          p_reason: reason,
        },
      );
      if (result.error) throw result.error;
      return Response.json({ result: result.data, dependencies });
    }

    if (cleanText(body.confirmation, 200) !== record.label)
      return Response.json(
        { error: `Type “${record.label}” exactly to confirm.` },
        { status: 400 },
      );
    if (reason.length < 5)
      return Response.json(
        { error: "Enter a reason of at least 5 characters." },
        { status: 400 },
      );
    if (action === "restore" && !record.archived)
      return Response.json(
        { error: "This record is already active and does not need to be restored." },
        { status: 409 },
      );

    const dependencies = await dependencyPlan(admin, resource, id);
    let after: Record<string, unknown> | null = null;
    if (
      (type === "content_page" || type === "blog_post") &&
      (action === "archive" || action === "restore")
    ) {
      const isPage = type === "content_page";
      const recordPatch = action === "restore"
        ? {
            ...row,
            archived_at: null,
            status: "Draft",
            publication_state: "Hidden",
            scheduled_publish_at: null,
            scheduled_payload: null,
            ...(isPage ? { is_enabled: false } : { featured: false }),
          }
        : {
            ...row,
            status: "Archived",
            publication_state: "Archived",
            scheduled_publish_at: null,
            scheduled_payload: null,
            archived_at: new Date().toISOString(),
            ...(isPage ? { is_enabled: false } : { featured: false }),
          };
      const transition = await admin.rpc("admin_save_content_record", {
        p_record_type: isPage ? "page" : "post",
        p_actor_user_id: user.id,
        p_record: recordPatch,
        p_action: action,
        p_expected_updated_at: row.updated_at || null,
      });
      if (transition.error) throw transition.error;
      return Response.json({
        result: {
          ok: true,
          action,
          label: record.label,
          record: (transition.data as { record?: unknown } | null)?.record || null,
        },
        dependencies,
      });
    }
    if (action === "restore") {
      const key = resource.table === "content_pages" ? "slug" : "id";
      const withoutArchiveColumn = [
        "featured_salon_campaigns",
        "trending_video_campaigns",
      ].includes(resource.table);
      let patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        ...(!withoutArchiveColumn ? { archived_at: null } : {}),
      };
      if (
        [
          "service_categories",
          "service_groups",
          "service_addons",
          "master_styles",
          "location_markets",
          "stylists",
          "styles",
        ].includes(resource.table)
      )
        patch = { ...patch, is_active: true };
      else if (resource.table === "content_pages")
        patch = {
          ...patch,
          is_enabled: false,
          status: "Draft",
          publication_state: "Hidden",
          scheduled_publish_at: null,
          scheduled_payload: null,
        };
      else if (resource.table === "blog_posts")
        patch = {
          ...patch,
          status: "Draft",
          featured: false,
          publication_state: "Hidden",
          scheduled_publish_at: null,
          scheduled_payload: null,
        };
      else if (resource.table === "salon_products")
        patch = { ...patch, is_visible: false };
      else if (resource.table === "salon_promotions")
        patch = { ...patch, is_active: false };
      else if (resource.table === "promo_codes")
        patch = { ...patch, is_active: true };
      else if (resource.table === "support_tickets")
        patch = { ...patch, status: "Open" };
      else if (resource.table === "featured_salon_campaigns")
        patch = { ...patch, status: "Paused" };
      else if (resource.table === "trending_video_campaigns")
        patch = { ...patch, status: "Draft" };
      else if (resource.table === "newsletter_subscribers")
        patch = { ...patch, status: "Active" };
      const result = await admin
        .from(resource.table)
        .update(patch)
        .eq(key, id)
        .select()
        .single();
      if (result.error) throw result.error;
      after = result.data;
      const audit = await admin.from("record_management_events").insert({
        record_type: type,
        record_id: id,
        record_label: record.label,
        action: "Restored",
        dependency_summary: dependencies,
        before_values: row,
        after_values: after,
        reason,
        acting_user_id: user.id,
        acting_scope: "platform_admin",
      });
      if (audit.error) {
        noteOperationalFailure("Managed record audit write failed", {
          recordType: type,
          recordId: id,
          action: "restore",
          error: audit.error,
        });
        throw audit.error;
      }
      return Response.json({
        result: { ok: true, action, label: record.label },
        dependencies,
      });
    }

    if (type === "service_group" && action === "reassign") {
      const result = await admin.rpc("admin_reassign_service_group", {
        p_group_id: id,
        p_target_id: reassignTo,
        p_actor_user_id: user.id,
        p_reason: reason,
        p_dependency_summary: dependencies,
      });
      if (result.error) throw result.error;
      return Response.json({ result: result.data, dependencies });
    }
    if (
      type === "service_group" &&
      (action === "archive" || action === "delete")
    ) {
      if (action === "delete" && dependencies.total > 0)
        throw new Error(
          `This group is still used by ${dependencies.total} service records. Reassign or archive it.`,
        );
      if (action === "archive") {
        const result = await admin
          .from(resource.table)
          .update({
            is_active: false,
            archived_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();
        if (result.error) throw result.error;
        after = result.data;
      } else {
        const result = await admin.from(resource.table).delete().eq("id", id);
        if (result.error) throw result.error;
      }
      const audit = await admin.from("record_management_events").insert({
        record_type: type,
        record_id: id,
        record_label: record.label,
        action: action === "archive" ? "Archived" : "Deleted",
        dependency_summary: dependencies,
        before_values: row,
        after_values: after,
        reason,
        acting_user_id: user.id,
        acting_scope: "platform_admin",
      });
      if (audit.error) {
        noteOperationalFailure("Managed record audit write failed", {
          recordType: type,
          recordId: id,
          action,
          error: audit.error,
        });
        throw audit.error;
      }
      return Response.json({
        result: { ok: true, action, label: record.label },
        dependencies,
      });
    }
    if (catalogRpcTypes.has(type)) {
      const result = await admin.rpc("admin_manage_catalog_record", {
        p_record_type: type,
        p_record_id: id,
        p_action: action,
        p_reassign_to: reassignTo,
        p_actor_user_id: user.id,
        p_reason: reason,
        p_dependency_summary: dependencies,
      });
      if (result.error) throw result.error;
      return Response.json({ result: result.data, dependencies });
    }
    if (type === "salon" && action === "offboard") {
      const result = await admin.rpc("admin_change_salon_status", {
        acting_admin_id: user.id,
        target_salon_id: id,
        requested_status: "Offboarded",
        internal_reason: reason,
      });
      if (result.error) throw result.error;
      after = result.data as Record<string, unknown>;
    } else if (type === "stylist" || type === "style") {
      const hasHistory = dependencies.details.some(
        (item) => item.label === "bookings" && item.count > 0,
      );
      if (action === "delete" && hasHistory)
        throw new Error(
          "This record has booking history and must be archived, not deleted.",
        );
      if (action === "archive") {
        const result = await admin
          .from(resource.table)
          .update({ archived_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();
        if (result.error) throw result.error;
        after = result.data;
      } else {
        const result = await admin.from(resource.table).delete().eq("id", id);
        if (result.error) throw result.error;
      }
    } else if (type === "salon_product") {
      if (action === "archive") {
        const result = await admin
          .from(resource.table)
          .update({
            is_visible: false,
            archived_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();
        if (result.error) throw result.error;
        after = result.data;
      } else {
        const result = await admin.from(resource.table).delete().eq("id", id);
        if (result.error) throw result.error;
      }
    } else if (type === "salon_promotion") {
      if (action === "archive") {
        const result = await admin
          .from(resource.table)
          .update({
            is_active: false,
            archived_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();
        if (result.error) throw result.error;
        after = result.data;
      } else {
        const result = await admin.from(resource.table).delete().eq("id", id);
        if (result.error) throw result.error;
      }
    } else if (type === "booking" && action === "cancel") {
      if (
        ["completed", "cancelled", "canceled"].includes(
          String(row.status || "").toLowerCase(),
        )
      )
        throw new Error(
          "Completed or already cancelled bookings cannot be changed here.",
        );
      const result = await admin
        .from(resource.table)
        .update({
          status: "Cancelled",
          cancellation_reason: reason,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (result.error) throw result.error;
      after = result.data;
    } else if (type === "review" && action === "archive") {
      const result = await admin
        .from(resource.table)
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (result.error) throw result.error;
      after = result.data;
    } else if (type === "support_ticket" && action === "archive") {
      const result = await admin
        .from(resource.table)
        .update({
          status: "Closed",
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (result.error) throw result.error;
      after = result.data;
    } else if (
      ["featured_campaign", "trending_campaign"].includes(type) &&
      action === "archive"
    ) {
      const result = await admin
        .from(resource.table)
        .update({
          status: type === "featured_campaign" ? "Paused" : "Draft",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (result.error) throw result.error;
      after = result.data;
    } else if (type === "location_market") {
      if (action === "delete" && dependencies.total)
        throw new Error(
          "This market is assigned to salons and must be archived or reassigned first.",
        );
      const result =
        action === "archive"
          ? await admin
              .from(resource.table)
              .update({
                is_active: false,
                archived_at: new Date().toISOString(),
              })
              .eq("id", id)
              .select()
              .single()
          : await admin
              .from(resource.table)
              .delete()
              .eq("id", id)
              .select()
              .maybeSingle();
      if (result.error) throw result.error;
      after = result.data;
    } else if (type === "newsletter_subscriber") {
      const result =
        action === "archive"
          ? await admin
              .from(resource.table)
              .update({
                status: "Unsubscribed",
                archived_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", id)
              .select()
              .single()
          : await admin
              .from(resource.table)
              .delete()
              .eq("id", id)
              .select()
              .maybeSingle();
      if (result.error) throw result.error;
      after = result.data;
    } else if (
      ["customer", "salon_team"].includes(type) &&
      action === "anonymize"
    ) {
      return Response.json(
        {
          error:
            "Use the protected Identity Deletion workflow so authentication and retained history are handled together.",
        },
        { status: 409 },
      );
    } else {
      throw new Error("This record uses a dedicated workflow and was not changed.");
    }

      const audit = await admin.from("record_management_events").insert({
      record_type: type,
      record_id: id,
      record_label: record.label,
      action:
        action === "cancel"
          ? "Cancelled"
          : action === "offboard"
            ? "Offboarded"
            : action === "archive"
              ? "Archived"
              : "Deleted",
      dependency_summary: dependencies,
      before_values: row,
      after_values: after,
      reason,
      acting_user_id: user.id,
        acting_scope: "platform_admin",
      });
      if (audit.error) {
        noteOperationalFailure("Managed record audit write failed", {
          recordType: type,
          recordId: id,
          action,
          error: audit.error,
        });
        throw audit.error;
      }
    return Response.json({
      result: { ok: true, action, label: record.label },
      dependencies,
    });
  } catch (error) {
    const message = friendlyFailure(error);
    if (!message) {
      noteOperationalFailure("Managed record operation failed", error);
      throw error;
    }
    return Response.json(
      { error: message },
      {
        status: isPermissionDenialMessage(message)
          ? 403
          : /not found/i.test(message)
            ? 404
            : 409,
      },
    );
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/records", "GET"),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/records", "POST"),
  POSTHandler,
);
