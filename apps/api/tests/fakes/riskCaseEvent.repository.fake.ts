import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeRiskCaseEvent } from "./store.js";

export const insertRiskCaseEvent = async (params: {
  riskCaseId: string;
  actorAdminId: string | null;
  eventType: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<FakeRiskCaseEvent> => {
  const row: FakeRiskCaseEvent = {
    id: randomUUID(),
    risk_case_id: params.riskCaseId,
    actor_admin_id: params.actorAdminId,
    event_type: params.eventType,
    note: params.note ?? null,
    metadata: params.metadata ?? {},
    created_at: new Date(),
  };
  db.riskCaseEvents.push(row);
  return { ...row };
};

export const listRiskCaseEvents = async (riskCaseId: string): Promise<FakeRiskCaseEvent[]> =>
  db.riskCaseEvents
    .filter((e) => e.risk_case_id === riskCaseId)
    .map((e) => ({ ...e }))
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
