import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const databaseUrl = process.env.CLEAN_DATABASE_URL;
const psql = process.env.PSQL_BIN || "psql";
const root = process.cwd();
const migrationDirectory = path.join(root, "supabase", "migrations");
const prerequisites = path.join(root, "scripts", "sql", "supabase-platform-prerequisites.sql");
const assertions = path.join(root, "scripts", "sql", "verify-clean-database.sql");

const prerequisiteSource = readFileSync(prerequisites, "utf8");
const authUsersDefinition = prerequisiteSource.match(
  /create table auth\.users\s*\(([\s\S]*?)\r?\n\);/,
)?.[1];
const requiredAuthUserColumns = [
  "id",
  "email",
  "encrypted_password",
  "email_confirmed_at",
  "raw_user_meta_data",
  "raw_app_meta_data",
  "created_at",
  "updated_at",
];
if (
  !authUsersDefinition ||
  requiredAuthUserColumns.some(
    (column) => !new RegExp(`^\\s*${column}\\s+`, "m").test(authUsersDefinition),
  )
) {
  console.error(
    "The test-only auth.users prerequisite is missing a column required by the complete migration/assertion chain.",
  );
  process.exit(1);
}

const assertionSource = readFileSync(assertions, "utf8");
const supportWorkflowBlock = assertionSource.match(
  /-- Exercise support assignment[\s\S]*?end support_workflow_verification\s*\r?\n\$\$;/,
)?.[0];
if (!supportWorkflowBlock) {
  console.error("The labeled support workflow verification block is missing.");
  process.exit(1);
}
const supportWorkflowBody = supportWorkflowBlock.match(
  /\bbegin\s*\r?\n([\s\S]*)end support_workflow_verification/,
)?.[1] || "";
const unqualifiedBlockVariable = supportWorkflowBody.match(
  /(?<!support_workflow_verification\.)\bsupport_(?:actor|ticket)_id\b/,
);
const permissionScopedSupportActor =
  /'\{"support":true,"complaints":true,"content":true\}'::jsonb,\s*'Active',\s*false/.test(
    supportWorkflowBlock,
  );
const supportRollbackBlock = assertionSource.match(
  /-- Force each audited mutation[\s\S]*?end support_workflow_rollback_verification\s*\r?\n\$\$;/,
)?.[0];
if (!supportRollbackBlock) {
  console.error("The labeled support workflow rollback verification block is missing.");
  process.exit(1);
}
const supportRollbackBody = supportRollbackBlock.match(
  /\bbegin\s*\r?\n([\s\S]*)end support_workflow_rollback_verification/,
)?.[1] || "";
const unqualifiedRollbackVariable = supportRollbackBody.match(
  /(?<!support_workflow_rollback_verification\.)\brollback_(?:actor|ticket)_id\b/,
);
const legacyRollbackVariableDeclaration = supportRollbackBlock.match(
  /\b(?:actor_id|ticket_id)\s+constant\b/,
);
if (
  !supportWorkflowBlock.includes("#variable_conflict error") ||
  unqualifiedBlockVariable ||
  !permissionScopedSupportActor ||
  !supportWorkflowBlock.includes("from public.support_tickets ticket") ||
  !supportWorkflowBlock.includes("from public.support_response_email_outbox outbox") ||
  !supportWorkflowBlock.includes("from public.record_management_events event")
) {
  console.error(
    "Support workflow verification must use a permission-scoped non-super-admin fixture, error-on-conflict mode, qualified block variables, and explicit table aliases.",
  );
  process.exit(1);
}
if (
  !supportRollbackBlock.includes("#variable_conflict error") ||
  unqualifiedRollbackVariable ||
  legacyRollbackVariableDeclaration ||
  !supportRollbackBlock.includes("from public.content_pages content_page") ||
  !supportRollbackBlock.includes("from public.service_categories category") ||
  !supportRollbackBlock.includes("from public.support_tickets ticket") ||
  !supportRollbackBlock.includes("from public.support_response_email_outbox outbox")
) {
  console.error(
    "Support workflow rollback verification must use error-on-conflict mode, qualified block variables, and explicit table aliases.",
  );
  process.exit(1);
}

