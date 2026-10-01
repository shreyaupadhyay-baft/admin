import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  assignSecurityCase,
  closeSecurityCase,
  createSecurityCase,
  findSecurityCaseById,
  listSecurityCases,
  resolveSecurityCase,
  updateSecurityCaseFields,
  updateSecurityCaseSeverity,
  updateSecurityCaseStatus,
  type SecurityCaseRow,
} from "../repositories/securityCase.repository.js";
import {
  insertSecurityCaseEvent,
  listSecurityCaseEvents,
  type SecurityCaseEventRow,
} from "../repositories/securityCaseEvent.repository.js";
import {
  insertSecurityCaseEvidence,
  listSecurityCaseEvidence,
  type SecurityCaseEvidenceRow,
} from "../repositories/securityCaseEvidence.repository.js";
import { findUserById } from "../repositories/user.repository.js";
import { findDeviceById } from "../repositories/device.repository.js";
import { findAdminUserById } from "../repositories/adminUser.repository.js";
import { listSecurityCasesQuerySchema } from "../validation/securityCase.schema.js";
import { notifyAdmin } from "../services/notification.service.js";
import { NOTIFICATION_TYPES } from "../constants/notificationTypes.js";

const serializeCase = (c: SecurityCaseRow) => ({
  id: c.id,
  caseNumber: c.case_number,
  title: c.title,
  category: c.category,
  severity: c.severity,
  status: c.status,
  userId: c.user_id,
  deviceId: c.device_id,
  assignedAdminId: c.assigned_admin_id,
  summary: c.summary,
  source: c.source,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
  resolvedAt: c.resolved_at,
  closedAt: c.closed_at,
});

const serializeEvent = (e: SecurityCaseEventRow) => ({
  id: e.id,
  actorAdminId: e.actor_admin_id,
  eventType: e.event_type,
  note: e.note,
  metadata: e.metadata,
  createdAt: e.created_at,
});

const serializeEvidence = (e: SecurityCaseEvidenceRow) => ({
  id: e.id,
  evidenceType: e.evidence_type,
  source: e.source,
  externalReference: e.external_reference,
  description: e.description,
  metadata: e.metadata,
  createdBy: e.created_by,
  createdAt: e.created_at,
});

const notFound = () => new AppError("SECURITY_CASE_NOT_FOUND", "Security case not found.", 404);

export const listSecurityCasesHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listSecurityCasesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, status, severity, category, assignedAdminId, userId, search } = parsed.data;
  const cases = await listSecurityCases({ limit, offset, status, severity, category, assignedAdminId, userId, search });

  sendSuccess(res, 200, { cases: cases.map(serializeCase) }, { limit, offset });
};

export const getSecurityCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const securityCase = await findSecurityCaseById(req.params.id as string);
  if (!securityCase) throw notFound();

  const [events, evidence] = await Promise.all([
    listSecurityCaseEvents(securityCase.id),
    listSecurityCaseEvidence(securityCase.id),
  ]);

  sendSuccess(res, 200, {
    case: serializeCase(securityCase),
    events: events.map(serializeEvent),
    evidence: evidence.map(serializeEvidence),
  });
};

export const createSecurityCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const { title, category, severity, userId, deviceId, summary, source } = req.body as {
    title: string;
    category: string;
    severity: string;
    userId?: string;
    deviceId?: string;
    summary: string;
    source: string;
  };

  if (userId !== undefined) {
    const user = await findUserById(userId);
    if (!user) throw new AppError("USER_NOT_FOUND", "The referenced user does not exist.", 400);
  }
  if (deviceId !== undefined) {
    const device = await findDeviceById(deviceId);
    if (!device) throw new AppError("DEVICE_NOT_FOUND", "The referenced device does not exist.", 400);
  }

  const created = await createSecurityCase({ title, category, severity, userId, deviceId, summary, source });
  const actorAdminId = req.admin?.id ?? null;

  await insertSecurityCaseEvent({
    securityCaseId: created.id,
    actorAdminId,
    eventType: "CASE_CREATED",
    metadata: { title, category, severity },
  });
  await recordAudit(req, AUDIT_ACTIONS.SECURITY_CASE_CREATED, {
    actorAdminId,
    targetType: "security_case",
    targetId: created.id,
    metadata: { caseNumber: created.case_number, title, category, severity },
  });

  sendSuccess(res, 201, { case: serializeCase(created) });
};

