import { randomUUID } from "node:crypto";
import { db, FakeUniqueViolation, type FakePermission, type FakeRole } from "./store.js";

export const listRoles = async (): Promise<FakeRole[]> =>
  [...db.roles].sort((a, b) => a.name.localeCompare(b.name));

export const findRoleById = async (id: string): Promise<FakeRole | null> =>
  db.roles.find((r) => r.id === id) ?? null;

export const findRoleByName = async (name: string): Promise<FakeRole | null> =>
  db.roles.find((r) => r.name === name) ?? null;

export const createRole = async (params: { name: string; description: string }): Promise<FakeRole> => {
  if (db.roles.some((r) => r.name === params.name)) {
    throw new FakeUniqueViolation("duplicate role name");
  }
  const row: FakeRole = {
    id: randomUUID(),
    name: params.name,
    description: params.description,
    is_system: false,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };
  db.roles.push(row);
  return row;
};

export const updateRole = async (
  id: string,
  fields: { name?: string; description?: string },
): Promise<FakeRole | null> => {
  const row = db.roles.find((r) => r.id === id);
  if (!row) return null;

  if (fields.name !== undefined) {
    if (db.roles.some((r) => r.name === fields.name && r.id !== id)) {
      throw new FakeUniqueViolation("duplicate role name");
    }
    row.name = fields.name;
  }
  if (fields.description !== undefined) {
    row.description = fields.description;
  }
  row.updated_at = new Date();
  return row;
};

export const setRolePermissions = async (roleId: string, permissionIds: string[]): Promise<void> => {
  db.rolePermissions = db.rolePermissions.filter((rp) => rp.role_id !== roleId);
  for (const permissionId of permissionIds) {
    db.rolePermissions.push({ role_id: roleId, permission_id: permissionId });
  }
};

export const listPermissions = async (): Promise<FakePermission[]> =>
  [...db.permissions].sort((a, b) => (a.resource + a.action).localeCompare(b.resource + b.action));

export const findPermissionById = async (id: string): Promise<FakePermission | null> =>
  db.permissions.find((p) => p.id === id) ?? null;

export const listPermissionsByIds = async (ids: string[]): Promise<FakePermission[]> =>
  db.permissions.filter((p) => ids.includes(p.id));

export const listPermissionsForRole = async (roleId: string): Promise<FakePermission[]> => {
  const permissionIds = db.rolePermissions.filter((rp) => rp.role_id === roleId).map((rp) => rp.permission_id);
  return db.permissions.filter((p) => permissionIds.includes(p.id));
};

export const assignRoleToAdmin = async (adminUserId: string, roleId: string): Promise<void> => {
  if (!db.adminUserRoles.some((ar) => ar.admin_user_id === adminUserId && ar.role_id === roleId)) {
    db.adminUserRoles.push({ admin_user_id: adminUserId, role_id: roleId });
  }
};

export const removeRoleFromAdmin = async (adminUserId: string, roleId: string): Promise<boolean> => {
  const before = db.adminUserRoles.length;
  db.adminUserRoles = db.adminUserRoles.filter(
    (ar) => !(ar.admin_user_id === adminUserId && ar.role_id === roleId),
  );
  return db.adminUserRoles.length < before;
};

export const listRolesForAdmin = async (adminUserId: string): Promise<FakeRole[]> => {
  const roleIds = db.adminUserRoles.filter((ar) => ar.admin_user_id === adminUserId).map((ar) => ar.role_id);
  return db.roles.filter((r) => roleIds.includes(r.id)).sort((a, b) => a.name.localeCompare(b.name));
};

export const listPermissionKeysForAdmin = async (adminUserId: string): Promise<string[]> => {
  const activeRoleIds = new Set(db.roles.filter((r) => r.is_active).map((r) => r.id));
  const roleIds = db.adminUserRoles
    .filter((ar) => ar.admin_user_id === adminUserId && activeRoleIds.has(ar.role_id))
    .map((ar) => ar.role_id);
  const permissionIds = new Set(
    db.rolePermissions.filter((rp) => roleIds.includes(rp.role_id)).map((rp) => rp.permission_id),
  );
  return [...new Set(db.permissions.filter((p) => permissionIds.has(p.id)).map((p) => p.key))];
};

// Administration-only additions below, mirroring rbac.repository.ts.

export const listRolesAdministration = async (params: {
  limit: number;
  offset: number;
  search?: string;
  isActive?: boolean;
}): Promise<FakeRole[]> => {
  let results = [...db.roles];
  if (params.search) {
    const needle = params.search.toLowerCase();
    results = results.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle),
    );
  }
  if (params.isActive !== undefined) {
    results = results.filter((r) => r.is_active === params.isActive);
  }
  return results.sort((a, b) => a.name.localeCompare(b.name)).slice(params.offset, params.offset + params.limit);
};

export const setRoleActive = async (id: string, isActive: boolean): Promise<FakeRole | null> => {
  const row = db.roles.find((r) => r.id === id);
  if (!row) return null;
  row.is_active = isActive;
  row.updated_at = new Date();
  return row;
};

export const countAdminsForRole = async (roleId: string): Promise<number> =>
  db.adminUserRoles.filter((ar) => ar.role_id === roleId).length;

export const countActiveAdminsWithRole = async (roleId: string): Promise<number> => {
  const activeAdminIds = new Set(db.adminUsers.filter((a) => a.is_active).map((a) => a.id));
  return db.adminUserRoles.filter((ar) => ar.role_id === roleId && activeAdminIds.has(ar.admin_user_id)).length;
};

// Notifications-only additions below, mirroring rbac.repository.ts.

export const listActiveAdminIdsForRole = async (roleName: string): Promise<string[]> => {
  const role = db.roles.find((r) => r.name === roleName && r.is_active);
  if (!role) return [];
  const activeAdminIds = new Set(db.adminUsers.filter((a) => a.is_active).map((a) => a.id));
  return db.adminUserRoles
    .filter((ar) => ar.role_id === role.id && activeAdminIds.has(ar.admin_user_id))
    .map((ar) => ar.admin_user_id);
};

export const listActiveAdminIdsWithPermission = async (permissionKey: string): Promise<string[]> => {
  const permission = db.permissions.find((p) => p.key === permissionKey);
  if (!permission) return [];
  const activeRoleIds = new Set(db.roles.filter((r) => r.is_active).map((r) => r.id));
  const roleIdsWithPermission = new Set(
    db.rolePermissions.filter((rp) => rp.permission_id === permission.id && activeRoleIds.has(rp.role_id)).map((rp) => rp.role_id),
  );
  const activeAdminIds = new Set(db.adminUsers.filter((a) => a.is_active).map((a) => a.id));
  const matchingAdminIds = new Set(
    db.adminUserRoles
      .filter((ar) => roleIdsWithPermission.has(ar.role_id) && activeAdminIds.has(ar.admin_user_id))
      .map((ar) => ar.admin_user_id),
  );
  return [...matchingAdminIds];
};
