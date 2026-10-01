import { pool } from "../infrastructure/database/pool.js";

export type AdminUserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export const findAdminUserByEmail = async (email: string): Promise<AdminUserRow | null> => {
  const { rows } = await pool.query<AdminUserRow>(
    "SELECT * FROM admin_users WHERE email = $1",
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
};

export const findAdminUserById = async (id: string): Promise<AdminUserRow | null> => {
  const { rows } = await pool.query<AdminUserRow>("SELECT * FROM admin_users WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const listAdminUsers = async (limit: number, offset: number): Promise<AdminUserRow[]> => {
  const { rows } = await pool.query<AdminUserRow>(
    "SELECT * FROM admin_users ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    [limit, offset],
  );
  return rows;
};

export const createAdminUser = async (params: {
  email: string;
  passwordHash: string;
  fullName: string;
}): Promise<AdminUserRow> => {
  const { rows } = await pool.query<AdminUserRow>(
    `INSERT INTO admin_users (email, password_hash, full_name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [params.email.toLowerCase(), params.passwordHash, params.fullName],
  );
  const row = rows[0];
  if (!row) throw new Error("createAdminUser: insert returned no row");
  return row;
};

export const updateAdminUser = async (
  id: string,
  fields: { fullName?: string; email?: string },
): Promise<AdminUserRow | null> => {
  const { rows } = await pool.query<AdminUserRow>(
    `UPDATE admin_users
     SET full_name = COALESCE($2, full_name),
         email = COALESCE($3, email),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, fields.fullName ?? null, fields.email?.toLowerCase() ?? null],
  );
  return rows[0] ?? null;
};

export const setAdminUserActive = async (id: string, isActive: boolean): Promise<AdminUserRow | null> => {
  const { rows } = await pool.query<AdminUserRow>(
    `UPDATE admin_users SET is_active = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, isActive],
  );
  return rows[0] ?? null;
};

// Administration-only: paginated/searchable/sortable listing with role
// filtering. The original listAdminUsers() above is unchanged and keeps
// backing the Phase 1 /api/v1/admins endpoint.
const ADMIN_SORT_COLUMNS = {
  created_at_desc: "created_at DESC, id DESC",
  created_at_asc: "created_at ASC, id ASC",
  full_name_asc: "full_name ASC, id ASC",
  full_name_desc: "full_name DESC, id DESC",
  email_asc: "email ASC, id ASC",
  email_desc: "email DESC, id DESC",
} as const;

export type AdminSort = keyof typeof ADMIN_SORT_COLUMNS;

export const listAdminUsersAdministration = async (params: {
  limit: number;
  offset: number;
  search?: string;
  isActive?: boolean;
  roleId?: string;
  sort: AdminSort;
}): Promise<AdminUserRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const joins: string[] = [];

  if (params.roleId) {
    joins.push("JOIN admin_user_roles aur ON aur.admin_user_id = admin_users.id");
    conditions.push(`aur.role_id = $${values.push(params.roleId)}`);
  }
  if (params.search) {
    const likeIndex = values.push(`%${params.search.toLowerCase()}%`);
    conditions.push(`(LOWER(full_name) LIKE $${likeIndex} OR LOWER(email) LIKE $${likeIndex})`);
  }
  if (params.isActive !== undefined) {
    conditions.push(`is_active = $${values.push(params.isActive)}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);
  // `sort` is a TS-narrowed key into ADMIN_SORT_COLUMNS, never raw user input.
  const orderByClause = ADMIN_SORT_COLUMNS[params.sort];

  const { rows } = await pool.query<AdminUserRow>(
    `SELECT DISTINCT admin_users.* FROM admin_users ${joins.join(" ")}
     ${whereClause}
     ORDER BY ${orderByClause}
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};
