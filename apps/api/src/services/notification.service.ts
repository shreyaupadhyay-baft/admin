import {
  createNotification,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from "../repositories/notification.repository.js";
import { listActiveAdminIdsForRole, listActiveAdminIdsWithPermission } from "../repositories/rbac.repository.js";
import type { NotificationSeverity, NotificationType } from "../constants/notificationTypes.js";
import { logWithContext } from "../utils/logger.js";

type NotifyParams = {
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  /** Deterministic "event type + source entity + occurrence" key, WITHOUT the recipient — each fan-out target gets it combined with their own admin id. */
  dedupKey?: string;
};

/**
 * Notifies a single, already-known admin. Never throws: a notification is a
 * user-facing signal, not part of the business transaction it describes —
 * exactly like recordAudit, a failure here must never break the request that
 * triggered it. Returns null if the notification could not be created.
 */
export const notifyAdmin = async (recipientAdminId: string, params: NotifyParams): Promise<NotificationRow | null> => {
  try {
    const { notification } = await createNotification({
      recipientAdminId,
      type: params.type,
      title: params.title,
      message: params.message,
      severity: params.severity,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata,
      dedupKey: params.dedupKey ? `${params.dedupKey}:${recipientAdminId}` : undefined,
    });
    return notification;
  } catch (err) {
    logWithContext("error", "notification_create_failed", {
      recipientAdminId,
      type: params.type,
      error: err instanceof Error ? { message: err.message } : err,
    });
    return null;
  }
};

/** Notifies an explicit list of admins (deduplicated so a single admin never gets two rows for one call). */
export const notifyAdmins = async (recipientAdminIds: string[], params: NotifyParams): Promise<NotificationRow[]> => {
  const uniqueIds = [...new Set(recipientAdminIds)];
  const results = await Promise.all(uniqueIds.map((adminId) => notifyAdmin(adminId, params)));
  return results.filter((row): row is NotificationRow => row !== null);
};

/**
 * Resolves recipients to the active admins holding `roleName` AT THE MOMENT
 * OF THIS CALL, then creates one notification per admin — a recipient
 * snapshot, not a live query re-evaluated on every read. Disabled admins are
 * excluded by listActiveAdminIdsForRole; an admin who is later assigned the
 * role does not retroactively see this notification, and an admin who later
 * loses the role keeps the notifications already created for them.
 */
export const notifyRole = async (
  roleName: string,
  params: NotifyParams,
  options?: { excludeAdminId?: string },
): Promise<NotificationRow[]> => {
  try {
    const adminIds = (await listActiveAdminIdsForRole(roleName)).filter((id) => id !== options?.excludeAdminId);
    return await notifyAdmins(adminIds, params);
  } catch (err) {
    // Recipient resolution failing must never break the business action that
    // triggered it — same guarantee as notifyAdmin, just one layer up.
    logWithContext("error", "notification_role_resolution_failed", {
      roleName,
      type: params.type,
      error: err instanceof Error ? { message: err.message } : err,
    });
    return [];
  }
};

/** Same recipient-snapshot semantics as notifyRole, resolved by permission key instead of role name (for actions like Approvals whose eligible approvers are defined by permission, not a fixed role). */
export const notifyAdminsWithPermission = async (
  permissionKey: string,
  params: NotifyParams,
  options?: { excludeAdminId?: string },
): Promise<NotificationRow[]> => {
  try {
    const adminIds = (await listActiveAdminIdsWithPermission(permissionKey)).filter((id) => id !== options?.excludeAdminId);
    return await notifyAdmins(adminIds, params);
  } catch (err) {
    logWithContext("error", "notification_permission_resolution_failed", {
      permissionKey,
      type: params.type,
      error: err instanceof Error ? { message: err.message } : err,
    });
    return [];
  }
};

export const markRead = async (id: string, recipientAdminId: string): Promise<NotificationRow | null> =>
  markNotificationRead(id, recipientAdminId);

export const markAllRead = async (recipientAdminId: string): Promise<number> =>
  markAllNotificationsRead(recipientAdminId);
