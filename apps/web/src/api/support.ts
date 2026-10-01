import { apiGet, apiPatch, apiPost } from "./client.js";

export type SupportCaseCategory = "account" | "technical" | "app_issue" | "other";
export type SupportCasePriority = "low" | "medium" | "high" | "urgent";
export type SupportCaseStatus = "open" | "in_progress" | "resolved" | "closed";

export type SupportCase = {
  id: string;
  userId: string;
  subject: string;
  description: string;
  category: SupportCaseCategory;
  priority: SupportCasePriority;
  status: SupportCaseStatus;
  assignedAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
};

export type SupportCaseEvent = {
  id: string;
  actorAdminId: string | null;
  eventType: string;
  note: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export const fetchSupportCases = async (params: {
  limit?: number;
  offset?: number;
  status?: SupportCaseStatus;
  category?: SupportCaseCategory;
  priority?: SupportCasePriority;
}): Promise<{ cases: SupportCase[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.status) query.set("status", params.status);
  if (params.category) query.set("category", params.category);
  if (params.priority) query.set("priority", params.priority);

  const res = await apiGet<{ cases: SupportCase[] }>(`/api/v1/support/cases?${query.toString()}`);
  return {
    cases: res.data.cases,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const fetchSupportCase = async (id: string): Promise<{ case: SupportCase; events: SupportCaseEvent[] }> => {
  const res = await apiGet<{ case: SupportCase; events: SupportCaseEvent[] }>(`/api/v1/support/cases/${id}`);
  return res.data;
};

export const createSupportCase = async (payload: {
  userId: string;
  subject: string;
  description: string;
  category: SupportCaseCategory;
  priority?: SupportCasePriority;
}): Promise<SupportCase> => {
  const res = await apiPost<{ case: SupportCase }>("/api/v1/support/cases", payload);
  return res.data.case;
};

export const updateSupportCase = async (
  id: string,
  payload: Partial<{
    subject: string;
    description: string;
    category: SupportCaseCategory;
    priority: SupportCasePriority;
    status: "open" | "in_progress";
  }>,
): Promise<SupportCase> => {
  const res = await apiPatch<{ case: SupportCase }>(`/api/v1/support/cases/${id}`, payload);
  return res.data.case;
};

export const assignSupportCase = async (id: string, adminId: string | null): Promise<SupportCase> => {
  const res = await apiPost<{ case: SupportCase }>(`/api/v1/support/cases/${id}/assign`, { adminId });
  return res.data.case;
};

export const resolveSupportCase = async (id: string, note?: string): Promise<SupportCase> => {
  const res = await apiPost<{ case: SupportCase }>(`/api/v1/support/cases/${id}/resolve`, { note });
  return res.data.case;
};

export const closeSupportCase = async (id: string, note?: string): Promise<SupportCase> => {
  const res = await apiPost<{ case: SupportCase }>(`/api/v1/support/cases/${id}/close`, { note });
  return res.data.case;
};

export const addSupportCaseNote = async (id: string, note: string): Promise<SupportCaseEvent> => {
  const res = await apiPost<{ event: SupportCaseEvent }>(`/api/v1/support/cases/${id}/notes`, { note });
  return res.data.event;
};

export type AppIssueSource = "IN_APP" | "USER_REPORTED";
export type AppIssueSeverity = "low" | "medium" | "high" | "critical";
export type AppIssueStatus = "open" | "in_progress" | "resolved";

export type AppIssue = {
  id: string;
  userId: string | null;
  source: AppIssueSource;
  title: string;
  description: string;
  severity: AppIssueSeverity;
  status: AppIssueStatus;
  assignedAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export const fetchAppIssues = async (params: {
  limit?: number;
  offset?: number;
  status?: AppIssueStatus;
  source?: AppIssueSource;
  severity?: AppIssueSeverity;
}): Promise<{ appIssues: AppIssue[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.status) query.set("status", params.status);
  if (params.source) query.set("source", params.source);
  if (params.severity) query.set("severity", params.severity);

  const res = await apiGet<{ appIssues: AppIssue[] }>(`/api/v1/support/app-issues?${query.toString()}`);
  return {
    appIssues: res.data.appIssues,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const assignAppIssue = async (id: string, adminId: string | null): Promise<AppIssue> => {
  const res = await apiPost<{ appIssue: AppIssue }>(`/api/v1/support/app-issues/${id}/assign`, { adminId });
  return res.data.appIssue;
};

export const resolveAppIssue = async (id: string): Promise<AppIssue> => {
  const res = await apiPost<{ appIssue: AppIssue }>(`/api/v1/support/app-issues/${id}/resolve`);
  return res.data.appIssue;
};
