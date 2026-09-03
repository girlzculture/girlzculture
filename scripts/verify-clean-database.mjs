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
const permissionScopedApplicationApprovalActor =
  /'clean-application-approval@example\.test','Admin',\s*'\{"submissions":true\}'::jsonb,'Active',false/.test(
    applicationDocumentBlock,
  );
if (
  !applicationDocumentBlock.includes("#variable_conflict error") ||
  unsafeApplicationDocumentVariable ||
  unaliasedApplicationDocumentTable ||
  unqualifiedApplicationDocumentColumn ||
  !permissionScopedApplicationApprovalActor ||
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
    "Application-document lifecycle verification must use a permission-scoped non-super-admin approval fixture, error-on-conflict mode, unambiguous fixture variables, and explicit table aliases.",
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

async function runConcurrentPlanBoundaryWorkers({
  label,
  salonId,
  expectedError,
  insertStatement,
}) {
  const workerCount = 8;
  const workers = Array.from({ length: workerCount }, (_, worker) =>
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
          "--quiet",
          "--command",
          `
            begin;
            -- Keep all worker transactions open together before they reach
            -- the per-salon advisory lock in the plan-limit trigger.
            select pg_sleep(0.4);
            create or replace function pg_temp.attempt_plan_boundary()
            returns text
            language plpgsql
            as $worker_function$
            begin
              ${insertStatement(worker)}
              return 'inserted';
            exception when sqlstate 'P0001' then
              if sqlerrm = '${expectedError}' then
                return 'limit';
              end if;
              raise;
            end;
            $worker_function$;
            select pg_temp.attempt_plan_boundary();
            commit;
          `,
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
        if (code !== 0) {
          reject(
            new Error(
              `${label} worker ${worker + 1} failed unexpectedly: ${stderr.trim()}`,
            ),
          );
          return;
        }
        const outcomes = stdout
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter((value) => value === "inserted" || value === "limit");
        if (outcomes.length !== 1) {
          reject(
            new Error(
              `${label} worker ${worker + 1} returned an invalid outcome: ${stdout.trim()}`,
            ),
          );
          return;
        }
        resolve(outcomes[0]);
      });
    }),
  );

  const settled = await Promise.allSettled(workers);
  const rejected = settled.filter((result) => result.status === "rejected");
  if (rejected.length > 0) {
    throw new Error(
      rejected.map((result) => String(result.reason)).join("\n"),
    );
  }
  const outcomes = settled.map((result) => result.value);
  const inserted = outcomes.filter((outcome) => outcome === "inserted").length;
  const limited = outcomes.filter((outcome) => outcome === "limit").length;
  if (inserted !== 1 || limited !== workerCount - 1) {
    throw new Error(
      `${label} allowed ${inserted} boundary inserts and rejected ${limited}; expected exactly one insert and ${workerCount - 1} atomic limit rejections for salon ${salonId}.`,
    );
  }
}

async function runConcurrentSubscriptionCheckoutWorkers({ salonId, promoCode }) {
  const workerCount = 8;
  const workers = Array.from({ length: workerCount }, (_, worker) =>
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
          "--quiet",
          "--command",
          `
            begin;
            select pg_sleep(0.4);
            with reserved as (
              select public.reserve_subscription_checkout_attempt(
                '${salonId}'::uuid,
                'Growth',
                'price_clean_concurrent_growth',
                '${promoCode}',
                null::uuid
              ) as attempt
            )
            select concat_ws(',',
              attempt ->> 'attempt_id',
              attempt ->> 'promo_redemption_id'
            )
            from reserved;
            commit;
          `,
        ],
        { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `Subscription checkout worker ${worker + 1} failed: ${stderr.trim()}`,
            ),
          );
          return;
        }
        const outcome = stdout
          .split(/\r?\n/)
          .map((value) => value.trim())
          .find((value) => /^[0-9a-f-]{36},[0-9a-f-]{36}$/i.test(value));
        if (!outcome) {
          reject(
            new Error(
              `Subscription checkout worker ${worker + 1} returned an invalid outcome: ${stdout.trim()}`,
            ),
          );
          return;
        }
        resolve(outcome);
      });
    }),
  );
  const outcomes = await Promise.all(workers);
  if (new Set(outcomes).size !== 1) {
    throw new Error(
      `Concurrent checkout reservations produced ${new Set(outcomes).size} attempt/promo pairs; expected one.`,
    );
  }
  return outcomes[0];
}

