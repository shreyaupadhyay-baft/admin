import { Router } from "express";
import {
  getNotificationHandler,
  getUnreadCountHandler,
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from "../controllers/notification.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const notificationRouter = Router();

notificationRouter.use(authenticate);

// Every handler below reads req.admin.id as the recipient — there is no way
// to pass another admin's id, so cross-admin access is structurally
// impossible, not just permission-gated.
notificationRouter.get("/", requirePermission(PERMISSIONS.NOTIFICATIONS_READ), listNotificationsHandler);
notificationRouter.get("/unread-count", requirePermission(PERMISSIONS.NOTIFICATIONS_READ), getUnreadCountHandler);
notificationRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.NOTIFICATIONS_READ),
  getNotificationHandler,
);
notificationRouter.patch(
  "/:id/read",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.NOTIFICATIONS_MARK_READ),
  markNotificationReadHandler,
);
notificationRouter.post(
  "/read-all",
  requirePermission(PERMISSIONS.NOTIFICATIONS_MARK_ALL_READ),
  markAllNotificationsReadHandler,
);
