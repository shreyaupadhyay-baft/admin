import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import {
  countUnreadForAdmin,
  findNotificationById,
  listNotificationsForAdmin,
  type NotificationRow,
} from "../repositories/notification.repository.js";
import { markAllRead, markRead } from "../services/notification.service.js";
import { listNotificationsQuerySchema } from "../validation/notification.schema.js";

const serializeNotification = (n: NotificationRow) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  message: n.message,
  severity: n.severity,
  status: n.status,
  resourceType: n.resource_type,
  resourceId: n.resource_id,
  metadata: n.metadata,
  createdAt: n.created_at,
  readAt: n.read_at,
});

const notFound = () => new AppError("NOTIFICATION_NOT_FOUND", "Notification not found.", 404);

export const listNotificationsHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listNotificationsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, status, severity, type, dateFrom, dateTo } = parsed.data;
  const recipientAdminId = req.admin?.id as string;

  const notifications = await listNotificationsForAdmin({
    recipientAdminId,
    limit,
    offset,
    status,
    severity,
    type,
    dateFrom,
    dateTo,
  });

  sendSuccess(res, 200, { notifications: notifications.map(serializeNotification) }, { limit, offset });
};

export const getUnreadCountHandler = async (req: Request, res: Response): Promise<void> => {
  const recipientAdminId = req.admin?.id as string;
  const count = await countUnreadForAdmin(recipientAdminId);
  sendSuccess(res, 200, { unreadCount: count });
};

export const getNotificationHandler = async (req: Request, res: Response): Promise<void> => {
  const recipientAdminId = req.admin?.id as string;
  const notification = await findNotificationById(req.params.id as string);
  // Scoped by recipient before returning 404 either way, so a nonexistent id
  // and someone else's notification are indistinguishable to the caller.
  if (!notification || notification.recipient_admin_id !== recipientAdminId) throw notFound();

  sendSuccess(res, 200, { notification: serializeNotification(notification) });
};

export const markNotificationReadHandler = async (req: Request, res: Response): Promise<void> => {
  const recipientAdminId = req.admin?.id as string;
  const updated = await markRead(req.params.id as string, recipientAdminId);
  if (!updated) throw notFound();

  sendSuccess(res, 200, { notification: serializeNotification(updated) });
};

export const markAllNotificationsReadHandler = async (req: Request, res: Response): Promise<void> => {
  const recipientAdminId = req.admin?.id as string;
  const markedCount = await markAllRead(recipientAdminId);
  sendSuccess(res, 200, { markedCount });
};