async function runScheduledDowngradeWriterRace({
  label,
  salonId,
  scheduleError,
  writeError,
  writerStatement,
}) {
  function runWorker(workerLabel, functionName, functionBody) {
    return new Promise((resolve, reject) => {
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
          "--quiet",
          "--command",
          `
            begin;
            select pg_sleep(0.4);
            create or replace function pg_temp.${functionName}()
            returns text
            language plpgsql
            as $race_worker$
            begin
              ${functionBody}
            end;
            $race_worker$;
            select pg_temp.${functionName}();
            commit;
          `,
        ],
        { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(`${label} ${workerLabel} failed: ${stderr.trim()}`),
          );
          return;
        }
        const outcome = stdout
          .split(/\r?\n/)
          .map((value) => value.trim())
          .find((value) => [
            "scheduled",
            "schedule_limit",
            "inserted",
            "write_limit",
          ].includes(value));
        if (!outcome) {
          reject(
            new Error(
              `${label} ${workerLabel} returned an invalid outcome: ${stdout.trim()}`,
            ),
          );
          return;
        }
        resolve(outcome);
      });
    });
  }

  const [scheduleOutcome, writeOutcome] = await Promise.all([
    runWorker(
      "schedule worker",
      "attempt_scheduled_downgrade",
      `
        begin
          update public.subscriptions subscription
          set scheduled_tier='Starter',
              scheduled_price_id='price_clean_race_starter',
              stripe_schedule_id='sub_sched_clean_race_${salonId.slice(-4)}',
              scheduled_change_effective_at=now()+interval '30 days'
          where subscription.salon_id='${salonId}';
          return 'scheduled';
        exception when sqlstate 'P0001' then
          if sqlerrm='${scheduleError}' then
            return 'schedule_limit';
          end if;
          raise;
        end;
        return 'schedule_limit';
      `,
    ),
    runWorker(
      "writer",
      "attempt_inventory_write",
      `
        begin
          ${writerStatement}
          return 'inserted';
        exception when sqlstate 'P0001' then
          if sqlerrm='${writeError}' then
            return 'write_limit';
          end if;
          raise;
        end;
        return 'write_limit';
      `,
    ),
  ]);

  const scheduleWon =
    scheduleOutcome === "scheduled" && writeOutcome === "write_limit";
  const writerWon =
    scheduleOutcome === "schedule_limit" && writeOutcome === "inserted";
  if (!scheduleWon && !writerWon) {
    throw new Error(
      `${label} produced unsafe outcomes schedule=${scheduleOutcome}, writer=${writeOutcome}.`,
    );
  }
  return { scheduleOutcome, writeOutcome };
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

