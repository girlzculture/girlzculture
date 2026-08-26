import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.FEATURED_AUDIT_DATABASE_URL;
const psql = process.env.PSQL_BIN || "psql";
const root = process.cwd();
const migrationDirectory = path.join(root, "supabase", "migrations");
const prerequisites = path.join(
  root,
  "scripts",
  "sql",
  "supabase-platform-prerequisites.sql",
);
const seedMigration = "20260716150000_featured_salon_campaigns.sql";
const targetMigration = "20260825140000_featured_campaign_owner_controls.sql";
const fixtureUserId = "fa000000-0000-4000-8000-000000000001";
const fixtureSalonId = "fa000000-0000-4000-8000-000000000002";
const fixtureCampaignId = "fa000000-0000-4000-8000-000000000003";
const fixtureAuditId = "fa000000-0000-4000-8000-000000000004";

if (!databaseUrl) {
  console.error(
    "FEATURED_AUDIT_DATABASE_URL must point to a disposable, empty PostgreSQL database.",
  );
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
  "Featured audit fixture empty-database preflight",
);
if (Number(publicObjectCount) !== 0) {
  console.error(
    `Refusing to test a non-empty public schema (${publicObjectCount} objects found).`,
  );
  process.exit(1);
}

runPsql(["--file", prerequisites], "Supabase platform prerequisite setup");

const migrations = readdirSync(migrationDirectory)
  .filter((file) => /^\d{14}_[a-z0-9_]+\.sql$/.test(file))
  .sort();
const seedIndex = migrations.indexOf(seedMigration);
const targetIndex = migrations.indexOf(targetMigration);
if (seedIndex < 0 || targetIndex <= seedIndex) {
  console.error(
    "The Featured Salon audit fixture migrations are missing or out of order.",
  );
  process.exit(1);
}

for (const migration of migrations.slice(0, targetIndex + 1)) {
  process.stdout.write(`[featured-audit] ${migration}\n`);
  runPsql(
    ["--file", path.join(migrationDirectory, migration)],
    `Featured audit regression ${migration}`,
  );

  if (migration === seedMigration) {
    runPsql(
      [
        "--command",
        `
          insert into auth.users(id,email)
          values ('${fixtureUserId}'::uuid,'featured-audit-migration@example.test');

          insert into public.salons(id,name,email,user_id)
          values (
            '${fixtureSalonId}'::uuid,
            'Featured Audit Migration Fixture',
            'featured-audit-migration@example.test',
            '${fixtureUserId}'::uuid
          );

          insert into public.featured_salon_campaigns(
            id,salon_id,status,starts_at,ends_at,created_by,updated_by
          ) values (
            '${fixtureCampaignId}'::uuid,
            '${fixtureSalonId}'::uuid,
            'Draft',
            now() - interval '1 day',
            now() + interval '30 days',
            '${fixtureUserId}'::uuid,
            '${fixtureUserId}'::uuid
          );

          insert into public.featured_campaign_audit(
            id,campaign_id,action,new_values,reason,acting_admin_id
          ) values (
            '${fixtureAuditId}'::uuid,
            '${fixtureCampaignId}'::uuid,
            'Created',
            jsonb_build_object(
              'salon_id','${fixtureSalonId}',
              'placement_basis','paid'
            ),
            'Historical audit row created before snapshot columns existed.',
            '${fixtureUserId}'::uuid
          );
        `,
      ],
      "Historical Featured Salon audit fixture setup",
    );
  }
}

runPsql(
  [
    "--command",
    `
      do $$
      declare
        immutable_blocked boolean := false;
      begin
        if not exists (
          select 1
          from public.featured_campaign_audit audit
          where audit.id='${fixtureAuditId}'::uuid
            and audit.campaign_id_snapshot='${fixtureCampaignId}'::uuid
            and audit.salon_id_snapshot='${fixtureSalonId}'::uuid
            and audit.salon_name_snapshot='Featured Audit Migration Fixture'
            and audit.placement_basis_snapshot='paid'
        ) then
          raise exception 'Historical Featured Salon audit snapshots were not backfilled';
        end if;

        if (
          select count(*)
          from pg_trigger trigger_row
          join pg_class table_row on table_row.oid=trigger_row.tgrelid
          join pg_namespace namespace_row on namespace_row.oid=table_row.relnamespace
          where namespace_row.nspname='public'
            and table_row.relname='featured_campaign_audit'
            and trigger_row.tgname='featured_campaign_audit_immutable'
            and not trigger_row.tgisinternal
        ) <> 1 then
          raise exception 'Featured Salon audit immutability trigger was not restored exactly once';
        end if;

        begin
          update public.featured_campaign_audit
          set reason='This update must be rejected.'
          where id='${fixtureAuditId}'::uuid;
        exception
          when raise_exception then
            if sqlerrm='Featured campaign audit records are immutable.' then
              immutable_blocked := true;
            else
              raise;
            end if;
        end;

        if not immutable_blocked then
          raise exception 'Featured Salon audit records became mutable after the backfill';
        end if;
      end
      $$;
    `,
  ],
  "Historical Featured Salon audit backfill and immutability assertion",
);

process.stdout.write(
  "Production-shaped Featured Salon audit migration regression passed: a populated immutable audit table was backfilled and the immutable trigger was restored.\n",
);
