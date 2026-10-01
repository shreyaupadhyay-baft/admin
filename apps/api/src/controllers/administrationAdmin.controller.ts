import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { isUniqueViolation } from "../utils/db.js";
import { hashPassword } from "../services/password.service.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  assertGrantableByActor,
  assertNotDisablingLastActiveSuperAdmin,
  assertNotRemovingLastSuperAdminRole,
  assertNotSelfRoleModification,
} from "../services/privilegeEscalation.service.js";
import {
  type AdminUserRow,
  createAdminUser,
  findAdminUserById,
  listAdminUsersAdministration,
  setAdminUserActive,
  updateAdminUser,
} from "../repositories/adminUser.repository.js";
import {
  assignRoleToAdmin,
  findRoleById,
  listPermissionsForRole,
  listRolesForAdmin,
  removeRoleFromAdmin,
  type RoleRow,
} from "../repositories/rbac.repository.js";
import {
  countActiveSessionsForAdmin,
  findLatestSessionForAdmin,
  listSessionsForAdmin,
  revokeAllSessionsForAdmin,
  type AdminSessionRow,
} from "../repositories/session.repository.js";
import {
  listAdministrationAdminsQuerySchema,
  listAdminSessionsQuerySchema,
} from "../validation/administration.schema.js";
import { notifyAdmin } from "../services/notification.service.js";
import { NOTIFICATION_TYPES } from "../constants/notificationTypes.js";

const serializeAdminSummary = (admin: AdminUserRow, roles: RoleRow[]) => ({
  id: admin.id,
  email: admin.email,
  fullName: admin.full_name,
  isActive: admin.is_active,
  createdAt: admin.created_at,
  updatedAt: admin.updated_at,
  roles: roles.map((r) => ({ id: r.id, name: r.name, isActive: r.is_active })),
});

// Never includes access_token_hash/refresh_token_hash — session identity/
// timing metadata only.
const serializeSession = (session: AdminSessionRow) => ({
  id: session.id,
  userAgent: session.user_agent,
  ipAddress: session.ip_address,
  createdAt: session.created_at,
  accessExpiresAt: session.access_expires_at,
  refreshExpiresAt: session.refresh_expires_at,
  revokedAt: session.revoked_at,
  isActive: session.revoked_at === null && session.refresh_expires_at.getTime() > Date.now(),
});

const notFound = () => new AppError("ADMIN_NOT_FOUND", "Admin user not found.", 404);

export const listAdministrationAdminsHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listAdministrationAdminsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, search, isActive, roleId, sort } = parsed.data;
  const admins = await listAdminUsersAdministration({ limit, offset, search, isActive, roleId, sort });
  const serialized = await Promise.all(
    admins.map(async (admin) => serializeAdminSummary(admin, await listRolesForAdmin(admin.id))),
  );

  sendSuccess(res, 200, { admins: serialized }, { limit, offset, sort });
};

export const getAdministrationAdminHandler = async (req: Request, res: Response): Promise<void> => {
  const admin = await findAdminUserById(req.params.id as string);
  if (!admin) throw notFound();

  const [roles, latestSession, activeSessionCount] = await Promise.all([
    listRolesForAdmin(admin.id),
    findLatestSessionForAdmin(admin.id),
    countActiveSessionsForAdmin(admin.id),
  ]);

  sendSuccess(res, 200, {
    admin: {
      ...serializeAdminSummary(admin, roles),
      lastLoginAt: latestSession?.created_at ?? null,
      activeSessionCount,
    },
  });
};

export const createAdministrationAdminHandler = async (req: Request, res: Response): Promise<void> => {
  const { email, password, fullName, roleIds } = req.body as {
    email: string;
    password: string;
    fullName: string;
    roleIds: string[];
  };

  const roles: RoleRow[] = [];
  for (const roleId of roleIds) {
    const role = await findRoleById(roleId);
    if (!role) throw new AppError("ROLE_NOT_FOUND", `Role ${roleId} does not exist.`, 400);
    roles.push(role);
  }

  // Assigning a role at creation time is equivalent to assigning it
  // afterward — the same "cannot grant what you don't hold" rule applies.
  const actorPermissions = req.admin?.permissions ?? [];
  for (const role of roles) {
    const rolePermissionKeys = (await listPermissionsForRole(role.id)).map((p) => p.key);
    assertGrantableByActor(actorPermissions, rolePermissionKeys);
  }

  const passwordHash = await hashPassword(password);

  let created: AdminUserRow;
  try {
    created = await createAdminUser({ email, passwordHash, fullName });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("EMAIL_ALREADY_EXISTS", "An admin with this email already exists.", 409);
    }
    throw err;
  }

  for (const role of roles) {
    await assignRoleToAdmin(created.id, role.id);
  }

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ADMIN_CREATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: created.id,
    metadata: { email: created.email, fullName: created.full_name, roleIds },
  });

  const finalRoles = await listRolesForAdmin(created.id);
  sendSuccess(res, 201, { admin: serializeAdminSummary(created, finalRoles) });
};