const checkoutConcurrencySalonId = "10000000-0000-4000-8000-000000001301";
const checkoutConcurrencyPromoId = "10000000-0000-4000-8000-000000001302";
const checkoutConcurrencyPromoCode = "CLEAN-CHECKOUT-CONCURRENCY";
runPsql(
  [
    "--command",
    `
      insert into public.salons(id,name,slug,status)
      values(
        '${checkoutConcurrencySalonId}',
        'Concurrent subscription checkout fixture',
        'concurrent-subscription-checkout-fixture',
        'New'
      );
      insert into public.promo_codes(
        id,code,discount_type,discount_value,applies_to,starts_at,ends_at,
        usage_limit,stripe_coupon_id,is_active
      ) values(
        '${checkoutConcurrencyPromoId}',
        '${checkoutConcurrencyPromoCode}',
        'percent',10,'subscription',now()-interval '1 day',
        now()+interval '1 day',1,'coupon_clean_checkout_concurrency',true
      );
    `,
  ],
  "Concurrent subscription-checkout fixture setup",
);
let checkoutConcurrencyFailure;
try {
  await runConcurrentSubscriptionCheckoutWorkers({
    salonId: checkoutConcurrencySalonId,
    promoCode: checkoutConcurrencyPromoCode,
  });
  const checkoutCounts = runPsql(
    [
      "--tuples-only",
      "--no-align",
      "--command",
      `
        select concat_ws(',',
          (
            select count(*)
            from public.subscription_checkout_attempts attempt
            where attempt.salon_id='${checkoutConcurrencySalonId}'
          ),
          (
            select count(*)
            from public.promo_code_redemptions redemption
            where redemption.promo_code_id='${checkoutConcurrencyPromoId}'
              and redemption.status='pending'
          )
        );
      `,
    ],
    "Concurrent subscription-checkout persisted-count assertion",
  );
  if (checkoutCounts !== "1,1") {
    throw new Error(
      `Concurrent subscription checkout counts were ${checkoutCounts}; expected one attempt and one promo reservation.`,
    );
  }
} catch (error) {
  checkoutConcurrencyFailure = error;
} finally {
  runPsql(
    [
      "--command",
      `
        delete from public.promo_code_redemptions redemption
        where redemption.promo_code_id='${checkoutConcurrencyPromoId}';
        delete from public.subscription_checkout_attempts attempt
        where attempt.salon_id='${checkoutConcurrencySalonId}';
        delete from public.salons salon
        where salon.id='${checkoutConcurrencySalonId}';
        delete from public.promo_codes promo
        where promo.id='${checkoutConcurrencyPromoId}';
      `,
    ],
    "Concurrent subscription-checkout fixture cleanup",
  );
}
if (checkoutConcurrencyFailure) {
  console.error("Concurrent subscription-checkout verification failed.");
  console.error(String(checkoutConcurrencyFailure));
  process.exit(1);
}
process.stdout.write(
  "Verified one durable subscription attempt and one promotion reservation across eight concurrent database sessions.\n",
);

