import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { isUniqueViolation } from "../utils/db.js";
import { hashPassword } from "../services/password.service.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  type AdminUserRow,
  createAdminUser,
  findAdminUserById,
  listAdminUsers,
  setAdminUserActive,
  updateAdminUser,
} from "../repositories/adminUser.repository.js";
import {
  assignRoleToAdmin,
  findRoleById,
  listRolesForAdmin,
  removeRoleFromAdmin,
  type RoleRow,
} from "../repositories/rbac.repository.js";
import { revokeAllSessionsForAdmin } from "../repositories/session.repository.js";

const serializeAdmin = (admin: AdminUserRow, roles: RoleRow[]) => ({
  id: admin.id,
  email: admin.email,
  fullName: admin.full_name,
  isActive: admin.is_active,
  createdAt: admin.created_at,
  updatedAt: admin.updated_at,
  roles: roles.map((r) => ({ id: r.id, name: r.name })),
});

const parsePagination = (req: Request) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { limit, offset };
};

export const listAdminsHandler = async (req: Request, res: Response): Promise<void> => {
  const { limit, offset } = parsePagination(req);
  const admins = await listAdminUsers(limit, offset);
  const serialized = await Promise.all(
    admins.map(async (admin) => serializeAdmin(admin, await listRolesForAdmin(admin.id))),
  );
  sendSuccess(res, 200, { admins: serialized }, { limit, offset });
};

export const getAdminHandler = async (req: Request, res: Response): Promise<void> => {
  const admin = await findAdminUserById(req.params.id as string);
  if (!admin) {
    throw new AppError("ADMIN_NOT_FOUND", "Admin user not found.", 404);
  }
  const roles = await listRolesForAdmin(admin.id);
  sendSuccess(res, 200, { admin: serializeAdmin(admin, roles) });
};

export const createAdminHandler = async (req: Request, res: Response): Promise<void> => {
  const { email, password, fullName, roleIds } = req.body as {
    email: string;
    password: string;
    fullName: string;
    roleIds: string[];
  };

  for (const roleId of roleIds) {
    const role = await findRoleById(roleId);
    if (!role) {
      throw new AppError("ROLE_NOT_FOUND", `Role ${roleId} does not exist.`, 400);
    }
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

  for (const roleId of roleIds) {
    await assignRoleToAdmin(created.id, roleId);
  }

  const roles = await listRolesForAdmin(created.id);

  await recordAudit(req, AUDIT_ACTIONS.ADMIN_CREATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: created.id,
    metadata: { email: created.email, fullName: created.full_name, roleIds },
  });

  sendSuccess(res, 201, { admin: serializeAdmin(created, roles) });
};

export const updateAdminHandler = async (req: Request, res: Response): Promise<void> => {
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

  if (!updated) {
    throw new AppError("ADMIN_NOT_FOUND", "Admin user not found.", 404);
  }

  const roles = await listRolesForAdmin(updated.id);

  await recordAudit(req, AUDIT_ACTIONS.ADMIN_UPDATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: updated.id,
    metadata: { email, fullName },
  });

  sendSuccess(res, 200, { admin: serializeAdmin(updated, roles) });
};

export const disableAdminHandler = async (req: Request, res: Response): Promise<void> => {
  const updated = await setAdminUserActive(req.params.id as string, false);
  if (!updated) {
    throw new AppError("ADMIN_NOT_FOUND", "Admin user not found.", 404);
  }

  await revokeAllSessionsForAdmin(updated.id);

  await recordAudit(req, AUDIT_ACTIONS.ADMIN_DISABLED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: updated.id,
  });
  await recordAudit(req, AUDIT_ACTIONS.SESSION_REVOKED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: updated.id,
    metadata: { reason: "admin_disabled" },
  });

  const roles = await listRolesForAdmin(updated.id);
  sendSuccess(res, 200, { admin: serializeAdmin(updated, roles) });
};

export const enableAdminHandler = async (req: Request, res: Response): Promise<void> => {
  const updated = await setAdminUserActive(req.params.id as string, true);
  if (!updated) {
    throw new AppError("ADMIN_NOT_FOUND", "Admin user not found.", 404);
  }

  await recordAudit(req, AUDIT_ACTIONS.ADMIN_ENABLED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: updated.id,
  });

  const roles = await listRolesForAdmin(updated.id);
  sendSuccess(res, 200, { admin: serializeAdmin(updated, roles) });
};

export const assignRoleHandler = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.params.id as string;
  const { roleId } = req.body as { roleId: string };

  const admin = await findAdminUserById(adminId);
  if (!admin) {
    throw new AppError("ADMIN_NOT_FOUND", "Admin user not found.", 404);
  }

  const role = await findRoleById(roleId);
  if (!role) {
    throw new AppError("ROLE_NOT_FOUND", "Role not found.", 404);
  }

  await assignRoleToAdmin(adminId, roleId);

  await recordAudit(req, AUDIT_ACTIONS.ROLE_ASSIGNED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: adminId,
    metadata: { roleId, roleName: role.name },
  });

  const roles = await listRolesForAdmin(adminId);
  sendSuccess(res, 200, { admin: serializeAdmin(admin, roles) });
};

export const removeRoleHandler = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.params.id as string;
  const roleId = req.params.roleId as string;

  const admin = await findAdminUserById(adminId);
  if (!admin) {
    throw new AppError("ADMIN_NOT_FOUND", "Admin user not found.", 404);
  }

  const removed = await removeRoleFromAdmin(adminId, roleId);
  if (!removed) {
    throw new AppError("ROLE_ASSIGNMENT_NOT_FOUND", "That admin does not have this role assigned.", 404);
  }

  await recordAudit(req, AUDIT_ACTIONS.ROLE_REMOVED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "admin_user",
    targetId: adminId,
    metadata: { roleId },
  });

  const roles = await listRolesForAdmin(adminId);
  sendSuccess(res, 200, { admin: serializeAdmin(admin, roles) });
};
