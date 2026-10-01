import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { findPermissionById, listPermissions, type PermissionRow } from "../repositories/rbac.repository.js";
import { listAdministrationPermissionsQuerySchema } from "../validation/administration.schema.js";

const serializePermission = (p: PermissionRow) => ({
  id: p.id,
  key: p.key,
  resource: p.resource,
  action: p.action,
  description: p.description,
});

// The catalogue is small and centrally defined (never edited through this
// read-only view), so filtering/grouping happens in memory rather than
// adding query complexity to a table that rarely exceeds a few dozen rows.
export const listAdministrationPermissionsHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listAdministrationPermissionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }
  const { search, resource } = parsed.data;

  let permissions = await listPermissions();
  if (resource) {
    permissions = permissions.filter((p) => p.resource === resource);
  }
  if (search) {
    const needle = search.toLowerCase();
    permissions = permissions.filter(
      (p) =>
        p.key.toLowerCase().includes(needle) ||
        p.resource.toLowerCase().includes(needle) ||
        p.action.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle),
    );
  }

  const grouped: Record<string, ReturnType<typeof serializePermission>[]> = {};
  for (const permission of permissions) {
    grouped[permission.resource] ??= [];
    grouped[permission.resource]!.push(serializePermission(permission));
  }

  sendSuccess(res, 200, {
    permissions: permissions.map(serializePermission),
    groupedByResource: grouped,
  });
};

export const getAdministrationPermissionHandler = async (req: Request, res: Response): Promise<void> => {
  const permission = await findPermissionById(req.params.id as string);
  if (!permission) throw new AppError("PERMISSION_NOT_FOUND", "Permission not found.", 404);
  sendSuccess(res, 200, { permission: serializePermission(permission) });
};
