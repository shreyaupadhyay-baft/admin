import { pool } from "../infrastructure/database/pool.js";

export type SecurityCaseEvidenceRow = {
  id: string;
  case_id: string;
  evidence_type: string;
  source: string;
  external_reference: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: Date;
};

export const insertSecurityCaseEvidence = async (params: {
  caseId: string;
  evidenceType: string;
  source: string;
  externalReference?: string;
  description: string;
  metadata: Record<string, unknown>;
  createdBy: string;
}): Promise<SecurityCaseEvidenceRow> => {
  const { rows } = await pool.query<SecurityCaseEvidenceRow>(
    `INSERT INTO security_case_evidence (case_id, evidence_type, source, external_reference, description, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.caseId,
      params.evidenceType,
      params.source,
      params.externalReference ?? null,
      params.description,
      JSON.stringify(params.metadata),
      params.createdBy,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("insertSecurityCaseEvidence: insert returned no row");
  return row;
};

export const listSecurityCaseEvidence = async (caseId: string): Promise<SecurityCaseEvidenceRow[]> => {
  const { rows } = await pool.query<SecurityCaseEvidenceRow>(
    "SELECT * FROM security_case_evidence WHERE case_id = $1 ORDER BY created_at ASC",
    [caseId],
  );
  return rows;
};
