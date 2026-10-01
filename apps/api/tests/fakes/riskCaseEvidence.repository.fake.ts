import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeRiskCaseEvidence } from "./store.js";

export const insertRiskCaseEvidence = async (params: {
  caseId: string;
  evidenceType: string;
  source: string;
  externalReference?: string;
  description: string;
  metadata: Record<string, unknown>;
  createdBy: string;
}): Promise<FakeRiskCaseEvidence> => {
  const row: FakeRiskCaseEvidence = {
    id: randomUUID(),
    case_id: params.caseId,
    evidence_type: params.evidenceType,
    source: params.source,
    external_reference: params.externalReference ?? null,
    description: params.description,
    metadata: params.metadata,
    created_by: params.createdBy,
    created_at: new Date(),
  };
  db.riskCaseEvidence.push(row);
  return { ...row };
};

export const listRiskCaseEvidence = async (caseId: string): Promise<FakeRiskCaseEvidence[]> =>
  db.riskCaseEvidence
    .filter((e) => e.case_id === caseId)
    .map((e) => ({ ...e }))
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
