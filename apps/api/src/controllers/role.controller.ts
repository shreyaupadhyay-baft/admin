import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { isUniqueViolation } from "../utils/db.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  createRole,
  findPermissionById,
  findRoleById,
  listPermissionsForRole,
  listRoles,
  type RoleRow,
  setRolePermissions,
  updateRole,
  type PermissionRow,
} from "../repositories/rbac.repository.js";

const serializeRole = (role: RoleRow, permissions: PermissionRow[]) => ({
  id: role.id,
  name: role.name,
  description: role.description,
  isSystem: role.is_system,
  createdAt: role.created_at,
  updatedAt: role.updated_at,
  permissions: permissions.map((p) => ({ id: p.id, key: p.key, resource: p.resource, action: p.action })),
});

const assertPermissionsExist = async (permissionIds: string[]): Promise<void> => {
  for (const permissionId of permissionIds) {
    const permission = await findPermissionById(permissionId);
    if (!permission) {
      throw new AppError("PERMISSION_NOT_FOUND", `Permission ${permissionId} does not exist.`, 400);
    }
  }
};

export const listRolesHandler = async (_req: Request, res: Response): Promise<void> => {
  const roles = await listRoles();
  const serialized = await Promise.all(
    roles.map(async (role) => serializeRole(role, await listPermissionsForRole(role.id))),
  );
  sendSuccess(res, 200, { roles: serialized });
};

export const getRoleHandler = async (req: Request, res: Response): Promise<void> => {
  const role = await findRoleById(req.params.id as string);
  if (!role) {
    throw new AppError("ROLE_NOT_FOUND", "Role not found.", 404);
  }
  const permissions = await listPermissionsForRole(role.id);
  sendSuccess(res, 200, { role: serializeRole(role, permissions) });
};

export const createRoleHandler = async (req: Request, res: Response): Promise<void> => {
  const { name, description, permissionIds } = req.body as {
    name: string;
    description: string;
    permissionIds: string[];
  };

  await assertPermissionsExist(permissionIds);

  let created: RoleRow;
  try {
    created = await createRole({ name, description });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("ROLE_ALREADY_EXISTS", "A role with this name already exists.", 409);
    }
    throw err;
  }

  if (permissionIds.length > 0) {
    await setRolePermissions(created.id, permissionIds);
  }

  const permissions = await listPermissionsForRole(created.id);

  await recordAudit(req, AUDIT_ACTIONS.ROLE_CREATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "role",
    targetId: created.id,
    metadata: { name: created.name, permissionIds },
  });

  sendSuccess(res, 201, { role: serializeRole(created, permissions) });
};

export const updateRoleHandler = async (req: Request, res: Response): Promise<void> => {
  const { name, description, permissionIds } = req.body as {
    name?: string;
    description?: string;
    permissionIds?: string[];
  };

  if (permissionIds !== undefined) {
    await assertPermissionsExist(permissionIds);
  }

  let updated: RoleRow | null;
  try {
    updated = await updateRole(req.params.id as string, { name, description });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("ROLE_ALREADY_EXISTS", "A role with this name already exists.", 409);
    }
    throw err;
  }

  if (!updated) {
    throw new AppError("ROLE_NOT_FOUND", "Role not found.", 404);
  }

  if (permissionIds !== undefined) {
    await setRolePermissions(updated.id, permissionIds);
  }

  const permissions = await listPermissionsForRole(updated.id);

  await recordAudit(req, AUDIT_ACTIONS.ROLE_UPDATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "role",
    targetId: updated.id,
    metadata: { name, description, permissionIds },
  });

  sendSuccess(res, 200, { role: serializeRole(updated, permissions) });
};
