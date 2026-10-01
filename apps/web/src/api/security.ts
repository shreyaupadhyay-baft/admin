import { apiGet, apiPatch, apiPost } from "./client.js";

export type SecurityCategory =
  | "authentication"
  | "account"
  | "device"
  | "access"
  | "session"
  | "api"
  | "integration"
  | "privacy"
  | "configuration"
  | "system";

export type SecuritySeverity = "low" | "medium" | "high" | "critical";
export type SecurityEventStatus = "new" | "acknowledged" | "dismissed" | "escalated";
export type SecurityCaseStatus = "open" | "triaged" | "investigating" | "resolved" | "closed";
export type SecurityActionType = "block_user" | "unblock_user" | "force_logout" | "revoke_sessions";
export type SecurityActionStatus = "requested" | "approved" | "rejected" | "executed";
export type SecurityEvidenceType =
  | "security_event"
  | "device_signal"
  | "authentication_event"
  | "configuration_event"
  | "system_signal"
  | "provider_signal"
  | "manual_note"
  | "external_reference";

export type SecurityEvent = {
  id: string;
  eventType: string;
  category: SecurityCategory;
  severity: SecuritySeverity;
  source: string;
  status: SecurityEventStatus;
  userId: string | null;
  deviceId: string | null;
  externalReference: string | null;
  description: string;
  metadata: Record<string, unknown>;
  detectedAt: string;
  createdAt: string;
};

export type SecurityCase = {
  id: string;
  caseNumber: string;
  title: string;
  category: SecurityCategory;
  severity: SecuritySeverity;
  status: SecurityCaseStatus;
  userId: string | null;
  deviceId: string | null;
  assignedAdminId: string | null;
  summary: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
};