const applicationDocumentBlock = assertionSource.match(
  /-- Supporting-document uploads[\s\S]*?end application_document_lifecycle_verification\s*\r?\n\$\$;/,
)?.[0];
if (!applicationDocumentBlock) {
  console.error("The labeled application-document lifecycle verification block is missing.");
  process.exit(1);
}
const applicationDocumentDeclarations = applicationDocumentBlock.match(
  /\bdeclare\s*\r?\n([\s\S]*?)\bbegin\b/,
)?.[1] || "";
const unsafeApplicationDocumentVariable = [
  ...applicationDocumentDeclarations.matchAll(/^\s*([a-z][a-z0-9_]*)\s+/gm),
]
  .map((match) => match[1])
  .find((variable) => !variable.startsWith("application_document_"));
const unaliasedApplicationDocumentTable = applicationDocumentBlock.match(
  /\b(?:from|delete from) public\.(?:application_document_uploads|salon_applications|complaints_log|bookings|styles|salons)\s*(?:\r?\n|where\b)/,
);
const unqualifiedApplicationDocumentColumn = applicationDocumentBlock.match(
  /\b(?:where|and)\s+(?:id|status|application_id|expires_at|user_id|salon_id|storage_path|cleaned_at)\b/,
);
if (
  !applicationDocumentBlock.includes("#variable_conflict error") ||
  unsafeApplicationDocumentVariable ||
  unaliasedApplicationDocumentTable ||
  unqualifiedApplicationDocumentColumn ||
  !applicationDocumentBlock.includes(
    "while application_document_lifecycle_verification.application_document_ordinal <= 5 loop",
  ) ||
  applicationDocumentBlock.includes("for application_document_ordinal in") ||
  !applicationDocumentBlock.includes(
    "delete from public.booking_financial_events financial_event",
  ) ||
  !applicationDocumentBlock.includes(
    "from public.application_document_uploads document_upload",
  )
) {
  console.error(
    "Application-document lifecycle verification must use error-on-conflict mode, unambiguous fixture variables, and explicit table aliases.",
  );
  process.exit(1);
}

if (!databaseUrl) {
  console.error("CLEAN_DATABASE_URL must point to a disposable, empty PostgreSQL database.");
  process.exit(1);
}

function runPsql(args, label) {
  const result = spawnSync(
    psql,
    ["-X", "--set", "ON_ERROR_STOP=1", "--dbname", databaseUrl, ...args],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  if (result.status !== 0) {
    console.error(`\n${label} failed.`);
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

const publicObjectCount = runPsql(
  [
    "--tuples-only",
    "--no-align",
    "--command",
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f');",
  ],
  "Empty-database preflight",
);

if (Number(publicObjectCount) !== 0) {
  console.error(`Refusing to test a non-empty public schema (${publicObjectCount} objects found).`);
  process.exit(1);
}

runPsql(["--file", prerequisites], "Supabase platform prerequisite setup");

const missingAuthUserColumns = runPsql(
  [
    "--tuples-only",
    "--no-align",
    "--command",
    `
      with required(column_name, data_type) as (
        values
          ('id', 'uuid'),
          ('email', 'text'),
          ('encrypted_password', 'character varying'),
          ('email_confirmed_at', 'timestamp with time zone'),
          ('raw_user_meta_data', 'jsonb'),
          ('raw_app_meta_data', 'jsonb'),
          ('created_at', 'timestamp with time zone'),
          ('updated_at', 'timestamp with time zone')
      )
      select coalesce(string_agg(required.column_name, ',' order by required.column_name), '')
      from required
      where not exists (
        select 1
        from information_schema.columns as actual
        where actual.table_schema='auth'
          and actual.table_name='users'
          and actual.column_name=required.column_name
          and actual.data_type=required.data_type
      );
    `,
  ],
  "Supabase Auth prerequisite shape assertion",
);
if (missingAuthUserColumns) {
  console.error(
    `The test-only auth.users prerequisite has missing or incompatible columns: ${missingAuthUserColumns}.`,
  );
  process.exit(1);
}

const migrations = readdirSync(migrationDirectory)
  .filter((file) => /^\d{14}_[a-z0-9_]+\.sql$/.test(file))
  .sort();
const expectedMigration = migrations.at(-1)?.slice(0, 14);
if (!expectedMigration) {
  console.error("No ordered database migrations were found.");
  process.exit(1);
}

for (const [index, migration] of migrations.entries()) {
  process.stdout.write(`[${index + 1}/${migrations.length}] ${migration}\n`);
  if (migration === "20260808120000_content_publication_workflow.sql") {
    runPsql(
      [
        "--command",
        `
          create schema clean_migration_fixture;
          create table clean_migration_fixture.content_page_sections(
            slug text primary key,
            sections jsonb not null
          );
          insert into clean_migration_fixture.content_page_sections(slug,sections)
          select slug,sections from public.content_pages where slug='about';
          do $$
          begin
            if not exists(
              select 1 from clean_migration_fixture.content_page_sections
              where slug='about'
            ) then
              raise exception 'Legacy About content fixture could not be prepared';
            end if;
          end
          $$;
          update public.content_pages
          set sections='{"legacy":"object-valued-sections"}'::jsonb
          where slug='about';
        `,
      ],
      "Legacy object-valued content fixture setup",
    );
  }
  runPsql(["--file", path.join(migrationDirectory, migration)], migration);
  if (migration === "20260808120000_content_publication_workflow.sql") {
    runPsql(
      [
        "--command",
        `
          do $$
          begin
            if (
              select count(*)
              from public.content_pages
              where slug in ('about-carousel-one','about-carousel-two')
                and sections='[]'::jsonb
            ) <> 2 then
              raise exception 'Object-valued legacy About sections were not migrated safely';
            end if;
          end
          $$;
          update public.content_pages page
          set sections=backup.sections,
              published_payload=case
                when jsonb_typeof(page.published_payload)='object'
                  then jsonb_set(
                    page.published_payload,
                    '{sections}',
                    backup.sections,
                    true
                  )
                else page.published_payload
              end
          from clean_migration_fixture.content_page_sections backup
          where page.slug=backup.slug;
          drop schema clean_migration_fixture cascade;
        `,
      ],
      "Legacy object-valued content fixture assertion",
    );
  }
}

const referenceWorkers = Array.from({ length: 4 }, (_, worker) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      psql,
      [
        "-X",
        "--set",
        "ON_ERROR_STOP=1",
        "--dbname",
        databaseUrl,
        "--tuples-only",
        "--no-align",
        "--command",
        "select public.next_booking_public_reference() from generate_series(1,250);",
      ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `Booking reference concurrency worker ${worker + 1} failed: ${stderr.trim()}`,
          ),
        );
    });
  }),
);
const generatedReferences = (await Promise.all(referenceWorkers))
  .flatMap((output) => String(output).split(/\r?\n/))
  .map((value) => value.trim())
  .filter(Boolean);