const downgradeProductRaceSalonId = "10000000-0000-4000-8000-000000001401";
const downgradePromotionRaceSalonId = "10000000-0000-4000-8000-000000001402";
runPsql(
  [
    "--command",
    `
      insert into public.salons(
        id,name,slug,status,subscription_tier,subscription_status
      ) values
        (
          '${downgradeProductRaceSalonId}',
          'Scheduled downgrade product race fixture',
          'scheduled-downgrade-product-race-fixture',
          'New','Premium','active'
        ),
        (
          '${downgradePromotionRaceSalonId}',
          'Scheduled downgrade promotion race fixture',
          'scheduled-downgrade-promotion-race-fixture',
          'New','Premium','active'
        );
      insert into public.subscriptions(
        salon_id,tier,status,stripe_subscription_id,current_period_end
      ) values
        (
          '${downgradeProductRaceSalonId}',
          'Premium','active','sub_clean_downgrade_product_race',
          now()+interval '30 days'
        ),
        (
          '${downgradePromotionRaceSalonId}',
          'Premium','active','sub_clean_downgrade_promotion_race',
          now()+interval '30 days'
        );
      insert into public.salon_products(salon_id,name,price,product_status)
      select '${downgradeProductRaceSalonId}'::uuid,
             'Downgrade race product ' || seed.product_number,10,'Draft'
      from generate_series(1,10) as seed(product_number);
      insert into public.salon_promotions(
        salon_id,title,status,is_active,public_headline
      ) values(
        '${downgradePromotionRaceSalonId}',
        'Downgrade race promotion 1','Active',true,
        'Downgrade race promotion 1'
      );
    `,
  ],
  "Scheduled downgrade/write race fixture setup",
);
let scheduledDowngradeRaceFailure;
try {
  const productRace = await runScheduledDowngradeWriterRace({
    label: "Scheduled downgrade versus product writer race",
    salonId: downgradeProductRaceSalonId,
    scheduleError: "PLAN_DOWNGRADE_PRODUCT_LIMIT_EXCEEDED",
    writeError: "PLAN_PRODUCT_LIMIT_REACHED",
    writerStatement: `
      insert into public.salon_products(salon_id,name,price,product_status)
      values(
        '${downgradeProductRaceSalonId}',
        'Concurrent downgrade race product',10,'Draft'
      );
    `,
  });
  const productState = runPsql(
    [
      "--tuples-only",
      "--no-align",
      "--command",
      `
        select concat_ws(',',
          coalesce(subscription.scheduled_tier,''),
          (
            select count(*)
            from public.salon_products product
            where product.salon_id='${downgradeProductRaceSalonId}'
              and product.archived_at is null
              and coalesce(product.product_status,'Draft') <> 'Archived'
          )
        )
        from public.subscriptions subscription
        where subscription.salon_id='${downgradeProductRaceSalonId}';
      `,
    ],
    "Scheduled downgrade/product race state assertion",
  );
  const expectedProductState =
    productRace.scheduleOutcome === "scheduled" ? "Starter,10" : ",11";
  if (productState !== expectedProductState) {
    throw new Error(
      `Scheduled downgrade/product race persisted ${productState}; expected ${expectedProductState}.`,
    );
  }

  const promotionRace = await runScheduledDowngradeWriterRace({
    label: "Scheduled downgrade versus promotion writer race",
    salonId: downgradePromotionRaceSalonId,
    scheduleError: "PLAN_DOWNGRADE_PROMOTION_LIMIT_EXCEEDED",
    writeError: "PLAN_PROMOTION_LIMIT_REACHED",
    writerStatement: `
      insert into public.salon_promotions(
        salon_id,title,status,is_active,public_headline
      ) values(
        '${downgradePromotionRaceSalonId}',
        'Concurrent downgrade race promotion','Active',true,
        'Concurrent downgrade race promotion'
      );
    `,
  });
  const promotionState = runPsql(
    [
      "--tuples-only",
      "--no-align",
      "--command",
      `
        select concat_ws(',',
          coalesce(subscription.scheduled_tier,''),
          (
            select count(*)
            from public.salon_promotions promotion
            where promotion.salon_id='${downgradePromotionRaceSalonId}'
              and promotion.archived_at is null
              and promotion.is_active is true
              and promotion.status='Active'
          )
        )
        from public.subscriptions subscription
        where subscription.salon_id='${downgradePromotionRaceSalonId}';
      `,
    ],
    "Scheduled downgrade/promotion race state assertion",
  );
  const expectedPromotionState =
    promotionRace.scheduleOutcome === "scheduled" ? "Starter,1" : ",2";
  if (promotionState !== expectedPromotionState) {
    throw new Error(
      `Scheduled downgrade/promotion race persisted ${promotionState}; expected ${expectedPromotionState}.`,
    );
  }
} catch (error) {
  scheduledDowngradeRaceFailure = error;
} finally {
  runPsql(
    [
      "--command",
      `
        begin;
        set local session_replication_role=replica;
        delete from public.salon_promotion_audit promotion_audit
        where promotion_audit.salon_id in (
          '${downgradeProductRaceSalonId}',
          '${downgradePromotionRaceSalonId}'
        );
        delete from public.subscription_change_requests change_request
        where change_request.salon_id in (
          '${downgradeProductRaceSalonId}',
          '${downgradePromotionRaceSalonId}'
        );
        delete from public.salon_products product
        where product.salon_id in (
          '${downgradeProductRaceSalonId}',
          '${downgradePromotionRaceSalonId}'
        );
        delete from public.salon_promotions promotion
        where promotion.salon_id in (
          '${downgradeProductRaceSalonId}',
          '${downgradePromotionRaceSalonId}'
        );
        delete from public.subscriptions subscription
        where subscription.salon_id in (
          '${downgradeProductRaceSalonId}',
          '${downgradePromotionRaceSalonId}'
        );
        delete from public.salon_status_audit status_audit
        where status_audit.salon_id in (
          '${downgradeProductRaceSalonId}',
          '${downgradePromotionRaceSalonId}'
        );
        delete from public.salons salon
        where salon.id in (
          '${downgradeProductRaceSalonId}',
          '${downgradePromotionRaceSalonId}'
        );
        commit;
      `,
    ],
    "Scheduled downgrade/write race fixture cleanup",
  );
}
if (scheduledDowngradeRaceFailure) {
  console.error("Scheduled downgrade/write race verification failed.");
  console.error(String(scheduledDowngradeRaceFailure));
  process.exit(1);
}
process.stdout.write(
  "Verified scheduled downgrade atomicity against product and promotion writers with four worker transactions (two concurrent workers per race).\n",
);

