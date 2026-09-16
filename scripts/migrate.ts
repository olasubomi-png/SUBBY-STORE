/**
 * Apply ordered SQL migrations in db/migrations/*.sql
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npm run db:migrate
 *
 * Tracks applied files in schema_migrations.
 *
 * Auto-baseline: if core app tables exist but history is empty, mark only
 * migrations whose expected tables already exist. Missing feature tables
 * (subscriptions, seller_wallets, …) are still applied from SQL.
 *
 * Force re-apply specific missing features:
 *   MIGRATE_REPAIR=subscriptions DATABASE_URL=... npm run db:migrate
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

/** Tables that must exist for a migration to be considered already applied. */
const MIGRATION_TABLES: Record<string, string[]> = {
  "0011_subscriptions.sql": [
    "subscription_plans",
    "subscriptions",
    "billing_transactions",
    "subscription_events",
  ],
  "0012_subscription_recurring.sql": ["subscriptions"],
  "0013_seller_wallet.sql": [
    "seller_wallets",
    "wallet_ledger",
    "seller_bank_accounts",
    "withdrawals",
  ],
  "0014_wallet_hardening.sql": ["pending_wallet_credits"],
  "0015_wallet_ops_indexes.sql": ["seller_wallets"],
};

function listSqlFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
    .sort();
}

function isBefore(file: string, before: string): boolean {
  return file < before;
}

async function tableExists(
  sql: postgres.Sql,
  table: string
): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function allTablesExist(
  sql: postgres.Sql,
  tables: string[]
): Promise<boolean> {
  for (const t of tables) {
    if (!(await tableExists(sql, t))) return false;
  }
  return true;
}

async function unmark(sql: postgres.Sql, filename: string) {
  await sql`DELETE FROM schema_migrations WHERE filename = ${filename}`;
}

async function markApplied(sql: postgres.Sql, filename: string) {
  await sql`
    INSERT INTO schema_migrations (filename)
    VALUES (${filename})
    ON CONFLICT (filename) DO NOTHING
  `;
}

