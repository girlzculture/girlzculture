import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { ENGLISH_MESSAGES, normalizeLocale } from "@/i18n/catalog";
import { GENERATED_SOURCE_MESSAGES } from "@/i18n/generated-source-messages";

const SOURCE_DEFINITIONS:Record<string,{source:string;impact:string}>={
  ...Object.fromEntries(Object.entries(ENGLISH_MESSAGES).map(([key,source])=>[key,{source,impact:/login|signup/.test(key)?"security":"standard"}])),
  ...GENERATED_SOURCE_MESSAGES,
};

const HIGH_IMPACT = new Set([
  "booking",
  "billing",
  "security",
  "safety",
  "legal",
]);
const VALID_STATUSES = new Set(["Missing", "Draft", "Reviewed", "Published"]);

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "content");
    const requestedLocale=normalizeLocale(new URL(request.url).searchParams.get("locale")||"en");
    const [
      { data: locales, error: localeError },
      { data: stored, error: entryError },
      { data: content, error: contentError },
      { data: versions, error: versionError },
    ] = await Promise.all([
      admin.from("supported_locales").select("*").order("sort_order"),
      admin
        .from("translation_entries")
        .select("*")
        .eq("locale",requestedLocale)
        .order("namespace")
        .order("translation_key"),
      admin
        .from("localized_content")
        .select("*")
        .order("entity_type")
        .limit(500),
      admin
        .from("translation_entry_versions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
    if (localeError) throw localeError;
    if (entryError) throw entryError;
    if (contentError) throw contentError;
    if (versionError) throw versionError;
    const index = new Map(
      (stored || []).map((row) => [
        `${row.translation_key}:${row.locale}`,
        row,
      ]),
    );
    const localeCodes = (locales || []).some(row=>row.locale===requestedLocale)?[requestedLocale]:[String((locales||[]).find(row=>row.is_default)?.locale||"en")];
    const entries = localeCodes.flatMap((locale) =>
      Object.entries(SOURCE_DEFINITIONS).map(
        ([key, definition]) =>
          index.get(`${key}:${locale}`) || {
            id: "",
            translation_key: key,
            locale,
            namespace: key.split(".")[0],
            source_text: definition.source,
            translated_text: locale === "en" ? definition.source : "",
            status: locale === "en" ? "Published" : "Missing",
            impact_level: definition.impact,
            version: 0,
            machine_generated: false,
          },
      ),
    );
    return Response.json({
      locales: locales || [],
      entries,
      content: content || [],
      versions: versions || [],
    });
  } catch (error) {
    console.error("Translation manager load failed", error);
    return errorResponse(error, "Unable to load translations.");
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = cleanText(body.action, 40) || "save_draft";
    const permission = action.startsWith("locale_") ? "settings" : "content";
    const { admin, user } = await requireAdminPermission(request, permission);
    if (action === "locale_create") {
      const raw = cleanText(body.locale, 20);
      const locale = normalizeLocale(raw);
      if (locale !== raw)
        throw new Error("Use a valid BCP-47 locale such as ht, fil, or zh-CN.");
      const displayName = cleanText(body.display_name, 80);
      const nativeName = cleanText(body.native_name, 80);
      const intlLocale = cleanText(body.intl_locale, 30);
      if (
        !displayName ||
        !nativeName ||
        normalizeLocale(intlLocale) !== intlLocale
      )
        throw new Error("Enter valid display, native, and Intl locale values.");
      const { data: max } = await admin
        .from("supported_locales")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await admin
        .from("supported_locales")
        .insert({
          locale,
          display_name: displayName,
          native_name: nativeName,
          intl_locale: intlLocale,
          text_direction: body.text_direction === "rtl" ? "rtl" : "ltr",
          fallback_locale: "en",
          is_enabled: false,
          sort_order: Number(max?.sort_order || 0) + 10,
        })
        .select()
        .single();
      if (error) throw error;
      await admin
        .from("admin_security_events")
        .insert({
          actor_user_id: user.id,
          action: "locale_created",
          result: "Allowed",
          details: { locale },
        });
      return Response.json({ locale: data });
    }
    if (action === "locale_update") {
      const locale = normalizeLocale(body.locale);
      if (locale === "en" && body.is_enabled === false)
        throw new Error(
          "English is the required safe fallback and cannot be disabled.",
        );
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (body.is_enabled !== undefined)
        patch.is_enabled = body.is_enabled === true;
      if (body.sort_order !== undefined) {
        const order = Number(body.sort_order);
        if (!Number.isInteger(order) || order < 0 || order > 100000)
          throw new Error("Language order must be between 0 and 100,000.");
        patch.sort_order = order;
      }
      if (body.text_direction !== undefined)
        patch.text_direction = body.text_direction === "rtl" ? "rtl" : "ltr";
      if (body.native_name !== undefined)
        patch.native_name = cleanText(body.native_name, 80);
      const { data, error } = await admin
        .from("supported_locales")
        .update(patch)
        .eq("locale", locale)
        .select()
        .single();
      if (error) throw error;
      await admin
        .from("admin_security_events")
        .insert({
          actor_user_id: user.id,
          action: "locale_updated",
          result: "Allowed",
          details: { locale, changes: patch },
        });
      return Response.json({ locale: data });
    }
    if (action === "bulk_import") {
      const raw = Array.isArray(body.entries) ? body.entries.slice(0, 501) : [];
      if (!raw.length || raw.length > 500)
        throw new Error(
          "Import between 1 and 500 translation drafts at a time.",
        );
      const locales = new Set(
        (await admin.from("supported_locales").select("locale")).data?.map(
          (row) => row.locale,
        ) || [],
      );
      const records = raw.map((item) => {
        const row = item as Record<string, unknown>;
        const key = cleanText(row.translation_key, 180);
        const locale = normalizeLocale(row.locale);
        const text = cleanText(row.translated_text, 12000);
        if (!(key in SOURCE_DEFINITIONS) || !locales.has(locale) || !text)
          throw new Error(`Invalid import entry for ${key || "unknown key"}.`);
        return {
          translation_key: key,
          locale,
          namespace: key.split(".")[0],
          source_text: SOURCE_DEFINITIONS[key].source,
          translated_text: text,
          status: "Draft",
          impact_level: SOURCE_DEFINITIONS[key].impact,
          machine_generated: row.machine_generated === true,
          updated_by: user.id,
        };
      });
      const { data, error } = await admin
        .from("translation_entries")
        .upsert(records, { onConflict: "translation_key,locale" })
        .select();
      if (error) throw error;
      await admin
        .from("admin_security_events")
        .insert({
          actor_user_id: user.id,
          action: "translation_drafts_imported",
          result: "Allowed",
          details: { count: records.length },
        });
      return Response.json({ entries: data || [] });
    }
    const id = cleanText(body.id, 80);
    if (action === "rollback") {
      if (!id) throw new Error("Choose a saved translation.");
      const target = Number(body.target_version);
      const [
        { data: existing, error: existingError },
        { data: version, error: versionError },
      ] = await Promise.all([
        admin.from("translation_entries").select("*").eq("id", id).single(),
        admin
          .from("translation_entry_versions")
          .select("*")
          .eq("translation_entry_id", id)
          .eq("version", target)
          .single(),
      ]);
      if (existingError || versionError) throw existingError || versionError;
      await admin
        .from("translation_entry_versions")
        .upsert(
          {
            translation_entry_id: id,
            version: existing.version,
            translated_text: existing.translated_text,
            status: existing.status,
            change_reason: "Stored before rollback",
            changed_by: user.id,
          },
          { onConflict: "translation_entry_id,version" },
        );
      const { data, error } = await admin
        .from("translation_entries")
        .update({
          translated_text: version.translated_text,
          status: "Draft",
          updated_by: user.id,
        })
        .eq("id", id)
        .eq("version", Number(body.version))
        .select()
        .single();
      if (error) throw error;
      await admin
        .from("admin_security_events")
        .insert({
          actor_user_id: user.id,
          action: "translation_rolled_back",
          result: "Allowed",
          details: {
            translation_key: existing.translation_key,
            locale: existing.locale,
            target_version: target,
          },
        });
      return Response.json({ entry: data });
    }
    const expectedVersion = Number(body.version || 0);
    const text = cleanText(body.translated_text, 12000);
    if (!text) throw new Error("Translation text is required.");
    let existing: Record<string, unknown>;
    if (id) {
      const { data, error } = await admin
        .from("translation_entries")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      existing = data;
      if (Number(existing.version) !== expectedVersion)
        throw new Error(
          "Another administrator updated this translation. Reload before saving.",
        );
    } else {
      const key = cleanText(body.translation_key, 180);
      const locale = normalizeLocale(body.locale);
      const { data: localeRecord } = await admin
        .from("supported_locales")
        .select("locale")
        .eq("locale", locale)
        .maybeSingle();
      if (!(key in SOURCE_DEFINITIONS) || !localeRecord)
        throw new Error("Choose a valid translation entry.");
      existing = {
        translation_key: key,
        locale,
        source_text: SOURCE_DEFINITIONS[key].source,
        translated_text: "",
        impact_level: SOURCE_DEFINITIONS[key].impact,
        namespace: key.split(".")[0],
        version: 0,
      };
    }
    let status = "Draft";
    const update: Record<string, unknown> = {
      translated_text: text,
      status,
      updated_by: user.id,
      machine_generated: body.machine_generated === true,
    };
    if (action === "publish") {
      if (
        HIGH_IMPACT.has(String(existing.impact_level)) &&
        body.confirm_review !== true
      )
        throw new Error(
          "Legal, payment, safety, security, and booking translations require explicit human review confirmation.",
        );
      status = "Published";
      Object.assign(update, {
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        published_by: user.id,
        published_at: new Date().toISOString(),
        machine_generated: false,
      });
    } else if (!VALID_STATUSES.has(status))
      throw new Error("Choose a supported translation status.");
    let data;
    if (id) {
      await admin
        .from("translation_entry_versions")
        .upsert(
          {
            translation_entry_id: id,
            version: existing.version,
            translated_text: existing.translated_text,
            status: existing.status,
            change_reason: cleanText(body.reason, 500) || null,
            changed_by: user.id,
          },
          { onConflict: "translation_entry_id,version" },
        );
      const result = await admin
        .from("translation_entries")
        .update(update)
        .eq("id", id)
        .eq("version", expectedVersion)
        .select()
        .single();
      if (result.error) throw result.error;
      data = result.data;
    } else {
      const result = await admin
        .from("translation_entries")
        .insert({ ...existing, ...update })
        .select()
        .single();
      if (result.error) throw result.error;
      data = result.data;
    }
    await admin
      .from("admin_security_events")
      .insert({
        actor_user_id: user.id,
        action: `translation_${status.toLowerCase()}`,
        result: "Allowed",
        details: {
          translation_key: existing.translation_key,
          locale: existing.locale,
          before: existing.translated_text,
          after: text,
          impact_level: existing.impact_level,
        },
      });
    return Response.json({ entry: data });
  } catch (error) {
    console.error("Translation manager save failed", error);
    return errorResponse(error, "Unable to save translation changes.");
  }
}