export const updateSecurityCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { title, summary, category } = req.body as { title?: string; summary?: string; category?: string };

  const updated = await updateSecurityCaseFields(caseId, { title, summary, category });
  if (!updated) throw notFound();

  await recordAudit(req, AUDIT_ACTIONS.SECURITY_CASE_UPDATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "security_case",
    targetId: caseId,
    metadata: { title, category },
  });

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const assignSecurityCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { adminId } = req.body as { adminId: string | null };

  const existing = await findSecurityCaseById(caseId);
  if (!existing) throw notFound();

  if (adminId !== null) {
    const targetAdmin = await findAdminUserById(adminId);
    if (!targetAdmin) throw new AppError("ADMIN_NOT_FOUND", "The admin to assign does not exist.", 400);
  }

  const previousAdminId = existing.assigned_admin_id;
  const updated = await assignSecurityCase(caseId, adminId);
  if (!updated) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  const isUnassigning = adminId === null;

  const event = await insertSecurityCaseEvent({
    securityCaseId: caseId,
    actorAdminId,
    eventType: isUnassigning ? "CASE_UNASSIGNED" : "CASE_ASSIGNED",
    metadata: { previousAdminId, newAdminId: adminId },
  });
  await recordAudit(req, isUnassigning ? AUDIT_ACTIONS.SECURITY_CASE_UNASSIGNED : AUDIT_ACTIONS.SECURITY_CASE_ASSIGNED, {
    actorAdminId,
    targetType: "security_case",
    targetId: caseId,
    metadata: { previousAdminId, newAdminId: adminId },
  });

  if (!isUnassigning && adminId !== actorAdminId) {
    await notifyAdmin(adminId, {
      type: NOTIFICATION_TYPES.SECURITY_CASE_ASSIGNED,
      title: "Security case assigned to you",
      message: `${updated.case_number} — ${updated.title}`,
      severity: "info",
      resourceType: "security_case",
      resourceId: caseId,
      metadata: { caseNumber: updated.case_number },
      dedupKey: `security_case_assigned:${event.id}`,
    });
  }

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const updateSecurityCaseStatusHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { status, reason } = req.body as { status: string; reason?: string };

  const existing = await findSecurityCaseById(caseId);
  if (!existing) throw notFound();
  if (existing.status === "resolved" || existing.status === "closed") {
    throw new AppError(
      "INVALID_TRANSITION",
      `Cannot change status on a case that is already '${existing.status}'.`,
      409,
    );
  }

  const updated = await updateSecurityCaseStatus(caseId, status);
  if (!updated) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  await insertSecurityCaseEvent({
    securityCaseId: caseId,
    actorAdminId,
    eventType: "STATUS_CHANGED",
    metadata: { previousStatus: existing.status, newStatus: status, reason },
  });
  await recordAudit(req, AUDIT_ACTIONS.SECURITY_CASE_STATUS_CHANGED, {
    actorAdminId,
    targetType: "security_case",
    targetId: caseId,
    metadata: { previousStatus: existing.status, newStatus: status, reason },
  });

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const updateSecurityCaseSeverityHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { severity, reason } = req.body as { severity: string; reason?: string };

  const existing = await findSecurityCaseById(caseId);
  if (!existing) throw notFound();

  const updated = await updateSecurityCaseSeverity(caseId, severity);
  if (!updated) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  await insertSecurityCaseEvent({
    securityCaseId: caseId,
    actorAdminId,
    eventType: "SEVERITY_CHANGED",
    metadata: { previousSeverity: existing.severity, newSeverity: severity, reason },
  });
  await recordAudit(req, AUDIT_ACTIONS.SECURITY_CASE_SEVERITY_CHANGED, {
    actorAdminId,
    targetType: "security_case",
    targetId: caseId,
    metadata: { previousSeverity: existing.severity, newSeverity: severity, reason },
  });

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const resolveSecurityCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { note } = req.body as { note?: string };

  const existing = await findSecurityCaseById(caseId);
  if (!existing) throw notFound();
  if (existing.status === "resolved" || existing.status === "closed") {
    throw new AppError("INVALID_TRANSITION", `Cannot resolve a case that is already '${existing.status}'.`, 409);
  }

  const updated = await resolveSecurityCase(caseId);
  if (!updated) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  await insertSecurityCaseEvent({ securityCaseId: caseId, actorAdminId, eventType: "CASE_RESOLVED", note });
  await recordAudit(req, AUDIT_ACTIONS.SECURITY_CASE_RESOLVED, {
    actorAdminId,
    targetType: "security_case",
    targetId: caseId,
    metadata: { note },
  });

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const closeSecurityCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { note } = req.body as { note?: string };

  const existing = await findSecurityCaseById(caseId);
  if (!existing) throw notFound();
  if (existing.status === "closed") {
    throw new AppError("INVALID_TRANSITION", "This case is already closed.", 409);
  }

  const updated = await closeSecurityCase(caseId);
  if (!updated) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  await insertSecurityCaseEvent({ securityCaseId: caseId, actorAdminId, eventType: "CASE_CLOSED", note });
  await recordAudit(req, AUDIT_ACTIONS.SECURITY_CASE_CLOSED, {
    actorAdminId,
    targetType: "security_case",
    targetId: caseId,
    metadata: { note },
  });

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const addSecurityCaseNoteHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { note } = req.body as { note: string };

  const existing = await findSecurityCaseById(caseId);
  if (!existing) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  const event = await insertSecurityCaseEvent({ securityCaseId: caseId, actorAdminId, eventType: "NOTE_ADDED", note });
  await recordAudit(req, AUDIT_ACTIONS.SECURITY_CASE_NOTE_ADDED, {
    actorAdminId,
    targetType: "security_case",
    targetId: caseId,
    metadata: { note },
  });

  sendSuccess(res, 201, { event: serializeEvent(event) });
};

export const addSecurityCaseEvidenceHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { evidenceType, source, externalReference, description, metadata } = req.body as {
    evidenceType: string;
    source: string;
    externalReference?: string;
    description: string;
    metadata: Record<string, unknown>;
  };

  const existing = await findSecurityCaseById(caseId);
  if (!existing) throw notFound();

  const actorAdminId = req.admin?.id as string;
  const evidence = await insertSecurityCaseEvidence({
    caseId,
    evidenceType,
    source,
    externalReference,
    description,
    metadata,
    createdBy: actorAdminId,
  });

  await insertSecurityCaseEvent({
    securityCaseId: caseId,
    actorAdminId,
    eventType: "EVIDENCE_ADDED",
    metadata: { evidenceType, source },
  });
  await recordAudit(req, AUDIT_ACTIONS.SECURITY_CASE_EVIDENCE_ADDED, {
    actorAdminId,
    targetType: "security_case",
    targetId: caseId,
    metadata: { evidenceType, source, externalReference },
  });

  sendSuccess(res, 201, { evidence: serializeEvidence(evidence) });
};
