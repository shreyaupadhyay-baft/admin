import { pool } from "../infrastructure/database/pool.js";

export type UserRow = {
  id: string;
  external_ref: string | null;
  email: string;
  phone_number: string | null;
  full_name: string;
  status: string;
  // BAFT-side security status (normal/blocked). Independent of `status`
  // above — only the security action maker-checker workflow may change it,
  // never the general users.update/status endpoints.
  security_status: string;
  created_at: Date;
  updated_at: Date;
};

export const listUsers = async (params: {
  limit: number;
  offset: number;
  status?: string;
  search?: string;
}): Promise<UserRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) {
    conditions.push(`status = $${values.push(params.status)}`);
  }
  if (params.search) {
    const likeIndex = values.push(`%${params.search.toLowerCase()}%`);
    conditions.push(
      `(LOWER(full_name) LIKE $${likeIndex} OR LOWER(email) LIKE $${likeIndex} OR phone_number LIKE $${likeIndex})`,
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<UserRow>(
    `SELECT * FROM users ${whereClause} ORDER BY created_at DESC, id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const findUserById = async (id: string): Promise<UserRow | null> => {
  const { rows } = await pool.query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const findUserByEmail = async (email: string): Promise<UserRow | null> => {
  const { rows } = await pool.query<UserRow>("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  return rows[0] ?? null;
};

export const createUser = async (params: {
  email: string;
  phoneNumber?: string | null;
  fullName: string;
  externalRef?: string | null;
}): Promise<UserRow> => {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (email, phone_number, full_name, external_ref)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.email.toLowerCase(), params.phoneNumber ?? null, params.fullName, params.externalRef ?? null],
  );
  const row = rows[0];
  if (!row) throw new Error("createUser: insert returned no row");
  return row;
};

export const updateUserProfile = async (
  id: string,
  fields: { email?: string; phoneNumber?: string; fullName?: string },
): Promise<UserRow | null> => {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users
     SET email = COALESCE($2, email),
         phone_number = COALESCE($3, phone_number),
         full_name = COALESCE($4, full_name),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, fields.email?.toLowerCase() ?? null, fields.phoneNumber ?? null, fields.fullName ?? null],
  );
  return rows[0] ?? null;
};

export const updateUserStatus = async (id: string, status: string): Promise<UserRow | null> => {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
};

// Only the security action workflow (security.controller.ts) calls this.
export const updateUserSecurityStatus = async (id: string, securityStatus: string): Promise<UserRow | null> => {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET security_status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, securityStatus],
  );
  return rows[0] ?? null;
};

export const countUsersBySecurityStatus = async (securityStatus: string): Promise<number> => {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM users WHERE security_status = $1",
    [securityStatus],
  );
  return Number(rows[0]?.count ?? 0);
};
