import { AppError } from "../utils/response.js";
import { countActiveAdminsWithRole, findRoleByName, listRolesForAdmin } from "../repositories/rbac.repository.js";

export const SUPER_ADMIN_ROLE_NAME = "Super Admin";

/**
 * Rule: an admin can never grant a permission they do not themselves hold —
 * whether by creating/editing a role's permission set or by assigning an
 * existing role to another admin. Super Admin's own permission set is every
 * permission that exists (seeded via a CROSS JOIN in every domain's seed
 * migration), so this check is always a no-op for Super Admin — it isn't a
 * special case, it falls out of the subset check naturally.
 */
export const assertGrantableByActor = (actorPermissionKeys: string[], candidateKeys: string[]): void => {
  const actorSet = new Set(actorPermissionKeys);
  const disallowed = [...new Set(candidateKeys)].filter((key) => !actorSet.has(key));
  if (disallowed.length > 0) {
    throw new AppError(
      "PRIVILEGE_ESCALATION_DENIED",
      `You cannot grant permissions you do not hold yourself: ${disallowed.join(", ")}.`,
      403,
    );
  }
};

/**
 * Rule: an admin can never modify their own role assignments — add or
 * remove. This is a simple, absolute segregation-of-duties control: it
 * trivially satisfies "cannot grant themselves additional privileges"
 * without having to reason about which specific change would be an
 * escalation vs. a harmless no-op.
 */
export const assertNotSelfRoleModification = (actorAdminId: string, targetAdminId: string): void => {
  if (actorAdminId === targetAdminId) {
    throw new AppError(
      "SELF_ROLE_MODIFICATION_DENIED",
      "You cannot change your own role assignments. Ask another admin to do it.",
      403,
    );
  }
};

/**
 * Rules 5/6: never disable the last active admin holding the Super Admin
 * role — disabling removes their *effective* access even though the role
 * assignment row still exists. Called only for the target admin currently
 * being disabled, so it correctly fires regardless of which role is which.
 */
export const assertNotDisablingLastActiveSuperAdmin = async (targetAdminId: string): Promise<void> => {
  const superAdminRole = await findRoleByName(SUPER_ADMIN_ROLE_NAME);
  if (!superAdminRole) return; // defensive: the seed migration always creates this role

  const targetRoles = await listRolesForAdmin(targetAdminId);
  const targetHoldsSuperAdmin = targetRoles.some((r) => r.id === superAdminRole.id);
  if (!targetHoldsSuperAdmin) return;

  const activeCount = await countActiveAdminsWithRole(superAdminRole.id);
  if (activeCount <= 1) {
    throw new AppError(
      "LAST_SUPER_ADMIN_PROTECTED",
      "This is the last active Super Admin. Assign Super Admin to another admin first.",
      409,
    );
  }
};

/**
 * Rule 7: never remove the Super Admin *role assignment* from the last
 * active admin who holds it. Deliberately scoped to the exact role being
 * removed (via roleId) — an admin who holds both Super Admin and some other
 * role must still be able to have that *other* role removed without
 * tripping this guard.
 */
export const assertNotRemovingLastSuperAdminRole = async (targetAdminId: string, roleId: string): Promise<void> => {
  const superAdminRole = await findRoleByName(SUPER_ADMIN_ROLE_NAME);
  if (!superAdminRole || roleId !== superAdminRole.id) return;

  const activeCount = await countActiveAdminsWithRole(superAdminRole.id);
  if (activeCount <= 1) {
    throw new AppError(
      "LAST_SUPER_ADMIN_PROTECTED",
      "Cannot remove Super Admin from the last active admin who holds it.",
      409,
    );
  }
};

/**
 * Rule 8: the Super Admin role's identity and permission completeness are
 * immutable via the API — it can't be renamed, disabled, or have its
 * permission set edited. Its permissions stay in sync with new domains
 * automatically (every seed migration CROSS JOINs it against `permissions`),
 * so blocking API edits here doesn't leave it stale.
 */
export const assertRoleIsNotSuperAdmin = (roleName: string, action: string): void => {
  if (roleName === SUPER_ADMIN_ROLE_NAME) {
    throw new AppError("SUPER_ADMIN_ROLE_IMMUTABLE", `The Super Admin role cannot be ${action}.`, 409);
  }
};
