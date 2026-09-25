import { Pool } from "pg";
import { env } from "../../config/env.js";
import { logWithContext } from "../../utils/logger.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

pool.on("error", (err) => {
  logWithContext("error", "postgres_pool_error", { error: { message: err.message } });
});

export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    logWithContext("error", "postgres_health_check_failed", {
      error: err instanceof Error ? { message: err.message } : err,
    });
    return false;
  }
};