async function applyFile(
  sql: postgres.Sql,
  migrationsDir: string,
  file: string
): Promise<"applied" | "skipped_exists"> {
  const full = path.join(migrationsDir, file);
  let body = fs.readFileSync(full, "utf8");
  body = body.replace(/-->\s*statement-breakpoint/g, "\n").trim();
  if (!body) return "applied";

  console.log(`  apply ${file} ...`);
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`
        INSERT INTO schema_migrations (filename) VALUES (${file})
        ON CONFLICT (filename) DO NOTHING
      `;
    });
    console.log(`  done  ${file}`);
    return "applied";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already exists/i.test(msg) || /duplicate key/i.test(msg)) {
      console.warn(
        `  warn  ${file}: ${msg.split("\n")[0]} — recording as applied`
      );
      await markApplied(sql, file);
      return "skipped_exists";
    }
    throw err;
  }
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required.");
    console.error('  DATABASE_URL="postgresql://..." npm run db:migrate');
    process.exit(1);
  }

  if (
    url.includes("localhost") &&
    process.env.ALLOW_LOCAL_MIGRATE !== "1" &&
    process.env.NODE_ENV === "production"
  ) {
    console.error(
      "Refusing localhost DATABASE_URL when NODE_ENV=production."
    );
    process.exit(1);
  }

  const migrationsDir = path.join(process.cwd(), "db", "migrations");
  const files = listSqlFiles(migrationsDir);
  if (files.length === 0) {
    console.error("No .sql files found in db/migrations");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 20 });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id serial PRIMARY KEY,
        filename varchar(255) NOT NULL UNIQUE,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    let appliedRows = await sql<{ filename: string }[]>`
      SELECT filename FROM schema_migrations ORDER BY filename
    `;
    let applied = new Set(appliedRows.map((r) => r.filename));

    console.log(
      `Found ${files.length} migration file(s); ${applied.size} already recorded.`
    );

    // --- Repair mode: unmark feature migrations whose tables are missing ---
    const repair = (process.env.MIGRATE_REPAIR || "").toLowerCase();
    if (repair === "subscriptions" || repair === "all") {
      for (const file of ["0011_subscriptions.sql", "0012_subscription_recurring.sql"]) {
        const required = MIGRATION_TABLES[file];
        if (required && !(await allTablesExist(sql, required))) {
          console.log(`Repair: unmarking ${file} (required tables missing)`);
          await unmark(sql, file);
          applied.delete(file);
        }
      }
    }
    if (repair === "wallet" || repair === "all") {
      for (const file of [
        "0013_seller_wallet.sql",
        "0014_wallet_hardening.sql",
        "0015_wallet_ops_indexes.sql",
      ]) {
        const required = MIGRATION_TABLES[file];
        if (required && !(await allTablesExist(sql, required))) {
          console.log(`Repair: unmarking ${file} (required tables missing)`);
          await unmark(sql, file);
          applied.delete(file);
        }
      }
    }

    // Auto-repair: if history says 0011 applied but subscriptions missing, unmark
    for (const [file, tables] of Object.entries(MIGRATION_TABLES)) {
      if (!applied.has(file)) continue;
      if (!(await allTablesExist(sql, tables))) {
        console.log(
          `Auto-repair: ${file} was marked applied but tables missing — will re-apply`
        );
        await unmark(sql, file);
        applied.delete(file);
      }
    }

    // --- Baseline for empty history + existing core schema ---
    const baselineBefore = process.env.MIGRATE_BASELINE_BEFORE?.trim() || null;
    const storesExist = await tableExists(sql, "stores");

    if (baselineBefore) {
      const toMark = files.filter(
        (f) => isBefore(f, baselineBefore) && !applied.has(f)
      );
      for (const file of toMark) {
        // Still verify guarded migrations
        const required = MIGRATION_TABLES[file];
        if (required && !(await allTablesExist(sql, required))) {
          console.log(`  skip baseline ${file} (tables not present)`);
          continue;
        }
        await markApplied(sql, file);
        applied.add(file);
        console.log(`  baseline ${file}`);
      }
    } else if (storesExist && applied.size === 0) {
      const firstWallet = files.find((f) => f.startsWith("0013_")) || "0013_";
      console.log(
        `Detected existing app schema (stores) with empty migration history.`
      );
      for (const file of files.filter((f) => isBefore(f, firstWallet))) {
        const required = MIGRATION_TABLES[file];
        if (required && !(await allTablesExist(sql, required))) {
          console.log(
            `  leave open ${file} (required tables missing — will apply SQL)`
          );
          continue;
        }
        await markApplied(sql, file);
        applied.add(file);
        console.log(`  baseline ${file}`);
      }
    }

    appliedRows = await sql<{ filename: string }[]>`
      SELECT filename FROM schema_migrations ORDER BY filename
    `;
    const appliedNow = new Set(appliedRows.map((r) => r.filename));

    let appliedCount = 0;
    for (const file of files) {
      if (appliedNow.has(file)) {
        console.log(`  skip  ${file}`);
        continue;
      }
      const result = await applyFile(sql, migrationsDir, file);
      if (result === "applied") appliedCount += 1;
      appliedNow.add(file);
    }

    const subscriptionsOk = await tableExists(sql, "subscriptions");
    const walletsOk = await tableExists(sql, "seller_wallets");
    console.log(
      `Migrations complete. Applied ${appliedCount} new file(s). subscriptions: ${subscriptionsOk}, seller_wallets: ${walletsOk}`
    );
    if (!subscriptionsOk || !walletsOk) {
      console.error(
        "WARNING: required tables still missing. Try: MIGRATE_REPAIR=all DATABASE_URL=... npm run db:migrate"
      );
      process.exit(2);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
