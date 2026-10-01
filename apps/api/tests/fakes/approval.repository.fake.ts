import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeApproval } from "./store.js";

const clone = (row: FakeApproval): FakeApproval => ({ ...row });

let approvalSequence = 0;
const nextApprovalNumber = (): string => {
  approvalSequence += 1;
  return `APR-${String(approvalSequence).padStart(6, "0")}`;
};

export const listApprovals = async (params: {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
  actionType?: string;
  resourceType?: string;
  requestedBy?: string;
  approverAdminId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sort?: "newest" | "oldest";
}): Promise<FakeApproval[]> => {
  let results = db.approvals.map(clone);

  if (params.status) results = results.filter((a) => a.status === params.status);
  if (params.actionType) results = results.filter((a) => a.action_type === params.actionType);
  if (params.resourceType) results = results.filter((a) => a.resource_type === params.resourceType);
  if (params.requestedBy) results = results.filter((a) => a.requested_by === params.requestedBy);
  if (params.approverAdminId) results = results.filter((a) => a.approver_admin_id === params.approverAdminId);
  if (params.dateFrom) results = results.filter((a) => a.requested_at >= params.dateFrom!);
  if (params.dateTo) results = results.filter((a) => a.requested_at <= params.dateTo!);
  if (params.search) {
    const needle = params.search.toLowerCase();
    results = results.filter(
      (a) =>
        a.approval_number.toLowerCase().includes(needle) ||
        a.reason.toLowerCase().includes(needle) ||
        a.resource_id.toLowerCase().includes(needle),
    );
  }

  const direction = params.sort === "oldest" ? 1 : -1;
  results.sort((a, b) => direction * (a.requested_at.getTime() - b.requested_at.getTime()));

  return results.slice(params.offset, params.offset + params.limit);
};

export const findApprovalById = async (id: string): Promise<FakeApproval | null> => {
  const row = db.approvals.find((a) => a.id === id);
  return row ? clone(row) : null;
};

export const findApprovalByIdempotencyKey = async (key: string): Promise<FakeApproval | null> => {
  const row = db.approvals.find((a) => a.idempotency_key === key);
  return row ? clone(row) : null;
};

export const createApproval = async (params: {
  actionType: string;
  resourceType: string;
  resourceId: string;
  requestedBy: string;
  reason: string;
  metadata: Record<string, unknown>;
  idempotencyKey?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
}): Promise<FakeApproval> => {
  const now = new Date();
  const row: FakeApproval = {
    id: randomUUID(),
    approval_number: nextApprovalNumber(),
    action_type: params.actionType,
    resource_type: params.resourceType,
    resource_id: params.resourceId,
    requested_by: params.requestedBy,
    approver_admin_id: null,
    status: "requested",
    reason: params.reason,
    rejection_reason: null,
    request_metadata: params.metadata,
    execution_status: null,
    execution_result: null,
    idempotency_key: params.idempotencyKey ?? null,
    request_id: params.requestId ?? null,
    correlation_id: params.correlationId ?? null,
    requested_at: now,
    updated_at: now,
    approved_at: null,
    rejected_at: null,
    cancelled_at: null,
    expired_at: null,
    executed_at: null,
  };
  db.approvals.push(row);
  return clone(row);
};

// Mirrors the production `UPDATE ... WHERE status = 'requested'` atomicity:
// only a row currently in `requested` transitions, so a concurrent second
// caller (or a caller acting on an already-decided approval) gets `null`.

export const transitionApprovalToApproved = async (id: string, approverAdminId: string): Promise<FakeApproval | null> => {
  const row = db.approvals.find((a) => a.id === id && a.status === "requested");
  if (!row) return null;
  row.status = "approved";
  row.approver_admin_id = approverAdminId;
  row.approved_at = new Date();
  row.updated_at = new Date();
  return clone(row);
};

export const transitionApprovalToRejected = async (
  id: string,
  approverAdminId: string,
  rejectionReason: string,
): Promise<FakeApproval | null> => {
  const row = db.approvals.find((a) => a.id === id && a.status === "requested");
  if (!row) return null;
  row.status = "rejected";
  row.approver_admin_id = approverAdminId;
  row.rejection_reason = rejectionReason;
  row.rejected_at = new Date();
  row.updated_at = new Date();
  return clone(row);
};

export const transitionApprovalToCancelled = async (id: string): Promise<FakeApproval | null> => {
  const row = db.approvals.find((a) => a.id === id && a.status === "requested");
  if (!row) return null;
  row.status = "cancelled";
  row.cancelled_at = new Date();
  row.updated_at = new Date();
  return clone(row);
};

export const recordApprovalExecutionResult = async (
  id: string,
  params: { status: "executed" | "failed"; result: Record<string, unknown> },
): Promise<FakeApproval | null> => {
  const row = db.approvals.find((a) => a.id === id);
  if (!row) return null;
  row.execution_status = params.status;
  row.execution_result = params.result;
  if (params.status === "executed") row.executed_at = new Date();
  row.updated_at = new Date();
  return clone(row);
};
