import { apiGet, apiPatch, apiPost } from "./client.js";

export type RiskCategory =
  | "account_identity"
  | "authentication_security"
  | "fraud"
  | "transaction_payment"
  | "device"
  | "behavioral"
  | "integration_provider"
  | "operational"
  | "system_technical"
  | "privacy_data"
  | "ai_model";

export type RiskSeverity = "low" | "medium" | "high" | "critical";
export type RiskSignalStatus = "new" | "acknowledged" | "dismissed" | "escalated";
export type RiskCaseStatus = "open" | "triaged" | "investigating" | "resolved" | "closed";
export type RiskCaseDecision = "no_action" | "monitor" | "restrict_account" | "escalate" | "close_case";
export type RiskEvidenceType =
  | "risk_signal"
  | "provider_signal"
  | "device_signal"
  | "system_signal"
  | "security_event"
  | "behavioral_signal"
  | "manual_note"
  | "external_reference";

export type RiskSignal = {
  id: string;
  signalType: string;
  category: RiskCategory;
  severity: RiskSeverity;
  source: string;
  status: RiskSignalStatus;
  userId: string | null;
  externalReference: string | null;
  description: string;
  metadata: Record<string, unknown>;
  detectedAt: string;
  createdAt: string;
};

export type RiskCase = {
  id: string;
  caseNumber: string;
  title: string;
  category: RiskCategory;
  severity: RiskSeverity;
  status: RiskCaseStatus;
  userId: string | null;
  assignedAdminId: string | null;
  summary: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
};

export type RiskCaseEvent = {
  id: string;
  actorAdminId: string | null;
  eventType: string;
  note: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type RiskCaseEvidence = {
  id: string;
  evidenceType: RiskEvidenceType;
  source: string;
  externalReference: string | null;
  description: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
};

export type RiskCaseDecisionRecord = {
  id: string;
  decision: RiskCaseDecision;
  reason: string;
  createdBy: string;
  createdAt: string;
};

export const fetchRiskSignals = async (params: {
  limit?: number;
  offset?: number;
  category?: RiskCategory;
  severity?: RiskSeverity;
  status?: RiskSignalStatus;
}): Promise<{ signals: RiskSignal[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.category) query.set("category", params.category);
  if (params.severity) query.set("severity", params.severity);
  if (params.status) query.set("status", params.status);

  const res = await apiGet<{ signals: RiskSignal[] }>(`/api/v1/risk/signals?${query.toString()}`);
  return {
    signals: res.data.signals,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const createRiskSignal = async (payload: {
  signalType: string;
  category: RiskCategory;
  severity?: RiskSeverity;
  source: string;
  userId?: string;
  description: string;
}): Promise<RiskSignal> => {
  const res = await apiPost<{ signal: RiskSignal }>("/api/v1/risk/signals", payload);
  return res.data.signal;
};

export const updateRiskSignalStatus = async (id: string, status: RiskSignalStatus, reason?: string): Promise<RiskSignal> => {
  const res = await apiPatch<{ signal: RiskSignal }>(`/api/v1/risk/signals/${id}/status`, { status, reason });
  return res.data.signal;
};

export const fetchRiskCases = async (params: {
  limit?: number;
  offset?: number;
  status?: RiskCaseStatus;
  severity?: RiskSeverity;
  category?: RiskCategory;
}): Promise<{ cases: RiskCase[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.status) query.set("status", params.status);
  if (params.severity) query.set("severity", params.severity);
  if (params.category) query.set("category", params.category);

  const res = await apiGet<{ cases: RiskCase[] }>(`/api/v1/risk/cases?${query.toString()}`);
  return {
    cases: res.data.cases,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const fetchRiskCase = async (
  id: string,
): Promise<{ case: RiskCase; events: RiskCaseEvent[]; evidence: RiskCaseEvidence[]; decisions: RiskCaseDecisionRecord[] }> => {
  const res = await apiGet<{
    case: RiskCase;
    events: RiskCaseEvent[];
    evidence: RiskCaseEvidence[];
    decisions: RiskCaseDecisionRecord[];
  }>(`/api/v1/risk/cases/${id}`);
  return res.data;
};

export const createRiskCase = async (payload: {
  title: string;
  category: RiskCategory;
  severity?: RiskSeverity;
  userId?: string;
  summary?: string;
}): Promise<RiskCase> => {
  const res = await apiPost<{ case: RiskCase }>("/api/v1/risk/cases", payload);
  return res.data.case;
};

export const updateRiskCase = async (
  id: string,
  payload: Partial<{ title: string; summary: string; category: RiskCategory }>,
): Promise<RiskCase> => {
  const res = await apiPatch<{ case: RiskCase }>(`/api/v1/risk/cases/${id}`, payload);
  return res.data.case;
};

export const assignRiskCase = async (id: string, adminId: string | null): Promise<RiskCase> => {
  const res = await apiPost<{ case: RiskCase }>(`/api/v1/risk/cases/${id}/assign`, { adminId });
  return res.data.case;
};

export const updateRiskCaseStatus = async (
  id: string,
  status: "open" | "triaged" | "investigating",
  reason?: string,
): Promise<RiskCase> => {
  const res = await apiPost<{ case: RiskCase }>(`/api/v1/risk/cases/${id}/status`, { status, reason });
  return res.data.case;
};

export const updateRiskCaseSeverity = async (id: string, severity: RiskSeverity, reason?: string): Promise<RiskCase> => {
  const res = await apiPost<{ case: RiskCase }>(`/api/v1/risk/cases/${id}/severity`, { severity, reason });
  return res.data.case;
};

export const resolveRiskCase = async (id: string, note?: string): Promise<RiskCase> => {
  const res = await apiPost<{ case: RiskCase }>(`/api/v1/risk/cases/${id}/resolve`, { note });
  return res.data.case;
};

export const closeRiskCase = async (id: string, note?: string): Promise<RiskCase> => {
  const res = await apiPost<{ case: RiskCase }>(`/api/v1/risk/cases/${id}/close`, { note });
  return res.data.case;
};

export const addRiskCaseNote = async (id: string, note: string): Promise<RiskCaseEvent> => {
  const res = await apiPost<{ event: RiskCaseEvent }>(`/api/v1/risk/cases/${id}/notes`, { note });
  return res.data.event;
};

export const addRiskCaseEvidence = async (
  id: string,
  payload: { evidenceType: RiskEvidenceType; source: string; externalReference?: string; description: string },
): Promise<RiskCaseEvidence> => {
  const res = await apiPost<{ evidence: RiskCaseEvidence }>(`/api/v1/risk/cases/${id}/evidence`, payload);
  return res.data.evidence;
};

export const addRiskCaseDecision = async (
  id: string,
  decision: RiskCaseDecision,
  reason: string,
): Promise<RiskCaseDecisionRecord> => {
  const res = await apiPost<{ decision: RiskCaseDecisionRecord }>(`/api/v1/risk/cases/${id}/decisions`, {
    decision,
    reason,
  });
  return res.data.decision;
};
