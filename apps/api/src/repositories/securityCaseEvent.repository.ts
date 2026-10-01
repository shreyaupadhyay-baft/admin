import { pool } from "../infrastructure/database/pool.js";

export type SecurityCaseEventRow = {
  id: string;
  security_case_id: string;
  actor_admin_id: string | null;
  event_type: string;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export const insertSecurityCaseEvent = async (params: {
  securityCaseId: string;
  actorAdminId: string | null;
  eventType: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<SecurityCaseEventRow> => {
  const { rows } = await pool.query<SecurityCaseEventRow>(
    `INSERT INTO security_case_events (security_case_id, actor_admin_id, event_type, note, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.securityCaseId,
      params.actorAdminId,
      params.eventType,
      params.note ?? null,
      JSON.stringify(params.metadata ?? {}),
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("insertSecurityCaseEvent: insert returned no row");
  return row;
};

export const listSecurityCaseEvents = async (securityCaseId: string): Promise<SecurityCaseEventRow[]> => {
  const { rows } = await pool.query<SecurityCaseEventRow>(
    "SELECT * FROM security_case_events WHERE security_case_id = $1 ORDER BY created_at ASC",
    [securityCaseId],
  );
  return rows;
};