const planBoundaryStarterSalonId = "10000000-0000-4000-8000-000000001201";
const planBoundaryGrowthSalonId = "10000000-0000-4000-8000-000000001202";
runPsql(
  [
    "--command",
    `
      insert into public.salons(
        id,name,slug,status,subscription_tier,subscription_status
      ) values
        (
          '${planBoundaryStarterSalonId}',
          'Concurrent Starter plan fixture',
          'concurrent-starter-plan-fixture',
          'New','Starter','active'
        ),
        (
          '${planBoundaryGrowthSalonId}',
          'Concurrent Growth plan fixture',
          'concurrent-growth-plan-fixture',
          'New','Growth','active'
        );

      insert into public.subscriptions(
        salon_id,tier,status,stripe_subscription_id,current_period_end
      ) values
        (
          '${planBoundaryStarterSalonId}',
          'Starter','active','sub_concurrent_plan_starter',now()+interval '30 days'
        ),
        (
          '${planBoundaryGrowthSalonId}',
          'Growth','active','sub_concurrent_plan_growth',now()+interval '30 days'
        );

      insert into public.salon_products(salon_id,name,price,product_status)
      select '${planBoundaryStarterSalonId}'::uuid,
             'Starter race seed product ' || seed.product_number,10,'Draft'
      from generate_series(1,9) as seed(product_number);
      insert into public.salon_products(salon_id,name,price,product_status)
      select '${planBoundaryGrowthSalonId}'::uuid,
             'Growth race seed product ' || seed.product_number,10,'Draft'
      from generate_series(1,29) as seed(product_number);

      insert into public.salon_promotions(
        salon_id,title,status,is_active,public_headline
      )
      select '${planBoundaryGrowthSalonId}'::uuid,
             'Growth race seed promotion ' || seed.promotion_number,
             'Active',true,'Growth race seed promotion'
      from generate_series(1,4) as seed(promotion_number);
    `,
  ],
  "Concurrent plan-limit fixture setup",
);

