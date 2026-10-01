import { z } from "zod";
import { NOTIFICATION_TYPES, type NotificationType } from "../constants/notificationTypes.js";

export const notificationStatusSchema = z.enum(["unread", "read"]);
export const notificationSeveritySchema = z.enum(["info", "success", "warning", "critical"]);
const notificationTypeValues = Object.values(NOTIFICATION_TYPES) as [NotificationType, ...NotificationType[]];
export const notificationTypeSchema = z.enum(notificationTypeValues);

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: notificationStatusSchema.optional(),
  severity: notificationSeveritySchema.optional(),
  type: notificationTypeSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
