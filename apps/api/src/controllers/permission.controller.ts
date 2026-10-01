import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { findPermissionById, listPermissions } from "../repositories/rbac.repository.js";

const serializePermission = (permission: { id: string; key: string; resource: string; action: string; description: string }) => ({
  id: permission.id,
  key: permission.key,
  resource: permission.resource,
  action: permission.action,
  description: permission.description,
});

export const listPermissionsHandler = async (_req: Request, res: Response): Promise<void> => {
  const permissions = await listPermissions();
  sendSuccess(res, 200, { permissions: permissions.map(serializePermission) });
};

export const getPermissionHandler = async (req: Request, res: Response): Promise<void> => {
  const permission = await findPermissionById(req.params.id as string);
  if (!permission) {
    throw new AppError("PERMISSION_NOT_FOUND", "Permission not found.", 404);
  }
  sendSuccess(res, 200, { permission: serializePermission(permission) });
};