let concurrentPlanBoundaryFailure;
try {
  await runConcurrentPlanBoundaryWorkers({
    label: "Starter product-limit race",
    salonId: planBoundaryStarterSalonId,
    expectedError: "PLAN_PRODUCT_LIMIT_REACHED",
    insertStatement: (worker) => `
      insert into public.salon_products(salon_id,name,price,product_status)
      values(
        '${planBoundaryStarterSalonId}',
        'Concurrent Starter product ${worker + 1}',10,'Draft'
      );
    `,
  });
  await runConcurrentPlanBoundaryWorkers({
    label: "Growth product-limit race",
    salonId: planBoundaryGrowthSalonId,
    expectedError: "PLAN_PRODUCT_LIMIT_REACHED",
    insertStatement: (worker) => `
      insert into public.salon_products(salon_id,name,price,product_status)
      values(
        '${planBoundaryGrowthSalonId}',
        'Concurrent Growth product ${worker + 1}',10,'Draft'
      );
    `,
  });
  await runConcurrentPlanBoundaryWorkers({
    label: "Starter promotion-limit race",
    salonId: planBoundaryStarterSalonId,
    expectedError: "PLAN_PROMOTION_LIMIT_REACHED",
    insertStatement: (worker) => `
      insert into public.salon_promotions(
        salon_id,title,status,is_active,public_headline
      ) values(
        '${planBoundaryStarterSalonId}',
        'Concurrent Starter promotion ${worker + 1}',
        'Active',true,'Concurrent Starter promotion'
      );
    `,
  });
  await runConcurrentPlanBoundaryWorkers({
    label: "Growth promotion-limit race",
    salonId: planBoundaryGrowthSalonId,
    expectedError: "PLAN_PROMOTION_LIMIT_REACHED",
    insertStatement: (worker) => `
      insert into public.salon_promotions(
        salon_id,title,status,is_active,public_headline
      ) values(
        '${planBoundaryGrowthSalonId}',
        'Concurrent Growth promotion ${worker + 1}',
        'Active',true,'Concurrent Growth promotion'
      );
    `,
  });

  const boundaryCounts = runPsql(
    [
      "--tuples-only",
      "--no-align",
      "--command",
      `
        select concat_ws(',',
          (
            select count(*) from public.salon_products product
            where product.salon_id='${planBoundaryStarterSalonId}'
              and product.archived_at is null
              and coalesce(product.product_status,'Draft') <> 'Archived'
          ),
          (
            select count(*) from public.salon_products product
            where product.salon_id='${planBoundaryGrowthSalonId}'
              and product.archived_at is null
              and coalesce(product.product_status,'Draft') <> 'Archived'
          ),
          (
            select count(*) from public.salon_promotions promotion
            where promotion.salon_id='${planBoundaryStarterSalonId}'
              and promotion.archived_at is null
              and promotion.is_active is true
              and promotion.status='Active'
          ),
          (
            select count(*) from public.salon_promotions promotion
            where promotion.salon_id='${planBoundaryGrowthSalonId}'
              and promotion.archived_at is null
              and promotion.is_active is true
              and promotion.status='Active'
          )
        );
      `,
    ],
    "Concurrent plan-limit persisted-count assertion",
  );
  if (boundaryCounts !== "10,30,1,5") {
    throw new Error(
      `Concurrent plan-limit counts were ${boundaryCounts}; expected Starter/Growth products and promotions to stop at 10,30,1,5.`,
    );
  }
} catch (error) {
  concurrentPlanBoundaryFailure = error;
} finally {
  runPsql(
    [
      "--command",
      `
        begin;
        set local session_replication_role=replica;
        delete from public.salon_promotion_audit promotion_audit
        where promotion_audit.salon_id in (
          '${planBoundaryStarterSalonId}',
          '${planBoundaryGrowthSalonId}'
        );
        delete from public.subscription_change_requests change_request
        where change_request.salon_id in (
          '${planBoundaryStarterSalonId}',
          '${planBoundaryGrowthSalonId}'
        );
        delete from public.salon_products product
        where product.salon_id in (
          '${planBoundaryStarterSalonId}',
          '${planBoundaryGrowthSalonId}'
        );
        delete from public.salon_promotions promotion
        where promotion.salon_id in (
          '${planBoundaryStarterSalonId}',
          '${planBoundaryGrowthSalonId}'
        );
        delete from public.subscriptions subscription
        where subscription.salon_id in (
          '${planBoundaryStarterSalonId}',
          '${planBoundaryGrowthSalonId}'
        );
        delete from public.salon_status_audit status_audit
        where status_audit.salon_id in (
          '${planBoundaryStarterSalonId}',
          '${planBoundaryGrowthSalonId}'
        );
        delete from public.salons salon
        where salon.id in (
          '${planBoundaryStarterSalonId}',
          '${planBoundaryGrowthSalonId}'
        );
        commit;
      `,
    ],
    "Concurrent plan-limit fixture cleanup",
  );
}
if (concurrentPlanBoundaryFailure) {
  console.error("Concurrent plan-limit verification failed.");
  console.error(String(concurrentPlanBoundaryFailure));
  process.exit(1);
}
process.stdout.write(
  "Verified atomic Starter/Growth product and promotion boundaries across 32 concurrent database transactions.\n",
);

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
