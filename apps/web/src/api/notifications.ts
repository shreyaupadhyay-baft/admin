import { apiGet, apiPatch, apiPost } from "./client.js";

export type NotificationStatus = "unread" | "read";
export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  status: NotificationStatus;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

export const fetchNotifications = async (params: {
  limit?: number;
  offset?: number;
  status?: NotificationStatus;
  severity?: NotificationSeverity;
  type?: string;
}): Promise<{ notifications: Notification[]; limit: number; offset: number }> => {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.status) query.set("status", params.status);
  if (params.severity) query.set("severity", params.severity);
  if (params.type) query.set("type", params.type);

  const res = await apiGet<{ notifications: Notification[] }>(`/api/v1/notifications?${query.toString()}`);
  return {
    notifications: res.data.notifications,
    limit: (res.meta.limit as number) ?? params.limit ?? 50,
    offset: (res.meta.offset as number) ?? params.offset ?? 0,
  };
};

export const fetchUnreadCount = async (): Promise<number> => {
  const res = await apiGet<{ unreadCount: number }>("/api/v1/notifications/unread-count");
  return res.data.unreadCount;
};

export const markNotificationRead = async (id: string): Promise<Notification> => {
  const res = await apiPatch<{ notification: Notification }>(`/api/v1/notifications/${id}/read`, {});
  return res.data.notification;
};

export const markAllNotificationsRead = async (): Promise<number> => {
  const res = await apiPost<{ markedCount: number }>("/api/v1/notifications/read-all");
  return res.data.markedCount;
};

/**
 * Best-effort client-side route for a notification's linked resource. This is
 * UX convenience only — the target page independently re-checks its own
 * permission via `can()`/the backend, so a notification link can never grant
 * access it wouldn't otherwise have.
 */
export const resourceRoute = (resourceType: string | null, resourceId: string | null): string | null => {
  if (!resourceType || !resourceId) return null;
  switch (resourceType) {
    case "security_case":
      return `/security/cases/${resourceId}`;
    case "security_action":
      return "/security/actions";
    case "risk_case":
      return `/risk/cases/${resourceId}`;
    case "support_case":
      return `/support/cases/${resourceId}`;
    case "approval":
      return `/approvals/${resourceId}`;
    case "admin_user":
      return `/administration/admins/${resourceId}`;
    default:
      return null;
  }
};
