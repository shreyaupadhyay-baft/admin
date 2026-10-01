import { pool } from "../infrastructure/database/pool.js";

// Minimal BAFT-owned session marker for end-user devices — see
// 014_security.sql for why this exists (this Admin backend has no end-user
// login API of its own). Never touches a Transcorp/provider-side session.
export type UserSessionRow = {
  id: string;
  user_id: string;
  device_id: string | null;
  status: string;
  created_at: Date;
  revoked_at: Date | null;
};

export const createUserSession = async (params: {
  userId: string;
  deviceId?: string | null;
}): Promise<UserSessionRow> => {
  const { rows } = await pool.query<UserSessionRow>(
    `INSERT INTO user_sessions (user_id, device_id) VALUES ($1, $2) RETURNING *`,
    [params.userId, params.deviceId ?? null],
  );
  const row = rows[0];
  if (!row) throw new Error("createUserSession: insert returned no row");
  return row;
};

export const listActiveUserSessions = async (userId: string): Promise<UserSessionRow[]> => {
  const { rows } = await pool.query<UserSessionRow>(
    "SELECT * FROM user_sessions WHERE user_id = $1 AND status = 'active'",
    [userId],
  );
  return rows;
};

export const revokeAllActiveUserSessions = async (userId: string): Promise<UserSessionRow[]> => {
  const { rows } = await pool.query<UserSessionRow>(
    `UPDATE user_sessions SET status = 'revoked', revoked_at = NOW()
     WHERE user_id = $1 AND status = 'active'
     RETURNING *`,
    [userId],
  );
  return rows;
};
