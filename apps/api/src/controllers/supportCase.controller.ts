import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  assignSupportCase,
  closeSupportCase,
  createSupportCase,
  findSupportCaseById,
  listSupportCases,
  resolveSupportCase,
  updateSupportCaseFields,
  updateSupportCaseStatus,
  type SupportCaseRow,
} from "../repositories/supportCase.repository.js";
import {
  insertSupportCaseEvent,
  listSupportCaseEvents,
  type SupportCaseEventRow,
} from "../repositories/supportCaseEvent.repository.js";
import { findUserById } from "../repositories/user.repository.js";
import { findAdminUserById } from "../repositories/adminUser.repository.js";
import { listSupportCasesQuerySchema } from "../validation/supportCase.schema.js";
import { notifyAdmin } from "../services/notification.service.js";
import { NOTIFICATION_TYPES } from "../constants/notificationTypes.js";

const serializeCase = (c: SupportCaseRow) => ({
  id: c.id,
  userId: c.user_id,
  subject: c.subject,
  description: c.description,
  category: c.category,
  priority: c.priority,
  status: c.status,
  assignedAdminId: c.assigned_admin_id,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
  resolvedAt: c.resolved_at,
  closedAt: c.closed_at,
});

const serializeEvent = (e: SupportCaseEventRow) => ({
  id: e.id,
  actorAdminId: e.actor_admin_id,
  eventType: e.event_type,
  note: e.note,
  metadata: e.metadata,
  createdAt: e.created_at,
});

export const listSupportCasesHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listSupportCasesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, status, category, priority, assignedAdminId, userId } = parsed.data;
  const cases = await listSupportCases({ limit, offset, status, category, priority, assignedAdminId, userId });

  sendSuccess(res, 200, { cases: cases.map(serializeCase) }, { limit, offset });
};

export const getSupportCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const supportCase = await findSupportCaseById(req.params.id as string);
  if (!supportCase) {
    throw new AppError("SUPPORT_CASE_NOT_FOUND", "Support case not found.", 404);
  }

  const events = await listSupportCaseEvents(supportCase.id);
  sendSuccess(res, 200, { case: serializeCase(supportCase), events: events.map(serializeEvent) });
};

export const createSupportCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const { userId, subject, description, category, priority } = req.body as {
    userId: string;
    subject: string;
    description: string;
    category: string;
    priority: string;
  };

  const user = await findUserById(userId);
  if (!user) {
    throw new AppError("USER_NOT_FOUND", "The user this case is for does not exist.", 400);
  }

  const created = await createSupportCase({ userId, subject, description, category, priority });

  const actorAdminId = req.admin?.id ?? null;
  await insertSupportCaseEvent({
    supportCaseId: created.id,
    actorAdminId,
    eventType: "CASE_CREATED",
    metadata: { subject, category, priority },
  });
  await recordAudit(req, AUDIT_ACTIONS.SUPPORT_CASE_CREATED, {
    actorAdminId,
    targetType: "support_case",
    targetId: created.id,
    metadata: { userId, subject, category, priority },
  });

  sendSuccess(res, 201, { case: serializeCase(created) });
};

export const updateSupportCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { subject, description, category, priority, status } = req.body as {
    subject?: string;
    description?: string;
    category?: string;
    priority?: string;
    status?: string;
  };

  const existing = await findSupportCaseById(caseId);
  if (!existing) {
    throw new AppError("SUPPORT_CASE_NOT_FOUND", "Support case not found.", 404);
  }

  const actorAdminId = req.admin?.id ?? null;
  let current = existing;

  if (subject !== undefined || description !== undefined || category !== undefined || priority !== undefined) {
    const updated = await updateSupportCaseFields(caseId, { subject, description, category, priority });
    if (!updated) throw new AppError("SUPPORT_CASE_NOT_FOUND", "Support case not found.", 404);
    current = updated;

    await insertSupportCaseEvent({
      supportCaseId: caseId,
      actorAdminId,
      eventType: "UPDATED",
      metadata: { subject, description, category, priority },
    });
    await recordAudit(req, AUDIT_ACTIONS.SUPPORT_CASE_UPDATED, {
      actorAdminId,
      targetType: "support_case",
      targetId: caseId,
      metadata: { subject, category, priority },
    });
  }

  if (status !== undefined && status !== current.status) {
    const previousStatus = current.status;
    const updated = await updateSupportCaseStatus(caseId, status);
    if (!updated) throw new AppError("SUPPORT_CASE_NOT_FOUND", "Support case not found.", 404);
    current = updated;

    const event = await insertSupportCaseEvent({
      supportCaseId: caseId,
      actorAdminId,
      eventType: "STATUS_CHANGED",
      metadata: { previousStatus, newStatus: status },
    });
    await recordAudit(req, AUDIT_ACTIONS.SUPPORT_CASE_STATUS_CHANGED, {
      actorAdminId,
      targetType: "support_case",
      targetId: caseId,
      metadata: { previousStatus, newStatus: status },
    });

    if (current.assigned_admin_id && current.assigned_admin_id !== actorAdminId) {
      await notifyAdmin(current.assigned_admin_id, {
        type: NOTIFICATION_TYPES.SUPPORT_CASE_STATUS_CHANGED,
        title: "Support case status changed",
        message: `${current.subject} is now '${status}'`,
        severity: "info",
        resourceType: "support_case",
        resourceId: caseId,
        metadata: { previousStatus, newStatus: status },
        dedupKey: `support_case_status_changed:${event.id}`,
      });
    }
  }

  sendSuccess(res, 200, { case: serializeCase(current) });
};

