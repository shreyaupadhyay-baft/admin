import { apiGet, apiPost } from "./client.js";

export type ApprovalStatus = "requested" | "approved" | "rejected" | "cancelled" | "expired";

export type Approval = {
  id: string;
  approvalNumber: string;
  actionType: string;
  resourceType: string;
  resourceId: string;
  requestedBy: string;
  approverAdminId: string | null;
  status: ApprovalStatus;
  reason: string;
  rejectionReason: string | null;
  requestMetadata: Record<string, unknown>;
  executionStatus: "executed" | "failed" | null;
  executionResult: Record<string, unknown> | null;
  requestedAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  executedAt: string | null;
};

export type ApprovalEvent = {
  id: string;
  actorAdminId: string | null;
  eventType: string;
  note: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export const fetchApprovals = async (params: {
  limit?: number;
  offset?: number;
  search?: string;
  status?: ApprovalStatus;
  actionType?: string;
  resourceType?: string;
  requestedBy?: string;
  approverAdminId?: string;
  sort?: "newest" | "oldest";
}): Promise<{ approvals: Approval[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.actionType) query.set("actionType", params.actionType);
  if (params.resourceType) query.set("resourceType", params.resourceType);
  if (params.requestedBy) query.set("requestedBy", params.requestedBy);
  if (params.approverAdminId) query.set("approverAdminId", params.approverAdminId);
  if (params.sort) query.set("sort", params.sort);

  const res = await apiGet<{ approvals: Approval[] }>(`/api/v1/approvals?${query.toString()}`);
  return {
    approvals: res.data.approvals,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const fetchApproval = async (id: string): Promise<Approval> => {
  const res = await apiGet<{ approval: Approval }>(`/api/v1/approvals/${id}`);
  return res.data.approval;
};

export const fetchApprovalEvents = async (id: string): Promise<ApprovalEvent[]> => {
  const res = await apiGet<{ events: ApprovalEvent[] }>(`/api/v1/approvals/${id}/events`);
  return res.data.events;
};

export const createApproval = async (payload: {
  actionType: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<Approval> => {
  const res = await apiPost<{ approval: Approval }>("/api/v1/approvals", payload);
  return res.data.approval;
};

export const approveApproval = async (id: string): Promise<Approval> => {
  const res = await apiPost<{ approval: Approval }>(`/api/v1/approvals/${id}/approve`);
  return res.data.approval;
};

export const rejectApproval = async (id: string, reason: string): Promise<Approval> => {
  const res = await apiPost<{ approval: Approval }>(`/api/v1/approvals/${id}/reject`, { reason });
  return res.data.approval;
};

export const cancelApproval = async (id: string): Promise<Approval> => {
  const res = await apiPost<{ approval: Approval }>(`/api/v1/approvals/${id}/cancel`);
  return res.data.approval;
};
