import { pool } from "../infrastructure/database/pool.js";

export type AdminSessionRow = {
  id: string;
  admin_user_id: string;
  access_token_hash: string;
  refresh_token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  access_expires_at: Date;
  refresh_expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
};

export const createSession = async (params: {
  adminUserId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}): Promise<AdminSessionRow> => {
  const { rows } = await pool.query<AdminSessionRow>(
    `INSERT INTO admin_sessions
       (admin_user_id, access_token_hash, refresh_token_hash, access_expires_at, refresh_expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.adminUserId,
      params.accessTokenHash,
      params.refreshTokenHash,
      params.accessExpiresAt,
      params.refreshExpiresAt,
      params.userAgent,
      params.ipAddress,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("createSession: insert returned no row");
  return row;
};

export const findActiveSessionByAccessTokenHash = async (hash: string): Promise<AdminSessionRow | null> => {
  const { rows } = await pool.query<AdminSessionRow>(
    `SELECT * FROM admin_sessions
     WHERE access_token_hash = $1 AND revoked_at IS NULL AND access_expires_at > NOW()`,
    [hash],
  );
  return rows[0] ?? null;
};

export const findActiveSessionByRefreshTokenHash = async (hash: string): Promise<AdminSessionRow | null> => {
  const { rows } = await pool.query<AdminSessionRow>(
    `SELECT * FROM admin_sessions
     WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND refresh_expires_at > NOW()`,
    [hash],
  );
  return rows[0] ?? null;
};

export const rotateSession = async (params: {
  sessionId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
}): Promise<AdminSessionRow | null> => {
  const { rows } = await pool.query<AdminSessionRow>(
    `UPDATE admin_sessions
     SET access_token_hash = $2, refresh_token_hash = $3, access_expires_at = $4
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING *`,
    [params.sessionId, params.accessTokenHash, params.refreshTokenHash, params.accessExpiresAt],
  );
  return rows[0] ?? null;
};

export const revokeSession = async (sessionId: string): Promise<void> => {
  await pool.query("UPDATE admin_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL", [
    sessionId,
  ]);
};

export const revokeAllSessionsForAdmin = async (adminUserId: string): Promise<void> => {
  await pool.query(
    "UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_user_id = $1 AND revoked_at IS NULL",
    [adminUserId],
  );
};

// Administration-only additions below — safe session *metadata* only (never
// access_token_hash/refresh_token_hash are serialized by any controller).

export const listSessionsForAdmin = async (
  adminUserId: string,
  limit: number,
  offset: number,
): Promise<AdminSessionRow[]> => {
  const { rows } = await pool.query<AdminSessionRow>(
    `SELECT * FROM admin_sessions WHERE admin_user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [adminUserId, limit, offset],
  );
  return rows;
};

/** "Last login" is derived from here rather than stored on admin_users — no login timestamp column exists (or is needed). */
export const findLatestSessionForAdmin = async (adminUserId: string): Promise<AdminSessionRow | null> => {
  const { rows } = await pool.query<AdminSessionRow>(
    "SELECT * FROM admin_sessions WHERE admin_user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [adminUserId],
  );
  return rows[0] ?? null;
};

export const countActiveSessionsForAdmin = async (adminUserId: string): Promise<number> => {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM admin_sessions
     WHERE admin_user_id = $1 AND revoked_at IS NULL AND refresh_expires_at > NOW()`,
    [adminUserId],
  );
  return Number(rows[0]?.count ?? 0);
};
