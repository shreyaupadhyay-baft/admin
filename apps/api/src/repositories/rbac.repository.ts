import { pool } from "../infrastructure/database/pool.js";

export type RoleRow = {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type PermissionRow = {
  id: string;
  resource: string;
  action: string;
  key: string;
  description: string;
  created_at: Date;
};

export const listRoles = async (): Promise<RoleRow[]> => {
  const { rows } = await pool.query<RoleRow>("SELECT * FROM roles ORDER BY name ASC");
  return rows;
};

export const findRoleById = async (id: string): Promise<RoleRow | null> => {
  const { rows } = await pool.query<RoleRow>("SELECT * FROM roles WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const findRoleByName = async (name: string): Promise<RoleRow | null> => {
  const { rows } = await pool.query<RoleRow>("SELECT * FROM roles WHERE name = $1", [name]);
  return rows[0] ?? null;
};

export const createRole = async (params: { name: string; description: string }): Promise<RoleRow> => {
  const { rows } = await pool.query<RoleRow>(
    `INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING *`,
    [params.name, params.description],
  );
  const row = rows[0];
  if (!row) throw new Error("createRole: insert returned no row");
  return row;
};

export const updateRole = async (
  id: string,
  fields: { name?: string; description?: string },
): Promise<RoleRow | null> => {
  const { rows } = await pool.query<RoleRow>(
    `UPDATE roles
     SET name = COALESCE($2, name),
         description = COALESCE($3, description),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, fields.name ?? null, fields.description ?? null],
  );
  return rows[0] ?? null;
};

export const setRolePermissions = async (roleId: string, permissionIds: string[]): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM role_permissions WHERE role_id = $1", [roleId]);
    if (permissionIds.length > 0) {
      const values = permissionIds.map((_, i) => `($1, $${i + 2})`).join(", ");
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ${values}`,
        [roleId, ...permissionIds],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

export const listPermissions = async (): Promise<PermissionRow[]> => {
  const { rows } = await pool.query<PermissionRow>(
    "SELECT * FROM permissions ORDER BY resource ASC, action ASC",
  );
  return rows;
};

export const findPermissionById = async (id: string): Promise<PermissionRow | null> => {
  const { rows } = await pool.query<PermissionRow>("SELECT * FROM permissions WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const listPermissionsForRole = async (roleId: string): Promise<PermissionRow[]> => {
  const { rows } = await pool.query<PermissionRow>(
    `SELECT p.* FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = $1
     ORDER BY p.resource ASC, p.action ASC`,
    [roleId],
  );
  return rows;
};

export const listPermissionsByIds = async (ids: string[]): Promise<PermissionRow[]> => {
  if (ids.length === 0) return [];
  const { rows } = await pool.query<PermissionRow>(
    "SELECT * FROM permissions WHERE id = ANY($1::uuid[])",
    [ids],
  );
  return rows;
};

export const assignRoleToAdmin = async (adminUserId: string, roleId: string): Promise<void> => {
  await pool.query(
    `INSERT INTO admin_user_roles (admin_user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [adminUserId, roleId],
  );
};

export const removeRoleFromAdmin = async (adminUserId: string, roleId: string): Promise<boolean> => {
  const result = await pool.query(
    "DELETE FROM admin_user_roles WHERE admin_user_id = $1 AND role_id = $2",
    [adminUserId, roleId],
  );
  return (result.rowCount ?? 0) > 0;
};

export const listRolesForAdmin = async (adminUserId: string): Promise<RoleRow[]> => {
  const { rows } = await pool.query<RoleRow>(
    `SELECT r.* FROM roles r
     JOIN admin_user_roles aur ON aur.role_id = r.id
     WHERE aur.admin_user_id = $1
     ORDER BY r.name ASC`,
    [adminUserId],
  );
  return rows;
};

export const listPermissionKeysForAdmin = async (adminUserId: string): Promise<string[]> => {
  const { rows } = await pool.query<{ key: string }>(
    `SELECT DISTINCT p.key FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN admin_user_roles aur ON aur.role_id = rp.role_id
     JOIN roles r ON r.id = rp.role_id
     WHERE aur.admin_user_id = $1 AND r.is_active = true`,
    [adminUserId],
  );
  return rows.map((r) => r.key);
};

// Administration-only additions below (role enable/disable, paginated/
// filterable listing, and the counts the privilege-escalation/last-Super-
// Admin protections need). The original listRoles()/listPermissionsForRole()
// above are unchanged and keep backing the Phase 1 /api/v1/roles endpoint.

export const listRolesAdministration = async (params: {
  limit: number;
  offset: number;
  search?: string;
  isActive?: boolean;
}): Promise<RoleRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.search) {
    const likeIndex = values.push(`%${params.search.toLowerCase()}%`);
    conditions.push(`(LOWER(name) LIKE $${likeIndex} OR LOWER(description) LIKE $${likeIndex})`);
  }
  if (params.isActive !== undefined) {
    conditions.push(`is_active = $${values.push(params.isActive)}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<RoleRow>(
    `SELECT * FROM roles ${whereClause} ORDER BY name ASC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const setRoleActive = async (id: string, isActive: boolean): Promise<RoleRow | null> => {
  const { rows } = await pool.query<RoleRow>(
    "UPDATE roles SET is_active = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
    [id, isActive],
  );
  return rows[0] ?? null;
};

/** Total admins with this role assigned, regardless of admin/role active status — for role detail display. */
export const countAdminsForRole = async (roleId: string): Promise<number> => {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM admin_user_roles WHERE role_id = $1",
    [roleId],
  );
  return Number(rows[0]?.count ?? 0);
};

/** Only *active* admins holding this role — what the last-Super-Admin protections must count. */
export const countActiveAdminsWithRole = async (roleId: string): Promise<number> => {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM admin_user_roles aur
     JOIN admin_users au ON au.id = aur.admin_user_id
     WHERE aur.role_id = $1 AND au.is_active = true`,
    [roleId],
  );
  return Number(rows[0]?.count ?? 0);
};

// Notifications-only additions below: recipient resolution for role-based
// and permission-based notification fan-out. Both exclude disabled admins by
// construction — a notification is resolved to a recipient *snapshot* at
// creation time (see notification.service.ts), never re-queried live on read.

/** Active admin ids holding this role, by name — for role-based notification recipients. */
export const listActiveAdminIdsForRole = async (roleName: string): Promise<string[]> => {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT au.id FROM admin_users au
     JOIN admin_user_roles aur ON aur.admin_user_id = au.id
     JOIN roles r ON r.id = aur.role_id
     WHERE r.name = $1 AND r.is_active = true AND au.is_active = true`,
    [roleName],
  );
  return rows.map((r) => r.id);
};

/** Active admin ids holding a given permission key through any active role — for permission-based notification recipients. */
export const listActiveAdminIdsWithPermission = async (permissionKey: string): Promise<string[]> => {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT DISTINCT au.id FROM admin_users au
     JOIN admin_user_roles aur ON aur.admin_user_id = au.id
     JOIN roles r ON r.id = aur.role_id
     JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key = $1 AND r.is_active = true AND au.is_active = true`,
    [permissionKey],
  );
  return rows.map((r) => r.id);
};
