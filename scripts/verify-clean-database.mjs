import { readdirSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const databaseUrl = process.env.CLEAN_DATABASE_URL;
const psql = process.env.PSQL_BIN || "psql";
const root = process.cwd();
const migrationDirectory = path.join(root, "supabase", "migrations");
const prerequisites = path.join(root, "scripts", "sql", "supabase-platform-prerequisites.sql");
const assertions = path.join(root, "scripts", "sql", "verify-clean-database.sql");

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
