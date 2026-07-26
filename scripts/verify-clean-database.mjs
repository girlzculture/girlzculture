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

for (const [index, migration] of migrations.entries()) {
  process.stdout.write(`[${index + 1}/${migrations.length}] ${migration}\n`);
  runPsql(["--file", path.join(migrationDirectory, migration)], migration);
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
process.stdout.write(`Executed ${migrations.length} migrations successfully against an empty database.\n`);
