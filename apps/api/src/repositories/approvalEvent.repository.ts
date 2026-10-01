import { pool } from "../infrastructure/database/pool.js";

export type ApprovalEventRow = {
  id: string;
  approval_id: string;
  actor_admin_id: string | null;
  event_type: string;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export const insertApprovalEvent = async (params: {
  approvalId: string;
  actorAdminId: string | null;
  eventType: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ApprovalEventRow> => {
  const { rows } = await pool.query<ApprovalEventRow>(
    `INSERT INTO approval_events (approval_id, actor_admin_id, event_type, note, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.approvalId,
      params.actorAdminId,
      params.eventType,
      params.note ?? null,
      JSON.stringify(params.metadata ?? {}),
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("insertApprovalEvent: insert returned no row");
  return row;
};

export const listApprovalEvents = async (approvalId: string): Promise<ApprovalEventRow[]> => {
  const { rows } = await pool.query<ApprovalEventRow>(
    "SELECT * FROM approval_events WHERE approval_id = $1 ORDER BY created_at ASC",
    [approvalId],
  );
  return rows;
};
