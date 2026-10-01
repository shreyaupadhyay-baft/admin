import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeApprovalEvent } from "./store.js";

const clone = (row: FakeApprovalEvent): FakeApprovalEvent => ({ ...row });

export const insertApprovalEvent = async (params: {
  approvalId: string;
  actorAdminId: string | null;
  eventType: string;
  note?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<FakeApprovalEvent> => {
  const row: FakeApprovalEvent = {
    id: randomUUID(),
    approval_id: params.approvalId,
    actor_admin_id: params.actorAdminId,
    event_type: params.eventType,
    note: params.note ?? null,
    metadata: params.metadata ?? {},
    created_at: new Date(),
  };
  db.approvalEvents.push(row);
  return clone(row);
};

export const listApprovalEvents = async (approvalId: string): Promise<FakeApprovalEvent[]> =>
  db.approvalEvents
    .filter((e) => e.approval_id === approvalId)
    .map(clone)
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
