import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import type { FakeNotification } from "./store.js";

const clone = (row: FakeNotification): FakeNotification => ({ ...row });

export const createNotification = async (params: {
  recipientAdminId: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  dedupKey?: string;
}): Promise<{ notification: FakeNotification; deduped: boolean }> => {
  if (params.dedupKey) {
    const existing = db.notifications.find(
      (n) => n.recipient_admin_id === params.recipientAdminId && n.dedup_key === params.dedupKey,
    );
    if (existing) return { notification: clone(existing), deduped: true };
  }

  const row: FakeNotification = {
    id: randomUUID(),
    recipient_admin_id: params.recipientAdminId,
    type: params.type,
    title: params.title,
    message: params.message,
    severity: params.severity,
    status: "unread",
    resource_type: params.resourceType ?? null,
    resource_id: params.resourceId ?? null,
    metadata: params.metadata ?? {},
    dedup_key: params.dedupKey ?? null,
    created_at: new Date(),
    read_at: null,
  };
  db.notifications.push(row);
  return { notification: clone(row), deduped: false };
};

export const findNotificationByDedupKey = async (
  recipientAdminId: string,
  dedupKey: string,
): Promise<FakeNotification | null> => {
  const row = db.notifications.find((n) => n.recipient_admin_id === recipientAdminId && n.dedup_key === dedupKey);
  return row ? clone(row) : null;
};

export const findNotificationById = async (id: string): Promise<FakeNotification | null> => {
  const row = db.notifications.find((n) => n.id === id);
  return row ? clone(row) : null;
};

export const listNotificationsForAdmin = async (params: {
  recipientAdminId: string;
  limit: number;
  offset: number;
  status?: string;
  severity?: string;
  type?: string;
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<FakeNotification[]> => {
  let results = db.notifications.filter((n) => n.recipient_admin_id === params.recipientAdminId);

  if (params.status) results = results.filter((n) => n.status === params.status);
  if (params.severity) results = results.filter((n) => n.severity === params.severity);
  if (params.type) results = results.filter((n) => n.type === params.type);
  if (params.dateFrom) results = results.filter((n) => n.created_at >= params.dateFrom!);
  if (params.dateTo) results = results.filter((n) => n.created_at <= params.dateTo!);

  return results
    .map(clone)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(params.offset, params.offset + params.limit);
};

export const countUnreadForAdmin = async (recipientAdminId: string): Promise<number> =>
  db.notifications.filter((n) => n.recipient_admin_id === recipientAdminId && n.status === "unread").length;

export const markNotificationRead = async (id: string, recipientAdminId: string): Promise<FakeNotification | null> => {
  const row = db.notifications.find((n) => n.id === id && n.recipient_admin_id === recipientAdminId);
  if (!row) return null;
  row.status = "read";
  row.read_at = row.read_at ?? new Date();
  return clone(row);
};

export const markAllNotificationsRead = async (recipientAdminId: string): Promise<number> => {
  const unread = db.notifications.filter((n) => n.recipient_admin_id === recipientAdminId && n.status === "unread");
  const now = new Date();
  for (const row of unread) {
    row.status = "read";
    row.read_at = now;
  }
  return unread.length;
};
