import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";
import { logWithContext } from "../../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "migrations");

const ensureMigrationsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const runMigrations = async () => {
  await ensureMigrationsTable();

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [file]);
    if (rows.length > 0) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      logWithContext("info", "migration_applied", { filename: file });
    } catch (err) {
      await client.query("ROLLBACK");
      logWithContext("error", "migration_failed", {
        filename: file,
        error: err instanceof Error ? { message: err.message } : err,
      });
      throw err;
    } finally {
      client.release();
    }
  }
};

runMigrations()
  .then(() => {
    logWithContext("info", "migrations_complete");
    return pool.end();
  })
  .catch((err) => {
    logWithContext("error", "migrations_aborted", {
      error: err instanceof Error ? { message: err.message } : err,
    });
    process.exitCode = 1;
  });
