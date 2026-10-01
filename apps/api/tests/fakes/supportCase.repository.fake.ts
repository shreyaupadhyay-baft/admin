import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeSupportCase } from "./store.js";

const clone = (row: FakeSupportCase): FakeSupportCase => ({ ...row });

export const listSupportCases = async (params: {
  limit: number;
  offset: number;
  status?: string;
  category?: string;
  priority?: string;
  assignedAdminId?: string;
  userId?: string;
}): Promise<FakeSupportCase[]> => {
  let results = db.supportCases.map(clone);

  if (params.status) results = results.filter((c) => c.status === params.status);
  if (params.category) results = results.filter((c) => c.category === params.category);
  if (params.priority) results = results.filter((c) => c.priority === params.priority);
  if (params.assignedAdminId) results = results.filter((c) => c.assigned_admin_id === params.assignedAdminId);
  if (params.userId) results = results.filter((c) => c.user_id === params.userId);

  return results
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(params.offset, params.offset + params.limit);
};

export const findSupportCaseById = async (id: string): Promise<FakeSupportCase | null> => {
  const row = db.supportCases.find((c) => c.id === id);
  return row ? clone(row) : null;
};

export const createSupportCase = async (params: {
  userId: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
}): Promise<FakeSupportCase> => {
  const now = new Date();
  const row: FakeSupportCase = {
    id: randomUUID(),
    user_id: params.userId,
    subject: params.subject,
    description: params.description,
    category: params.category,
    priority: params.priority,
    status: "open",
    assigned_admin_id: null,
    created_at: now,
    updated_at: now,
    resolved_at: null,
    closed_at: null,
  };
  db.supportCases.push(row);
  return clone(row);
};

export const updateSupportCaseFields = async (
  id: string,
  fields: { subject?: string; description?: string; category?: string; priority?: string },
): Promise<FakeSupportCase | null> => {
  const row = db.supportCases.find((c) => c.id === id);
  if (!row) return null;
  if (fields.subject !== undefined) row.subject = fields.subject;
  if (fields.description !== undefined) row.description = fields.description;
  if (fields.category !== undefined) row.category = fields.category;
  if (fields.priority !== undefined) row.priority = fields.priority;
  row.updated_at = new Date();
  return clone(row);
};

export const updateSupportCaseStatus = async (id: string, status: string): Promise<FakeSupportCase | null> => {
  const row = db.supportCases.find((c) => c.id === id);
  if (!row) return null;
  row.status = status;
  row.updated_at = new Date();
  return clone(row);
};

export const assignSupportCase = async (id: string, adminId: string | null): Promise<FakeSupportCase | null> => {
  const row = db.supportCases.find((c) => c.id === id);
  if (!row) return null;
  row.assigned_admin_id = adminId;
  row.updated_at = new Date();
  return clone(row);
};

export const resolveSupportCase = async (id: string): Promise<FakeSupportCase | null> => {
  const row = db.supportCases.find((c) => c.id === id);
  if (!row) return null;
  row.status = "resolved";
  row.resolved_at = new Date();
  row.updated_at = new Date();
  return clone(row);
};

export const closeSupportCase = async (id: string): Promise<FakeSupportCase | null> => {
  const row = db.supportCases.find((c) => c.id === id);
  if (!row) return null;
  row.status = "closed";
  row.closed_at = new Date();
  row.updated_at = new Date();
  return clone(row);
};
