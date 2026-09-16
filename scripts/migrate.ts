/**
 * Apply ordered SQL migrations in db/migrations/*.sql
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npm run db:migrate
 *
 * Tracks applied files in schema_migrations.
 * Safe to re-run (skips already-applied files).
 *
 * Production note:
 * If the DB was created with drizzle-kit push / partial history and
 * schema_migrations is empty, this script auto-baselines older
 * migrations once core tables (e.g. stores) already exist, then applies
 * only the remaining files (wallet 0013–0015, etc.).
 *
 * Force baseline without applying SQL for listed prefixes:
 *   MIGRATE_BASELINE_BEFORE=0013 npm run db:migrate
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

function listSqlFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
    .sort();
}

/** Lexicographic compare for migration filenames like 0012_... vs 0013_... */
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

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required. Example:");
    console.error('  DATABASE_URL="postgresql://..." npm run db:migrate');
    process.exit(1);
  }

  if (
    url.includes("localhost") &&
    process.env.ALLOW_LOCAL_MIGRATE !== "1" &&
    process.env.NODE_ENV === "production"
  ) {
    console.error(
      "Refusing localhost DATABASE_URL when NODE_ENV=production (set ALLOW_LOCAL_MIGRATE=1 to override)."
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
    const applied = new Set(appliedRows.map((r) => r.filename));

    console.log(
      `Found ${files.length} migration file(s); ${applied.size} already recorded.`
    );

    // --- Baseline for existing production DBs (drizzle push / no history) ---
    const baselineBefore =
      process.env.MIGRATE_BASELINE_BEFORE?.trim() || null;
    const storesExist = await tableExists(sql, "stores");
    const walletsExist = await tableExists(sql, "seller_wallets");

    if (baselineBefore) {
      const toMark = files.filter(
        (f) => isBefore(f, baselineBefore) && !applied.has(f)
      );
      if (toMark.length) {
        console.log(
          `Baselining ${toMark.length} file(s) before ${baselineBefore} (no SQL run)...`
        );
        for (const file of toMark) {
          await sql`
            INSERT INTO schema_migrations (filename)
            VALUES (${file})
            ON CONFLICT (filename) DO NOTHING
          `;
          applied.add(file);
          console.log(`  baseline ${file}`);
        }
      }
    } else if (storesExist && applied.size === 0) {
      // Auto-baseline everything strictly before the first wallet migration
      // when the app schema is already present but history was never tracked.
      const firstWallet = files.find((f) => f.startsWith("0013_"));
      const cutoff = firstWallet || "0013_";
      const toMark = files.filter((f) => isBefore(f, cutoff));
      console.log(
        `Detected existing app schema (stores) with empty migration history.`
      );
      console.log(
        `Baselining ${toMark.length} pre-wallet migration(s) as already applied...`
      );
      for (const file of toMark) {
        await sql`
          INSERT INTO schema_migrations (filename)
          VALUES (${file})
          ON CONFLICT (filename) DO NOTHING
        `;
        applied.add(file);
        console.log(`  baseline ${file}`);
      }
      if (walletsExist) {
        // Also mark wallet migrations if tables already present
        for (const file of files.filter(
          (f) => f.startsWith("0013_") || f.startsWith("0014_") || f.startsWith("0015_")
        )) {
          if (applied.has(file)) continue;
          await sql`
            INSERT INTO schema_migrations (filename)
            VALUES (${file})
            ON CONFLICT (filename) DO NOTHING
          `;
          applied.add(file);
          console.log(`  baseline ${file} (seller_wallets already exists)`);
        }
      }
    }

    // Refresh applied set
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
      const full = path.join(migrationsDir, file);
      let body = fs.readFileSync(full, "utf8");
      // Drizzle kit inserts this marker between statements — strip it
      body = body.replace(/-->\s*statement-breakpoint/g, "\n").trim();
      if (!body) {
        console.log(`  skip  ${file} (empty)`);
        continue;
      }
      console.log(`  apply ${file} ...`);
      try {
        await sql.begin(async (tx) => {
          await tx.unsafe(body);
          await tx`
            INSERT INTO schema_migrations (filename) VALUES (${file})
          `;
        });
        console.log(`  done  ${file}`);
        appliedCount += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If object already exists, record as applied so we can continue
        // (common when schema was partially created outside this runner).
        if (
          /already exists/i.test(msg) ||
          /duplicate key/i.test(msg)
        ) {
          console.warn(
            `  warn  ${file}: ${msg.split("\n")[0]} — recording as applied and continuing`
          );
          await sql`
            INSERT INTO schema_migrations (filename)
            VALUES (${file})
            ON CONFLICT (filename) DO NOTHING
          `;
          appliedNow.add(file);
          continue;
        }
        throw err;
      }
    }

    const walletsOk = await tableExists(sql, "seller_wallets");
    console.log(
      `Migrations complete. Applied ${appliedCount} new file(s). seller_wallets exists: ${walletsOk}`
    );
    if (!walletsOk) {
      console.error(
        "WARNING: seller_wallets still missing. Check 0013_seller_wallet.sql."
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