if (
  generatedReferences.length !== 1000 ||
  new Set(generatedReferences).size !== generatedReferences.length ||
  generatedReferences.some((value) => !/^GC[A-Z]+\d{2}$/.test(value))
) {
  console.error(
    "Concurrent booking-reference generation produced a duplicate, invalid value, or missing result.",
  );
  process.exit(1);
}
process.stdout.write(
  "Generated 1,000 unique booking references across four concurrent database sessions.\n",
);

const productReferenceWorkers = Array.from({ length: 4 }, (_, worker) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      psql,
      [
        "-X",
        "--set",
        "ON_ERROR_STOP=1",
        "--dbname",
        databaseUrl,
        "--tuples-only",
        "--no-align",
        "--command",
        "select public.next_product_order_reference() from generate_series(1,250);",
      ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            `Product-reference concurrency worker ${worker + 1} failed: ${stderr.trim()}`,
          ),
        );
    });
  }),
);
const generatedProductReferences = (
  await Promise.all(productReferenceWorkers)
)
  .flatMap((output) => String(output).split(/\r?\n/))
  .map((value) => value.trim())
  .filter(Boolean);
if (
  generatedProductReferences.length !== 1000 ||
  new Set(generatedProductReferences).size !==
    generatedProductReferences.length ||
  generatedProductReferences.some(
    (value) => !/^GC-P-[A-Z]+-\d{2}$/.test(value),
  )
) {
  console.error(
    "Concurrent product-reference generation produced a duplicate, invalid value, or missing result.",
  );
  process.exit(1);
}
process.stdout.write(
  "Generated 1,000 unique product references across four concurrent database sessions.\n",
);

const assertionOutput = runPsql(["--file", assertions], "Post-migration assertions");
if (assertionOutput) process.stdout.write(`${assertionOutput}\n`);
const deployedMigration = runPsql(
  [
    "--tuples-only",
    "--no-align",
    "--command",
    "select coalesce(published_value #>> '{}','') from public.engine_settings where setting_key='integrations.expected_migration';",
  ],
  "Engine migration marker assertion",
);
if (deployedMigration !== expectedMigration) {
  console.error(
    `Engine expected migration ${deployedMigration || "<missing>"} does not match repository head ${expectedMigration}.`,
  );
  process.exit(1);
}
process.stdout.write(`Executed ${migrations.length} migrations successfully against an empty database.\n`);