export type SecurityCaseEvent = {
  id: string;
  actorAdminId: string | null;
  eventType: string;
  note: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SecurityCaseEvidence = {
  id: string;
  evidenceType: SecurityEvidenceType;
  source: string;
  externalReference: string | null;
  description: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
};

export type SecurityAction = {
  id: string;
  userId: string;
  actionType: SecurityActionType;
  status: SecurityActionStatus;
  reason: string;
  requestedBy: string;
  approvedBy: string | null;
  requestedAt: string;
  approvedAt: string | null;
  executedAt: string | null;
  rejectedAt: string | null;
};

export type SecurityPosture = {
  activeSecurityCases: number;
  criticalSecurityCases: number;
  highSeverityEvents: number;
  blockedUsers: number;
  pendingSecurityActions: number;
  recentSecurityEvents: Array<{ id: string; eventType: string; category: string; severity: string; detectedAt: string }>;
};

export const fetchSecurityEvents = async (params: {
  limit?: number;
  offset?: number;
  category?: SecurityCategory;
  severity?: SecuritySeverity;
  status?: SecurityEventStatus;
  source?: string;
  search?: string;
  detectedFrom?: string;
  detectedTo?: string;
}): Promise<{ events: SecurityEvent[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.category) query.set("category", params.category);
  if (params.severity) query.set("severity", params.severity);
  if (params.status) query.set("status", params.status);
  if (params.source) query.set("source", params.source);
  if (params.search) query.set("search", params.search);
  if (params.detectedFrom) query.set("detectedFrom", params.detectedFrom);
  if (params.detectedTo) query.set("detectedTo", params.detectedTo);

  const res = await apiGet<{ events: SecurityEvent[] }>(`/api/v1/security/events?${query.toString()}`);
  return {
    events: res.data.events,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const createSecurityEvent = async (payload: {
  eventType: string;
  category: SecurityCategory;
  severity?: SecuritySeverity;
  source: string;
  description: string;
}): Promise<SecurityEvent> => {
  const res = await apiPost<{ event: SecurityEvent }>("/api/v1/security/events", payload);
  return res.data.event;
};

export const updateSecurityEventStatus = async (
  id: string,
  status: SecurityEventStatus,
  reason?: string,
): Promise<SecurityEvent> => {
  const res = await apiPatch<{ event: SecurityEvent }>(`/api/v1/security/events/${id}/status`, { status, reason });
  return res.data.event;
};

export const fetchSecurityCases = async (params: {
  limit?: number;
  offset?: number;
  status?: SecurityCaseStatus;
  severity?: SecuritySeverity;
  category?: SecurityCategory;
  assignedAdminId?: string;
  search?: string;
}): Promise<{ cases: SecurityCase[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.status) query.set("status", params.status);
  if (params.severity) query.set("severity", params.severity);
  if (params.category) query.set("category", params.category);
  if (params.assignedAdminId) query.set("assignedAdminId", params.assignedAdminId);
  if (params.search) query.set("search", params.search);

  const res = await apiGet<{ cases: SecurityCase[] }>(`/api/v1/security/cases?${query.toString()}`);
  return {
    cases: res.data.cases,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const fetchSecurityCase = async (
  id: string,
): Promise<{ case: SecurityCase; events: SecurityCaseEvent[]; evidence: SecurityCaseEvidence[] }> => {
  const res = await apiGet<{ case: SecurityCase; events: SecurityCaseEvent[]; evidence: SecurityCaseEvidence[] }>(
    `/api/v1/security/cases/${id}`,
  );
  return res.data;
};

export const createSecurityCase = async (payload: {
  title: string;
  category: SecurityCategory;
  severity?: SecuritySeverity;
  userId?: string;
  summary?: string;
}): Promise<SecurityCase> => {
  const res = await apiPost<{ case: SecurityCase }>("/api/v1/security/cases", payload);
  return res.data.case;
};

export const updateSecurityCase = async (
  id: string,
  payload: Partial<{ title: string; summary: string; category: SecurityCategory }>,
): Promise<SecurityCase> => {
  const res = await apiPatch<{ case: SecurityCase }>(`/api/v1/security/cases/${id}`, payload);
  return res.data.case;
};

export const assignSecurityCase = async (id: string, adminId: string | null): Promise<SecurityCase> => {
  const res = await apiPost<{ case: SecurityCase }>(`/api/v1/security/cases/${id}/assign`, { adminId });
  return res.data.case;
};

export const updateSecurityCaseStatus = async (
  id: string,
  status: "open" | "triaged" | "investigating",
  reason?: string,
): Promise<SecurityCase> => {
  const res = await apiPost<{ case: SecurityCase }>(`/api/v1/security/cases/${id}/status`, { status, reason });
  return res.data.case;
};

export const updateSecurityCaseSeverity = async (
  id: string,
  severity: SecuritySeverity,
  reason?: string,
): Promise<SecurityCase> => {
  const res = await apiPost<{ case: SecurityCase }>(`/api/v1/security/cases/${id}/severity`, { severity, reason });
  return res.data.case;
};

export const addSecurityCaseNote = async (id: string, note: string): Promise<SecurityCaseEvent> => {
  const res = await apiPost<{ event: SecurityCaseEvent }>(`/api/v1/security/cases/${id}/notes`, { note });
  return res.data.event;
};

export const addSecurityCaseEvidence = async (
  id: string,
  payload: { evidenceType: SecurityEvidenceType; source: string; externalReference?: string; description: string },
): Promise<SecurityCaseEvidence> => {
  const res = await apiPost<{ evidence: SecurityCaseEvidence }>(`/api/v1/security/cases/${id}/evidence`, payload);
  return res.data.evidence;
};

export const resolveSecurityCase = async (id: string, note?: string): Promise<SecurityCase> => {
  const res = await apiPost<{ case: SecurityCase }>(`/api/v1/security/cases/${id}/resolve`, { note });
  return res.data.case;
};

export const closeSecurityCase = async (id: string, note?: string): Promise<SecurityCase> => {
  const res = await apiPost<{ case: SecurityCase }>(`/api/v1/security/cases/${id}/close`, { note });
  return res.data.case;
};

export const fetchSecurityActions = async (params: {
  limit?: number;
  offset?: number;
  status?: SecurityActionStatus;
  actionType?: SecurityActionType;
  userId?: string;
}): Promise<{ actions: SecurityAction[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.status) query.set("status", params.status);
  if (params.actionType) query.set("actionType", params.actionType);
  if (params.userId) query.set("userId", params.userId);

  const res = await apiGet<{ actions: SecurityAction[] }>(`/api/v1/security/actions?${query.toString()}`);
  return {
    actions: res.data.actions,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const requestBlock = async (userId: string, reason: string): Promise<SecurityAction> => {
  const res = await apiPost<{ action: SecurityAction }>(`/api/v1/security/users/${userId}/block/request`, { reason });
  return res.data.action;
};

export const requestUnblock = async (userId: string, reason: string): Promise<SecurityAction> => {
  const res = await apiPost<{ action: SecurityAction }>(`/api/v1/security/users/${userId}/unblock/request`, { reason });
  return res.data.action;
};

export const approveSecurityAction = async (id: string): Promise<SecurityAction> => {
  const res = await apiPost<{ action: SecurityAction }>(`/api/v1/security/actions/${id}/approve`);
  return res.data.action;
};

export const rejectSecurityAction = async (id: string, reason?: string): Promise<SecurityAction> => {
  const res = await apiPost<{ action: SecurityAction }>(`/api/v1/security/actions/${id}/reject`, { reason });
  return res.data.action;
};

export const forceLogout = async (userId: string, reason: string): Promise<SecurityAction> => {
  const res = await apiPost<{ action: SecurityAction }>(`/api/v1/security/users/${userId}/force-logout`, { reason });
  return res.data.action;
};

export const revokeSessions = async (userId: string, reason: string): Promise<SecurityAction> => {
  const res = await apiPost<{ action: SecurityAction }>(`/api/v1/security/users/${userId}/revoke-sessions`, { reason });
  return res.data.action;
};

export const fetchSecurityPosture = async (): Promise<SecurityPosture> => {
  const res = await apiGet<{ posture: SecurityPosture }>("/api/v1/security/posture");
  return res.data.posture;
};
