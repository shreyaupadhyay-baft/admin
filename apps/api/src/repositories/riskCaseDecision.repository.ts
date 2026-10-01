import { pool } from "../infrastructure/database/pool.js";

export type RiskCaseDecisionRow = {
  id: string;
  case_id: string;
  decision: string;
  reason: string;
  created_by: string;
  created_at: Date;
};

export const insertRiskCaseDecision = async (params: {
  caseId: string;
  decision: string;
  reason: string;
  createdBy: string;
}): Promise<RiskCaseDecisionRow> => {
  const { rows } = await pool.query<RiskCaseDecisionRow>(
    `INSERT INTO risk_case_decisions (case_id, decision, reason, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.caseId, params.decision, params.reason, params.createdBy],
  );
  const row = rows[0];
  if (!row) throw new Error("insertRiskCaseDecision: insert returned no row");
  return row;
};

export const listRiskCaseDecisions = async (caseId: string): Promise<RiskCaseDecisionRow[]> => {
  const { rows } = await pool.query<RiskCaseDecisionRow>(
    "SELECT * FROM risk_case_decisions WHERE case_id = $1 ORDER BY created_at ASC",
    [caseId],
  );
  return rows;
};
