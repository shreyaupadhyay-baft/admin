import { pool } from "../infrastructure/database/pool.js";

export type SupportCaseEventRow = {
  id: string;
  support_case_id: string;
  actor_admin_id: string | null;
  event_type: string;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export const insertSupportCaseEvent = async (params: {
  supportCaseId: string;
  actorAdminId: string | null;
  eventType: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<SupportCaseEventRow> => {
  const { rows } = await pool.query<SupportCaseEventRow>(
    `INSERT INTO support_case_events (support_case_id, actor_admin_id, event_type, note, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.supportCaseId,
      params.actorAdminId,
      params.eventType,
      params.note ?? null,
      JSON.stringify(params.metadata ?? {}),
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("insertSupportCaseEvent: insert returned no row");
  return row;
};

export const listSupportCaseEvents = async (supportCaseId: string): Promise<SupportCaseEventRow[]> => {
  const { rows } = await pool.query<SupportCaseEventRow>(
    "SELECT * FROM support_case_events WHERE support_case_id = $1 ORDER BY created_at ASC",
    [supportCaseId],
  );
  return rows;
};
