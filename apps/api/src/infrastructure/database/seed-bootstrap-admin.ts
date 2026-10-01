import { env } from "../../config/env.js";
import { logWithContext } from "../../utils/logger.js";
import { hashPassword } from "../../services/password.service.js";
import { findAdminUserByEmail, createAdminUser } from "../../repositories/adminUser.repository.js";
import { assignRoleToAdmin, findRoleByName } from "../../repositories/rbac.repository.js";
import { pool } from "./pool.js";

// Bootstraps the first Super Admin from env vars. Never embeds a credential
// in a migration file (migrations are checked into git). Safe to run more
// than once: it's a no-op once the account already exists.
const run = async () => {
  const { BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_FULL_NAME } = env;

  if (!BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
    logWithContext("info", "bootstrap_admin_skipped", {
      reason: "BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set",
    });
    return;
  }

  const existing = await findAdminUserByEmail(BOOTSTRAP_ADMIN_EMAIL);
  if (existing) {
    logWithContext("info", "bootstrap_admin_already_exists", { email: BOOTSTRAP_ADMIN_EMAIL });
    return;
  }

  const superAdminRole = await findRoleByName("Super Admin");
  if (!superAdminRole) {
    throw new Error("Super Admin role not found — run db:migrate before db:seed:admin.");
  }

  const passwordHash = await hashPassword(BOOTSTRAP_ADMIN_PASSWORD);
  const admin = await createAdminUser({
    email: BOOTSTRAP_ADMIN_EMAIL,
    passwordHash,
    fullName: BOOTSTRAP_ADMIN_FULL_NAME ?? "Super Admin",
  });

  await assignRoleToAdmin(admin.id, superAdminRole.id);

  logWithContext("info", "bootstrap_admin_created", { email: admin.email, adminId: admin.id });
};

run()
  .then(() => pool.end())
  .catch((err) => {
    logWithContext("error", "bootstrap_admin_failed", {
      error: err instanceof Error ? { message: err.message } : err,
    });
    process.exitCode = 1;
  });
