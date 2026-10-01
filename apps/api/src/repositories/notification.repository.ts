import { pool } from "../infrastructure/database/pool.js";
import { isUniqueViolation } from "../utils/db.js";
import type { NotificationSeverity, NotificationType } from "../constants/notificationTypes.js";

export type NotificationRow = {
  id: string;
  recipient_admin_id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  status: "unread" | "read";
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  dedup_key: string | null;
  created_at: Date;
  read_at: Date | null;
};

export const createNotification = async (params: {
  recipientAdminId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  dedupKey?: string;
}): Promise<{ notification: NotificationRow; deduped: boolean }> => {
  try {
    const { rows } = await pool.query<NotificationRow>(
      `INSERT INTO notifications
         (recipient_admin_id, type, title, message, severity, resource_type, resource_id, metadata, dedup_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        params.recipientAdminId,
        params.type,
        params.title,
        params.message,
        params.severity,
        params.resourceType ?? null,
        params.resourceId ?? null,
        JSON.stringify(params.metadata ?? {}),
        params.dedupKey ?? null,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error("createNotification: insert returned no row");
    return { notification: row, deduped: false };
  } catch (err) {
    // A retried event for the same recipient collapses onto the original
    // notification instead of erroring or creating a duplicate.
    if (params.dedupKey && isUniqueViolation(err)) {
      const existing = await findNotificationByDedupKey(params.recipientAdminId, params.dedupKey);
      if (existing) return { notification: existing, deduped: true };
    }
    throw err;
  }
};

export const findNotificationByDedupKey = async (
  recipientAdminId: string,
  dedupKey: string,
): Promise<NotificationRow | null> => {
  const { rows } = await pool.query<NotificationRow>(
    "SELECT * FROM notifications WHERE recipient_admin_id = $1 AND dedup_key = $2",
    [recipientAdminId, dedupKey],
  );
  return rows[0] ?? null;
};

export const findNotificationById = async (id: string): Promise<NotificationRow | null> => {
  const { rows } = await pool.query<NotificationRow>("SELECT * FROM notifications WHERE id = $1", [id]);
  return rows[0] ?? null;
};

export const listNotificationsForAdmin = async (params: {
  recipientAdminId: string;
  limit: number;
  offset: number;
  status?: "unread" | "read";
  severity?: NotificationSeverity;
  type?: NotificationType;
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<NotificationRow[]> => {
  const conditions: string[] = [`recipient_admin_id = $1`];
  const values: unknown[] = [params.recipientAdminId];

  if (params.status) conditions.push(`status = $${values.push(params.status)}`);
  if (params.severity) conditions.push(`severity = $${values.push(params.severity)}`);
  if (params.type) conditions.push(`type = $${values.push(params.type)}`);
  if (params.dateFrom) conditions.push(`created_at >= $${values.push(params.dateFrom)}`);
  if (params.dateTo) conditions.push(`created_at <= $${values.push(params.dateTo)}`);

  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await pool.query<NotificationRow>(
    `SELECT * FROM notifications WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows;
};

/** Indexed COUNT against (recipient_admin_id, status) — never loads full rows. */
export const countUnreadForAdmin = async (recipientAdminId: string): Promise<number> => {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM notifications WHERE recipient_admin_id = $1 AND status = 'unread'",
    [recipientAdminId],
  );
  return Number(rows[0]?.count ?? 0);
};

// Both mark-read operations are scoped to recipient_admin_id in the WHERE
// clause itself (not checked after the fact) — an admin can never mark
// another admin's notification as read, and re-marking an already-read
// notification is a harmless no-op (idempotent), never an error.

export const markNotificationRead = async (id: string, recipientAdminId: string): Promise<NotificationRow | null> => {
  const { rows } = await pool.query<NotificationRow>(
    `UPDATE notifications
     SET status = 'read', read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND recipient_admin_id = $2
     RETURNING *`,
    [id, recipientAdminId],
  );
  return rows[0] ?? null;
};

export const markAllNotificationsRead = async (recipientAdminId: string): Promise<number> => {
  const result = await pool.query(
    `UPDATE notifications
     SET status = 'read', read_at = NOW()
     WHERE recipient_admin_id = $1 AND status = 'unread'`,
    [recipientAdminId],
  );
  return result.rowCount ?? 0;
};
