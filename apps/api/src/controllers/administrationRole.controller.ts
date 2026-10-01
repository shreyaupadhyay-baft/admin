import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { isUniqueViolation } from "../utils/db.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import { assertGrantableByActor, assertRoleIsNotSuperAdmin } from "../services/privilegeEscalation.service.js";
import {
  countAdminsForRole,
  createRole,
  findPermissionById,
  findRoleById,
  listPermissionsByIds,
  listPermissionsForRole,
  listRolesAdministration,
  setRoleActive,
  setRolePermissions,
  updateRole,
  type PermissionRow,
  type RoleRow,
} from "../repositories/rbac.repository.js";
import { listAdministrationRolesQuerySchema } from "../validation/administration.schema.js";

const serializeRoleSummary = (role: RoleRow) => ({
  id: role.id,
  name: role.name,
  description: role.description,
  isSystem: role.is_system,
  isActive: role.is_active,
  createdAt: role.created_at,
  updatedAt: role.updated_at,
});

const serializeRoleDetail = (role: RoleRow, permissions: PermissionRow[], assignedAdminCount: number) => ({
  ...serializeRoleSummary(role),
  permissions: permissions.map((p) => ({ id: p.id, key: p.key, resource: p.resource, action: p.action })),
  assignedAdminCount,
});

const notFound = () => new AppError("ROLE_NOT_FOUND", "Role not found.", 404);

const assertPermissionsExist = async (permissionIds: string[]): Promise<void> => {
  for (const permissionId of permissionIds) {
    const permission = await findPermissionById(permissionId);
    if (!permission) throw new AppError("PERMISSION_NOT_FOUND", `Permission ${permissionId} does not exist.`, 400);
  }
};

export const listAdministrationRolesHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listAdministrationRolesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, search, isActive } = parsed.data;
  const roles = await listRolesAdministration({ limit, offset, search, isActive });

  sendSuccess(res, 200, { roles: roles.map(serializeRoleSummary) }, { limit, offset });
};

export const getAdministrationRoleHandler = async (req: Request, res: Response): Promise<void> => {
  const role = await findRoleById(req.params.id as string);
  if (!role) throw notFound();

  const [permissions, assignedAdminCount] = await Promise.all([
    listPermissionsForRole(role.id),
    countAdminsForRole(role.id),
  ]);

  sendSuccess(res, 200, { role: serializeRoleDetail(role, permissions, assignedAdminCount) });
};

export const createAdministrationRoleHandler = async (req: Request, res: Response): Promise<void> => {
  const { name, description, permissionIds } = req.body as {
    name: string;
    description: string;
    permissionIds: string[];
  };

  await assertPermissionsExist(permissionIds);

  const candidateKeys = (await listPermissionsByIds(permissionIds)).map((p) => p.key);
  assertGrantableByActor(req.admin?.permissions ?? [], candidateKeys);

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

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ROLE_CREATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "role",
    targetId: created.id,
    metadata: { name: created.name, permissionIds },
  });

  const permissions = await listPermissionsForRole(created.id);
  sendSuccess(res, 201, { role: serializeRoleDetail(created, permissions, 0) });
};

export const updateAdministrationRoleHandler = async (req: Request, res: Response): Promise<void> => {
  const { name, description } = req.body as { name?: string; description?: string };
  const roleId = req.params.id as string;

  const existing = await findRoleById(roleId);
  if (!existing) throw notFound();

  if (name !== undefined && name !== existing.name) {
    assertRoleIsNotSuperAdmin(existing.name, "renamed");
  }

  let updated: RoleRow | null;
  try {
    updated = await updateRole(roleId, { name, description });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("ROLE_ALREADY_EXISTS", "A role with this name already exists.", 409);
    }
    throw err;
  }
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ROLE_UPDATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "role",
    targetId: updated.id,
    metadata: { name, description },
  });

  const [permissions, assignedAdminCount] = await Promise.all([
    listPermissionsForRole(updated.id),
    countAdminsForRole(updated.id),
  ]);
  sendSuccess(res, 200, { role: serializeRoleDetail(updated, permissions, assignedAdminCount) });
};

export const enableRoleHandler = async (req: Request, res: Response): Promise<void> => {
  const roleId = req.params.id as string;
  const updated = await setRoleActive(roleId, true);
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ROLE_ENABLED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "role",
    targetId: roleId,
  });

  sendSuccess(res, 200, { role: serializeRoleSummary(updated) });
};

export const disableRoleHandler = async (req: Request, res: Response): Promise<void> => {
  const roleId = req.params.id as string;

  const existing = await findRoleById(roleId);
  if (!existing) throw notFound();
  assertRoleIsNotSuperAdmin(existing.name, "disabled");

  const updated = await setRoleActive(roleId, false);
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ROLE_DISABLED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "role",
    targetId: roleId,
  });

  sendSuccess(res, 200, { role: serializeRoleSummary(updated) });
};

export const updateRolePermissionsHandler = async (req: Request, res: Response): Promise<void> => {
  const roleId = req.params.id as string;
  const { permissionIds } = req.body as { permissionIds: string[] };

  const existing = await findRoleById(roleId);
  if (!existing) throw notFound();
  assertRoleIsNotSuperAdmin(existing.name, "have its permissions changed");

  await assertPermissionsExist(permissionIds);

  const candidateKeys = (await listPermissionsByIds(permissionIds)).map((p) => p.key);
  assertGrantableByActor(req.admin?.permissions ?? [], candidateKeys);

  await setRolePermissions(roleId, permissionIds);

  await recordAudit(req, AUDIT_ACTIONS.ADMINISTRATION_ROLE_PERMISSIONS_UPDATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "role",
    targetId: roleId,
    metadata: { permissionIds },
  });

  const permissions = await listPermissionsForRole(roleId);
  const assignedAdminCount = await countAdminsForRole(roleId);
  sendSuccess(res, 200, { role: serializeRoleDetail(existing, permissions, assignedAdminCount) });
};
