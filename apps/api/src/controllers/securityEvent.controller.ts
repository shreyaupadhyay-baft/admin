import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  createSecurityEvent,
  findSecurityEventById,
  listSecurityEvents,
  updateSecurityEventStatus,
  type SecurityEventRow,
} from "../repositories/securityEvent.repository.js";
import { findUserById } from "../repositories/user.repository.js";
import { findDeviceById } from "../repositories/device.repository.js";
import { listSecurityEventsQuerySchema } from "../validation/securityEvent.schema.js";

const serializeEvent = (e: SecurityEventRow) => ({
  id: e.id,
  eventType: e.event_type,
  category: e.category,
  severity: e.severity,
  source: e.source,
  status: e.status,
  userId: e.user_id,
  deviceId: e.device_id,
  externalReference: e.external_reference,
  description: e.description,
  metadata: e.metadata,
  detectedAt: e.detected_at,
  createdAt: e.created_at,
});

export const listSecurityEventsHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listSecurityEventsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const {
    limit = 50,
    offset = 0,
    eventType,
    category,
    severity,
    status,
    source,
    userId,
    deviceId,
    detectedFrom,
    detectedTo,
    search,
    sort,
  } = parsed.data;
  const events = await listSecurityEvents({
    limit,
    offset,
    eventType,
    category,
    severity,
    status,
    source,
    userId,
    deviceId,
    detectedFrom,
    detectedTo,
    search,
    sort,
  });

  sendSuccess(res, 200, { events: events.map(serializeEvent) }, { limit, offset });
};

export const getSecurityEventHandler = async (req: Request, res: Response): Promise<void> => {
  const event = await findSecurityEventById(req.params.id as string);
  if (!event) throw new AppError("SECURITY_EVENT_NOT_FOUND", "Security event not found.", 404);
  sendSuccess(res, 200, { event: serializeEvent(event) });
};

export const createSecurityEventHandler = async (req: Request, res: Response): Promise<void> => {
  const { eventType, category, severity, source, userId, deviceId, externalReference, description, metadata, detectedAt } =
    req.body as {
      eventType: string;
      category: string;
      severity: string;
      source: string;
      userId?: string;
      deviceId?: string;
      externalReference?: string;
      description: string;
      metadata: Record<string, unknown>;
      detectedAt?: Date;
    };

  if (userId !== undefined) {
    const user = await findUserById(userId);
    if (!user) throw new AppError("USER_NOT_FOUND", "The referenced user does not exist.", 400);
  }
  if (deviceId !== undefined) {
    const device = await findDeviceById(deviceId);
    if (!device) throw new AppError("DEVICE_NOT_FOUND", "The referenced device does not exist.", 400);
  }

  const created = await createSecurityEvent({
    eventType,
    category,
    severity,
    source,
    userId,
    deviceId,
    externalReference,
    description,
    metadata,
    detectedAt,
  });

  await recordAudit(req, AUDIT_ACTIONS.SECURITY_EVENT_CREATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "security_event",
    targetId: created.id,
    metadata: { eventType, category, severity, source },
  });

  sendSuccess(res, 201, { event: serializeEvent(created) });
};

export const updateSecurityEventStatusHandler = async (req: Request, res: Response): Promise<void> => {
  const eventId = req.params.id as string;
  const { status, reason } = req.body as { status: string; reason?: string };

  const existing = await findSecurityEventById(eventId);
  if (!existing) throw new AppError("SECURITY_EVENT_NOT_FOUND", "Security event not found.", 404);

  const updated = await updateSecurityEventStatus(eventId, status);
  if (!updated) throw new AppError("SECURITY_EVENT_NOT_FOUND", "Security event not found.", 404);

  await recordAudit(req, AUDIT_ACTIONS.SECURITY_EVENT_STATUS_CHANGED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "security_event",
    targetId: eventId,
    metadata: { previousStatus: existing.status, newStatus: status, reason },
  });

  sendSuccess(res, 200, { event: serializeEvent(updated) });
};
