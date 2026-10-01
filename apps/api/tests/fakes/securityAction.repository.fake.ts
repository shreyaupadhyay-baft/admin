import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeSecurityAction } from "./store.js";

const clone = (row: FakeSecurityAction): FakeSecurityAction => ({ ...row });

export const listSecurityActions = async (params: {
  limit: number;
  offset: number;
  status?: string;
  actionType?: string;
  userId?: string;
}): Promise<FakeSecurityAction[]> => {
  let results = db.securityActions.map(clone);

  if (params.status) results = results.filter((a) => a.status === params.status);
  if (params.actionType) results = results.filter((a) => a.action_type === params.actionType);
  if (params.userId) results = results.filter((a) => a.user_id === params.userId);

  return results
    .sort((a, b) => b.requested_at.getTime() - a.requested_at.getTime())
    .slice(params.offset, params.offset + params.limit);
};

export const findSecurityActionById = async (id: string): Promise<FakeSecurityAction | null> => {
  const row = db.securityActions.find((a) => a.id === id);
  return row ? clone(row) : null;
};

export const createRequestedSecurityAction = async (params: {
  userId: string;
  actionType: string;
  reason: string;
  requestedBy: string;
}): Promise<FakeSecurityAction> => {
  const row: FakeSecurityAction = {
    id: randomUUID(),
    user_id: params.userId,
    action_type: params.actionType,
    status: "requested",
    reason: params.reason,
    requested_by: params.requestedBy,
    approved_by: null,
    requested_at: new Date(),
    approved_at: null,
    executed_at: null,
    rejected_at: null,
    metadata: {},
  };
  db.securityActions.push(row);
  return clone(row);
};

export const createExecutedSecurityAction = async (params: {
  userId: string;
  actionType: string;
  reason: string;
  requestedBy: string;
}): Promise<FakeSecurityAction> => {
  const now = new Date();
  const row: FakeSecurityAction = {
    id: randomUUID(),
    user_id: params.userId,
    action_type: params.actionType,
    status: "executed",
    reason: params.reason,
    requested_by: params.requestedBy,
    approved_by: null,
    requested_at: now,
    approved_at: null,
    executed_at: now,
    rejected_at: null,
    metadata: {},
  };
  db.securityActions.push(row);
  return clone(row);
};

export const approveAndExecuteSecurityAction = async (
  id: string,
  approvedBy: string,
): Promise<FakeSecurityAction | null> => {
  const row = db.securityActions.find((a) => a.id === id && a.status === "requested");
  if (!row) return null;
  // Mirrors the DB CHECK constraint (security_actions_requester_not_approver)
  // as a second line of defense, same as production.
  if (row.requested_by === approvedBy) return null;
  row.status = "executed";
  row.approved_by = approvedBy;
  row.approved_at = new Date();
  row.executed_at = new Date();
  return clone(row);
};

export const rejectSecurityAction = async (id: string): Promise<FakeSecurityAction | null> => {
  const row = db.securityActions.find((a) => a.id === id && a.status === "requested");
  if (!row) return null;
  row.status = "rejected";
  row.rejected_at = new Date();
  return clone(row);
};

export const countPendingSecurityActions = async (): Promise<number> =>
  db.securityActions.filter((a) => a.status === "requested").length;
