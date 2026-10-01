import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeAppIssue } from "./store.js";

const clone = (row: FakeAppIssue): FakeAppIssue => ({ ...row });

export const listAppIssues = async (params: {
  limit: number;
  offset: number;
  status?: string;
  source?: string;
  severity?: string;
  assignedAdminId?: string;
  userId?: string;
}): Promise<FakeAppIssue[]> => {
  let results = db.appIssues.map(clone);

  if (params.status) results = results.filter((i) => i.status === params.status);
  if (params.source) results = results.filter((i) => i.source === params.source);
  if (params.severity) results = results.filter((i) => i.severity === params.severity);
  if (params.assignedAdminId) results = results.filter((i) => i.assigned_admin_id === params.assignedAdminId);
  if (params.userId) results = results.filter((i) => i.user_id === params.userId);

  return results
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(params.offset, params.offset + params.limit);
};

export const findAppIssueById = async (id: string): Promise<FakeAppIssue | null> => {
  const row = db.appIssues.find((i) => i.id === id);
  return row ? clone(row) : null;
};

export const createAppIssue = async (params: {
  userId?: string | null;
  source: string;
  title: string;
  description: string;
  severity: string;
}): Promise<FakeAppIssue> => {
  const now = new Date();
  const row: FakeAppIssue = {
    id: randomUUID(),
    user_id: params.userId ?? null,
    source: params.source,
    title: params.title,
    description: params.description,
    severity: params.severity,
    status: "open",
    assigned_admin_id: null,
    created_at: now,
    updated_at: now,
    resolved_at: null,
  };
  db.appIssues.push(row);
  return clone(row);
};

export const updateAppIssueFields = async (
  id: string,
  fields: { title?: string; description?: string; severity?: string },
): Promise<FakeAppIssue | null> => {
  const row = db.appIssues.find((i) => i.id === id);
  if (!row) return null;
  if (fields.title !== undefined) row.title = fields.title;
  if (fields.description !== undefined) row.description = fields.description;
  if (fields.severity !== undefined) row.severity = fields.severity;
  row.updated_at = new Date();
  return clone(row);
};

export const updateAppIssueStatus = async (id: string, status: string): Promise<FakeAppIssue | null> => {
  const row = db.appIssues.find((i) => i.id === id);
  if (!row) return null;
  row.status = status;
  row.updated_at = new Date();
  return clone(row);
};

export const assignAppIssue = async (id: string, adminId: string | null): Promise<FakeAppIssue | null> => {
  const row = db.appIssues.find((i) => i.id === id);
  if (!row) return null;
  row.assigned_admin_id = adminId;
  row.updated_at = new Date();
  return clone(row);
};

export const resolveAppIssue = async (id: string): Promise<FakeAppIssue | null> => {
  const row = db.appIssues.find((i) => i.id === id);
  if (!row) return null;
  row.status = "resolved";
  row.resolved_at = new Date();
  row.updated_at = new Date();
  return clone(row);
};
