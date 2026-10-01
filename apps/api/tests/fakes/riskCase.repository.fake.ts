import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeRiskCase } from "./store.js";

const clone = (row: FakeRiskCase): FakeRiskCase => ({ ...row });

let caseSeq = 0;

export const listRiskCases = async (params: {
  limit: number;
  offset: number;
  status?: string;
  severity?: string;
  category?: string;
  assignedAdminId?: string;
  userId?: string;
  search?: string;
}): Promise<FakeRiskCase[]> => {
  let results = db.riskCases.map(clone);

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

export const findRiskCaseById = async (id: string): Promise<FakeRiskCase | null> => {
  const row = db.riskCases.find((c) => c.id === id);
  return row ? clone(row) : null;
};

export const createRiskCase = async (params: {
  title: string;
  category: string;
  severity: string;
  userId?: string;
  summary: string;
  source: string;
}): Promise<FakeRiskCase> => {
  caseSeq += 1;
  const now = new Date();
  const row: FakeRiskCase = {
    id: randomUUID(),
    case_number: `RC-${String(caseSeq).padStart(6, "0")}`,
    title: params.title,
    category: params.category,
    severity: params.severity,
    status: "open",
    user_id: params.userId ?? null,
    assigned_admin_id: null,
    summary: params.summary,
    source: params.source,
    created_at: now,
    updated_at: now,
    resolved_at: null,
    closed_at: null,
  };
  db.riskCases.push(row);
  return clone(row);
};

export const updateRiskCaseFields = async (
  id: string,
  fields: { title?: string; summary?: string; category?: string },
): Promise<FakeRiskCase | null> => {
  const row = db.riskCases.find((c) => c.id === id);
  if (!row) return null;
  if (fields.title !== undefined) row.title = fields.title;
  if (fields.summary !== undefined) row.summary = fields.summary;
  if (fields.category !== undefined) row.category = fields.category;
  row.updated_at = new Date();
  return clone(row);
};

export const assignRiskCase = async (id: string, adminId: string | null): Promise<FakeRiskCase | null> => {
  const row = db.riskCases.find((c) => c.id === id);
  if (!row) return null;
  row.assigned_admin_id = adminId;
  row.updated_at = new Date();
  return clone(row);
};

export const updateRiskCaseStatus = async (id: string, status: string): Promise<FakeRiskCase | null> => {
  const row = db.riskCases.find((c) => c.id === id);
  if (!row) return null;
  row.status = status;
  row.updated_at = new Date();
  return clone(row);
};

export const updateRiskCaseSeverity = async (id: string, severity: string): Promise<FakeRiskCase | null> => {
  const row = db.riskCases.find((c) => c.id === id);
  if (!row) return null;
  row.severity = severity;
  row.updated_at = new Date();
  return clone(row);
};

export const resolveRiskCase = async (id: string): Promise<FakeRiskCase | null> => {
  const row = db.riskCases.find((c) => c.id === id);
  if (!row) return null;
  row.status = "resolved";
  row.resolved_at = new Date();
  row.updated_at = new Date();
  return clone(row);
};

export const closeRiskCase = async (id: string): Promise<FakeRiskCase | null> => {
  const row = db.riskCases.find((c) => c.id === id);
  if (!row) return null;
  row.status = "closed";
  row.closed_at = new Date();
  row.updated_at = new Date();
  return clone(row);
};
