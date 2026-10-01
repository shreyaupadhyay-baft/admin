import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeRiskCaseDecision } from "./store.js";

export const insertRiskCaseDecision = async (params: {
  caseId: string;
  decision: string;
  reason: string;
  createdBy: string;
}): Promise<FakeRiskCaseDecision> => {
  const row: FakeRiskCaseDecision = {
    id: randomUUID(),
    case_id: params.caseId,
    decision: params.decision,
    reason: params.reason,
    created_by: params.createdBy,
    created_at: new Date(),
  };
  db.riskCaseDecisions.push(row);
  return { ...row };
};

export const listRiskCaseDecisions = async (caseId: string): Promise<FakeRiskCaseDecision[]> =>
  db.riskCaseDecisions
    .filter((d) => d.case_id === caseId)
    .map((d) => ({ ...d }))
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