export const assignSupportCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { adminId } = req.body as { adminId: string | null };

  const existing = await findSupportCaseById(caseId);
  if (!existing) {
    throw new AppError("SUPPORT_CASE_NOT_FOUND", "Support case not found.", 404);
  }

  if (adminId !== null) {
    const targetAdmin = await findAdminUserById(adminId);
    if (!targetAdmin) {
      throw new AppError("ADMIN_NOT_FOUND", "The admin to assign does not exist.", 400);
    }
  }

  const previousAdminId = existing.assigned_admin_id;
  const updated = await assignSupportCase(caseId, adminId);
  if (!updated) {
    throw new AppError("SUPPORT_CASE_NOT_FOUND", "Support case not found.", 404);
  }

  const actorAdminId = req.admin?.id ?? null;
  const isUnassigning = adminId === null;

  const event = await insertSupportCaseEvent({
    supportCaseId: caseId,
    actorAdminId,
    eventType: isUnassigning ? "UNASSIGNED" : "ASSIGNED",
    metadata: { previousAdminId, newAdminId: adminId },
  });
  await recordAudit(req, isUnassigning ? AUDIT_ACTIONS.SUPPORT_CASE_UNASSIGNED : AUDIT_ACTIONS.SUPPORT_CASE_ASSIGNED, {
    actorAdminId,
    targetType: "support_case",
    targetId: caseId,
    metadata: { previousAdminId, newAdminId: adminId },
  });

  if (!isUnassigning && adminId !== actorAdminId) {
    await notifyAdmin(adminId, {
      type: NOTIFICATION_TYPES.SUPPORT_CASE_ASSIGNED,
      title: "Support case assigned to you",
      message: updated.subject,
      severity: "info",
      resourceType: "support_case",
      resourceId: caseId,
      metadata: {},
      dedupKey: `support_case_assigned:${event.id}`,
    });
  }

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const resolveSupportCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { note } = req.body as { note?: string };

  const existing = await findSupportCaseById(caseId);
  if (!existing) {
    throw new AppError("SUPPORT_CASE_NOT_FOUND", "Support case not found.", 404);
  }

  const updated = await resolveSupportCase(caseId);
  if (!updated) {
    throw new AppError("SUPPORT_CASE_NOT_FOUND", "Support case not found.", 404);
  }

  const actorAdminId = req.admin?.id ?? null;
  await insertSupportCaseEvent({ supportCaseId: caseId, actorAdminId, eventType: "RESOLVED", note });
  await recordAudit(req, AUDIT_ACTIONS.SUPPORT_CASE_RESOLVED, {
    actorAdminId,
    targetType: "support_case",
    targetId: caseId,
    metadata: { note },
  });

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const closeSupportCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { note } = req.body as { note?: string };

  const existing = await findSupportCaseById(caseId);
  if (!existing) {
    throw new AppError("SUPPORT_CASE_NOT_FOUND", "Support case not found.", 404);
  }

  const updated = await closeSupportCase(caseId);
  if (!updated) {
    throw new AppError("SUPPORT_CASE_NOT_FOUND", "Support case not found.", 404);
  }

  const actorAdminId = req.admin?.id ?? null;
  await insertSupportCaseEvent({ supportCaseId: caseId, actorAdminId, eventType: "CLOSED", note });
  await recordAudit(req, AUDIT_ACTIONS.SUPPORT_CASE_CLOSED, {
    actorAdminId,
    targetType: "support_case",
    targetId: caseId,
    metadata: { note },
  });

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const addSupportCaseNoteHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { note } = req.body as { note: string };

  const existing = await findSupportCaseById(caseId);
  if (!existing) {
    throw new AppError("SUPPORT_CASE_NOT_FOUND", "Support case not found.", 404);
  }

  const actorAdminId = req.admin?.id ?? null;
  const event = await insertSupportCaseEvent({
    supportCaseId: caseId,
    actorAdminId,
    eventType: "NOTE_ADDED",
    note,
  });
  await recordAudit(req, AUDIT_ACTIONS.SUPPORT_CASE_NOTE_ADDED, {
    actorAdminId,
    targetType: "support_case",
    targetId: caseId,
    metadata: { note },
  });

  sendSuccess(res, 201, { event: serializeEvent(event) });
};