export const updateAdministrationAdminHandler = async (req: Request, res: Response): Promise<void> => {
  const { email, fullName } = req.body as { email?: string; fullName?: string };

  let updated: AdminUserRow | null;
  try {
    updated = await updateAdminUser(req.params.id as string, { email, fullName });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("EMAIL_ALREADY_EXISTS", "An admin with this email already exists.", 409);
    }
    throw err;
  }
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ADMIN_UPDATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: updated.id,
    metadata: { email, fullName },
  });

  const roles = await listRolesForAdmin(updated.id);
  sendSuccess(res, 200, { admin: serializeAdminSummary(updated, roles) });
};

export const disableAdministrationAdminHandler = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.params.id as string;

  const existing = await findAdminUserById(adminId);
  if (!existing) throw notFound();

  if (existing.is_active) {
    await assertNotDisablingLastActiveSuperAdmin(adminId);
  }

  const updated = await setAdminUserActive(adminId, false);
  if (!updated) throw notFound();

  await revokeAllSessionsForAdmin(adminId);

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ADMIN_DISABLED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: adminId,
  });
  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ADMIN_SESSIONS_REVOKED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: adminId,
    metadata: { reason: "admin_disabled" },
  });

  await notifyAdmin(adminId, {
    type: NOTIFICATION_TYPES.ADMIN_ACCOUNT_DISABLED,
    title: "Your admin account was disabled",
    message: "Contact a Super Admin if you believe this was a mistake.",
    severity: "critical",
    resourceType: "admin_user",
    resourceId: adminId,
    metadata: {},
  });

  const roles = await listRolesForAdmin(adminId);
  sendSuccess(res, 200, { admin: serializeAdminSummary(updated, roles) });
};

export const enableAdministrationAdminHandler = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.params.id as string;

  const updated = await setAdminUserActive(adminId, true);
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ADMIN_ENABLED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: adminId,
  });

  const roles = await listRolesForAdmin(adminId);
  sendSuccess(res, 200, { admin: serializeAdminSummary(updated, roles) });
};

export const assignRoleAdministrationHandler = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.params.id as string;
  const { roleId } = req.body as { roleId: string };
  const actorAdminId = req.admin?.id as string;

  assertNotSelfRoleModification(actorAdminId, adminId);

  const admin = await findAdminUserById(adminId);
  if (!admin) throw notFound();

  const role = await findRoleById(roleId);
  if (!role) throw new AppError("ROLE_NOT_FOUND", "Role not found.", 404);

  const rolePermissionKeys = (await listPermissionsForRole(roleId)).map((p) => p.key);
  assertGrantableByActor(req.admin?.permissions ?? [], rolePermissionKeys);

  await assignRoleToAdmin(adminId, roleId);

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ADMIN_ROLE_ASSIGNED, {
    actorAdminId,
    targetType: "admin_user",
    targetId: adminId,
    metadata: { roleId, roleName: role.name },
  });

  await notifyAdmin(adminId, {
    type: NOTIFICATION_TYPES.ADMIN_ROLE_CHANGED,
    title: "Your roles were updated",
    message: `Role added: ${role.name}`,
    severity: "info",
    resourceType: "admin_user",
    resourceId: adminId,
    metadata: { roleId, roleName: role.name, change: "assigned" },
  });

  const roles = await listRolesForAdmin(adminId);
  sendSuccess(res, 200, { admin: serializeAdminSummary(admin, roles) });
};

export const removeRoleAdministrationHandler = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.params.id as string;
  const roleId = req.params.roleId as string;
  const actorAdminId = req.admin?.id as string;

  assertNotSelfRoleModification(actorAdminId, adminId);

  const admin = await findAdminUserById(adminId);
  if (!admin) throw notFound();

  await assertNotRemovingLastSuperAdminRole(adminId, roleId);

  const removed = await removeRoleFromAdmin(adminId, roleId);
  if (!removed) {
    throw new AppError("ROLE_ASSIGNMENT_NOT_FOUND", "That admin does not have this role assigned.", 404);
  }

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ADMIN_ROLE_REMOVED, {
    actorAdminId,
    targetType: "admin_user",
    targetId: adminId,
    metadata: { roleId },
  });

  await notifyAdmin(adminId, {
    type: NOTIFICATION_TYPES.ADMIN_ROLE_CHANGED,
    title: "Your roles were updated",
    message: "A role was removed from your account.",
    severity: "info",
    resourceType: "admin_user",
    resourceId: adminId,
    metadata: { roleId, change: "removed" },
  });

  const roles = await listRolesForAdmin(adminId);
  sendSuccess(res, 200, { admin: serializeAdminSummary(admin, roles) });
};

export const revokeAdminSessionsHandler = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.params.id as string;

  const admin = await findAdminUserById(adminId);
  if (!admin) throw notFound();

  await revokeAllSessionsForAdmin(adminId);

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ADMIN_SESSIONS_REVOKED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: adminId,
    metadata: { reason: "manual_revocation" },
  });

  sendSuccess(res, 200, { revoked: true });
};

export const listAdminSessionsHandler = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.params.id as string;

  const admin = await findAdminUserById(adminId);
  if (!admin) throw notFound();

  const parsed = listAdminSessionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0 } = parsed.data;
  const sessions = await listSessionsForAdmin(adminId, limit, offset);

  sendSuccess(res, 200, { sessions: sessions.map(serializeSession) }, { limit, offset });
};
