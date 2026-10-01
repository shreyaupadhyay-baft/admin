import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeSecurityCase } from "./store.js";

const clone = (row: FakeSecurityCase): FakeSecurityCase => ({ ...row });

let caseSeq = 0;

export const listSecurityCases = async (params: {
  limit: number;
  offset: number;
  status?: string;
  severity?: string;
  category?: string;
  assignedAdminId?: string;
  userId?: string;
  search?: string;
}): Promise<FakeSecurityCase[]> => {
  let results = db.securityCases.map(clone);

  if (params.status) results = results.filter((c) => c.status === params.status);
  if (params.severity) results = results.filter((c) => c.severity === params.severity);
  if (params.category) results = results.filter((c) => c.category === params.category);
  if (params.assignedAdminId) results = results.filter((c) => c.assigned_admin_id === params.assignedAdminId);
  if (params.userId) results = results.filter((c) => c.user_id === params.userId);
  if (params.search) {
    const needle = params.search.toLowerCase();
    results = results.filter(
      (c) =>
        c.title.toLowerCase().includes(needle) ||
        c.summary.toLowerCase().includes(needle) ||
        c.case_number.toLowerCase().includes(needle),
    );
  }

  return results
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(params.offset, params.offset + params.limit);
};

export const findSecurityCaseById = async (id: string): Promise<FakeSecurityCase | null> => {
  const row = db.securityCases.find((c) => c.id === id);
  return row ? clone(row) : null;
};

export const createSecurityCase = async (params: {
  title: string;
  category: string;
  severity: string;
  userId?: string;
  deviceId?: string;
  summary: string;
  source: string;
}): Promise<FakeSecurityCase> => {
  caseSeq += 1;
  const now = new Date();
  const row: FakeSecurityCase = {
    id: randomUUID(),
    case_number: `SEC-${String(caseSeq).padStart(6, "0")}`,
    title: params.title,
    category: params.category,
    severity: params.severity,
    status: "open",
    user_id: params.userId ?? null,
    device_id: params.deviceId ?? null,
    assigned_admin_id: null,
    summary: params.summary,
    source: params.source,
    created_at: now,
    updated_at: now,
    resolved_at: null,
    closed_at: null,
  };
  db.securityCases.push(row);
  return clone(row);
};

export const updateSecurityCaseFields = async (
  id: string,
  fields: { title?: string; summary?: string; category?: string },
): Promise<FakeSecurityCase | null> => {
  const row = db.securityCases.find((c) => c.id === id);
  if (!row) return null;
  if (fields.title !== undefined) row.title = fields.title;
  if (fields.summary !== undefined) row.summary = fields.summary;
  if (fields.category !== undefined) row.category = fields.category;
  row.updated_at = new Date();
  return clone(row);
};

export const assignSecurityCase = async (id: string, adminId: string | null): Promise<FakeSecurityCase | null> => {
  const row = db.securityCases.find((c) => c.id === id);
  if (!row) return null;
  row.assigned_admin_id = adminId;
  row.updated_at = new Date();
  return clone(row);
};

export const updateSecurityCaseStatus = async (id: string, status: string): Promise<FakeSecurityCase | null> => {
  const row = db.securityCases.find((c) => c.id === id);
  if (!row) return null;
  row.status = status;
  row.updated_at = new Date();
  return clone(row);
};

export const updateSecurityCaseSeverity = async (id: string, severity: string): Promise<FakeSecurityCase | null> => {
  const row = db.securityCases.find((c) => c.id === id);
  if (!row) return null;
  row.severity = severity;
  row.updated_at = new Date();
  return clone(row);
};

export const resolveSecurityCase = async (id: string): Promise<FakeSecurityCase | null> => {
  const row = db.securityCases.find((c) => c.id === id);
  if (!row) return null;
  row.status = "resolved";
  row.resolved_at = new Date();
  row.updated_at = new Date();
  return clone(row);
};

export const closeSecurityCase = async (id: string): Promise<FakeSecurityCase | null> => {
  const row = db.securityCases.find((c) => c.id === id);
  if (!row) return null;
  row.status = "closed";
  row.closed_at = new Date();
  row.updated_at = new Date();
  return clone(row);
};

export const countActiveSecurityCases = async (): Promise<number> =>
  db.securityCases.filter((c) => !["resolved", "closed"].includes(c.status)).length;

export const countActiveCriticalSecurityCases = async (): Promise<number> =>
  db.securityCases.filter((c) => c.severity === "critical" && !["resolved", "closed"].includes(c.status)).length;
