import { pool } from "../infrastructure/database/pool.js";

export type RiskCaseEventRow = {
  id: string;
  risk_case_id: string;
  actor_admin_id: string | null;
  event_type: string;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export const insertRiskCaseEvent = async (params: {
  riskCaseId: string;
  actorAdminId: string | null;
  eventType: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RiskCaseEventRow> => {
  const { rows } = await pool.query<RiskCaseEventRow>(
    `INSERT INTO risk_case_events (risk_case_id, actor_admin_id, event_type, note, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.riskCaseId,
      params.actorAdminId,
      params.eventType,
      params.note ?? null,
      JSON.stringify(params.metadata ?? {}),
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("insertRiskCaseEvent: insert returned no row");
  return row;
};

export const listRiskCaseEvents = async (riskCaseId: string): Promise<RiskCaseEventRow[]> => {
  const { rows } = await pool.query<RiskCaseEventRow>(
    "SELECT * FROM risk_case_events WHERE risk_case_id = $1 ORDER BY created_at ASC",
    [riskCaseId],
  );
  return rows;
};
