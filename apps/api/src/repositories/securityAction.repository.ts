import { pool } from "../infrastructure/database/pool.js";

export type SecurityActionRow = {
  id: string;
  user_id: string;
  action_type: string;
  status: string;
  reason: string;
  requested_by: string;
  approved_by: string | null;
  requested_at: Date;
  approved_at: Date | null;
  executed_at: Date | null;
  rejected_at: Date | null;
  metadata: Record<string, unknown>;
};

export const listSecurityActions = async (params: {
  limit: number;
  offset: number;
  status?: string;
  actionType?: string;
  userId?: string;
}): Promise<SecurityActionRow[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) conditions.push(`status = $${values.push(params.status)}`);
  if (params.actionType) conditions.push(`action_type = $${values.push(params.actionType)}`);
  if (params.userId) conditions.push(`user_id = $${values.push(params.userId)}`);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<SecurityActionRow>(
    `SELECT * FROM security_actions ${whereClause} ORDER BY requested_at DESC, id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

export const findSecurityActionById = async (id: string): Promise<SecurityActionRow | null> => {
  const { rows } = await pool.query<SecurityActionRow>("SELECT * FROM security_actions WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const createRequestedSecurityAction = async (params: {
  userId: string;
  actionType: string;
  reason: string;
  requestedBy: string;
}): Promise<SecurityActionRow> => {
  const { rows } = await pool.query<SecurityActionRow>(
    `INSERT INTO security_actions (user_id, action_type, status, reason, requested_by)
     VALUES ($1, $2, 'requested', $3, $4)
     RETURNING *`,
    [params.userId, params.actionType, params.reason, params.requestedBy],
  );
  const row = rows[0];
  if (!row) throw new Error("createRequestedSecurityAction: insert returned no row");
  return row;
};

// force_logout/revoke_sessions carry no approval step — they're recorded as
// already executed by their own requester.
export const createExecutedSecurityAction = async (params: {
  userId: string;
  actionType: string;
  reason: string;
  requestedBy: string;
}): Promise<SecurityActionRow> => {
  const { rows } = await pool.query<SecurityActionRow>(
    `INSERT INTO security_actions (user_id, action_type, status, reason, requested_by, executed_at)
     VALUES ($1, $2, 'executed', $3, $4, NOW())
     RETURNING *`,
    [params.userId, params.actionType, params.reason, params.requestedBy],
  );
  const row = rows[0];
  if (!row) throw new Error("createExecutedSecurityAction: insert returned no row");
  return row;
};

// Approval and execution happen atomically in one call — this schema has no
// separate manual "execute" step for block/unblock.
export const approveAndExecuteSecurityAction = async (
  id: string,
  approvedBy: string,
): Promise<SecurityActionRow | null> => {
  const { rows } = await pool.query<SecurityActionRow>(
    `UPDATE security_actions
     SET status = 'executed', approved_by = $2, approved_at = NOW(), executed_at = NOW()
     WHERE id = $1 AND status = 'requested'
     RETURNING *`,
    [id, approvedBy],
  );
  return rows[0] ?? null;
};

export const rejectSecurityAction = async (id: string): Promise<SecurityActionRow | null> => {
  const { rows } = await pool.query<SecurityActionRow>(
    `UPDATE security_actions
     SET status = 'rejected', rejected_at = NOW()
     WHERE id = $1 AND status = 'requested'
     RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
};

export const countPendingSecurityActions = async (): Promise<number> => {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM security_actions WHERE status = 'requested'",
  );
  return Number(rows[0]?.count ?? 0);
};
