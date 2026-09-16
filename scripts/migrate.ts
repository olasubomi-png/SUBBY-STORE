/**
 * Apply ordered SQL migrations in db/migrations/*.sql
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npm run db:migrate
 *
 * Tracks applied files in schema_migrations.
 * Safe to re-run (skips already-applied files).
 * Does NOT connect to any DB unless DATABASE_URL is set in the environment.
 */
import fs from "fs";
import path from "path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required. Example:");
    console.error('  DATABASE_URL="postgresql://..." npm run db:migrate');
    process.exit(1);
  }

  // Refuse accidental memory/test URLs looking empty
  if (url.includes("localhost") && process.env.ALLOW_LOCAL_MIGRATE !== "1" && process.env.NODE_ENV === "production") {
    console.error("Refusing localhost DATABASE_URL when NODE_ENV=production (set ALLOW_LOCAL_MIGRATE=1 to override).");
    process.exit(1);
  }

  const migrationsDir = path.join(process.cwd(), "db", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
    .sort();

  if (files.length === 0) {
    console.error("No .sql files found in db/migrations");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 15 });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id serial PRIMARY KEY,
        filename varchar(255) NOT NULL UNIQUE,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const appliedRows = await sql<{ filename: string }[]>`
      SELECT filename FROM schema_migrations ORDER BY filename
    `;
    const applied = new Set(appliedRows.map((r) => r.filename));

    console.log(`Found ${files.length} migration file(s); ${applied.size} already applied.`);

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip  ${file}`);
        continue;
      }
      const full = path.join(migrationsDir, file);
      const body = fs.readFileSync(full, "utf8").trim();
      if (!body) {
        console.log(`  skip  ${file} (empty)`);
        continue;
      }
      console.log(`  apply ${file} ...`);
      await sql.begin(async (tx) => {
        // Run the whole file as one script (supports multiple statements)
        await tx.unsafe(body);
        await tx`
          INSERT INTO schema_migrations (filename) VALUES (${file})
        `;
      });
      console.log(`  done  ${file}`);
    }

    console.log("Migrations complete.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
