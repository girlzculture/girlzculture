import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

const assertionOutput = runPsql(["--file", assertions], "Post-migration assertions");
if (assertionOutput) process.stdout.write(`${assertionOutput}\n`);
process.stdout.write(`Executed ${migrations.length} migrations successfully against an empty database.\n`);
