import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  assignRiskCase,
  closeRiskCase,
  createRiskCase,
  findRiskCaseById,
  listRiskCases,
  resolveRiskCase,
  updateRiskCaseFields,
  updateRiskCaseSeverity,
  updateRiskCaseStatus,
  type RiskCaseRow,
} from "../repositories/riskCase.repository.js";
import {
  insertRiskCaseEvent,
  listRiskCaseEvents,
  type RiskCaseEventRow,
} from "../repositories/riskCaseEvent.repository.js";
import {
  insertRiskCaseEvidence,
  listRiskCaseEvidence,
  type RiskCaseEvidenceRow,
} from "../repositories/riskCaseEvidence.repository.js";
import {
  insertRiskCaseDecision,
  listRiskCaseDecisions,
  type RiskCaseDecisionRow,
} from "../repositories/riskCaseDecision.repository.js";
import { findUserById } from "../repositories/user.repository.js";
import { findAdminUserById } from "../repositories/adminUser.repository.js";
import { listRiskCasesQuerySchema } from "../validation/riskCase.schema.js";
import { notifyAdmin } from "../services/notification.service.js";
import { NOTIFICATION_TYPES } from "../constants/notificationTypes.js";

const serializeCase = (c: RiskCaseRow) => ({
  id: c.id,
  caseNumber: c.case_number,
  title: c.title,
  category: c.category,
  severity: c.severity,
  status: c.status,
  userId: c.user_id,
  assignedAdminId: c.assigned_admin_id,
  summary: c.summary,
  source: c.source,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
  resolvedAt: c.resolved_at,
  closedAt: c.closed_at,
});

const serializeEvent = (e: RiskCaseEventRow) => ({
  id: e.id,
  actorAdminId: e.actor_admin_id,
  eventType: e.event_type,
  note: e.note,
  metadata: e.metadata,
  createdAt: e.created_at,
});

const serializeEvidence = (e: RiskCaseEvidenceRow) => ({
  id: e.id,
  evidenceType: e.evidence_type,
  source: e.source,
  externalReference: e.external_reference,
  description: e.description,
  metadata: e.metadata,
  createdBy: e.created_by,
  createdAt: e.created_at,
});

const serializeDecision = (d: RiskCaseDecisionRow) => ({
  id: d.id,
  decision: d.decision,
  reason: d.reason,
  createdBy: d.created_by,
  createdAt: d.created_at,
});

const notFound = () => new AppError("RISK_CASE_NOT_FOUND", "Risk case not found.", 404);

export const listRiskCasesHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listRiskCasesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, status, severity, category, assignedAdminId, userId, search } = parsed.data;
  const cases = await listRiskCases({ limit, offset, status, severity, category, assignedAdminId, userId, search });

  sendSuccess(res, 200, { cases: cases.map(serializeCase) }, { limit, offset });
};

export const getRiskCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const riskCase = await findRiskCaseById(req.params.id as string);
  if (!riskCase) throw notFound();

  const [events, evidence, decisions] = await Promise.all([
    listRiskCaseEvents(riskCase.id),
    listRiskCaseEvidence(riskCase.id),
    listRiskCaseDecisions(riskCase.id),
  ]);

  sendSuccess(res, 200, {
    case: serializeCase(riskCase),
    events: events.map(serializeEvent),
    evidence: evidence.map(serializeEvidence),
    decisions: decisions.map(serializeDecision),
  });
};

export const createRiskCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const { title, category, severity, userId, summary, source } = req.body as {
    title: string;
    category: string;
    severity: string;
    userId?: string;
    summary: string;
    source: string;
  };

  if (userId !== undefined) {
    const user = await findUserById(userId);
    if (!user) throw new AppError("USER_NOT_FOUND", "The referenced user does not exist.", 400);
  }

  const created = await createRiskCase({ title, category, severity, userId, summary, source });
  const actorAdminId = req.admin?.id ?? null;

  await insertRiskCaseEvent({
    riskCaseId: created.id,
    actorAdminId,
    eventType: "CASE_CREATED",
    metadata: { title, category, severity },
  });
  await recordAudit(req, AUDIT_ACTIONS.RISK_CASE_CREATED, {
    actorAdminId,
    targetType: "risk_case",
    targetId: created.id,
    metadata: { caseNumber: created.case_number, title, category, severity },
  });

  sendSuccess(res, 201, { case: serializeCase(created) });
};

export const updateRiskCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { title, summary, category } = req.body as { title?: string; summary?: string; category?: string };

  const updated = await updateRiskCaseFields(caseId, { title, summary, category });
  if (!updated) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  await recordAudit(req, AUDIT_ACTIONS.RISK_CASE_UPDATED, {
    actorAdminId,
    targetType: "risk_case",
    targetId: caseId,
    metadata: { title, category },
  });

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const assignRiskCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { adminId } = req.body as { adminId: string | null };

  const existing = await findRiskCaseById(caseId);
  if (!existing) throw notFound();

  if (adminId !== null) {
    const targetAdmin = await findAdminUserById(adminId);
    if (!targetAdmin) throw new AppError("ADMIN_NOT_FOUND", "The admin to assign does not exist.", 400);
  }

  const previousAdminId = existing.assigned_admin_id;
  const updated = await assignRiskCase(caseId, adminId);
  if (!updated) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  const isUnassigning = adminId === null;

  const event = await insertRiskCaseEvent({
    riskCaseId: caseId,
    actorAdminId,
    eventType: isUnassigning ? "CASE_UNASSIGNED" : "CASE_ASSIGNED",
    metadata: { previousAdminId, newAdminId: adminId },
  });
  await recordAudit(req, isUnassigning ? AUDIT_ACTIONS.RISK_CASE_UNASSIGNED : AUDIT_ACTIONS.RISK_CASE_ASSIGNED, {
    actorAdminId,
    targetType: "risk_case",
    targetId: caseId,
    metadata: { previousAdminId, newAdminId: adminId },
  });

  if (!isUnassigning && adminId !== actorAdminId) {
    await notifyAdmin(adminId, {
      type: NOTIFICATION_TYPES.RISK_CASE_ASSIGNED,
      title: "Risk case assigned to you",
      message: `${updated.case_number} — ${updated.title}`,
      severity: "info",
      resourceType: "risk_case",
      resourceId: caseId,
      metadata: { caseNumber: updated.case_number },
      dedupKey: `risk_case_assigned:${event.id}`,
    });
  }

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const updateRiskCaseStatusHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { status, reason } = req.body as { status: string; reason?: string };

  const existing = await findRiskCaseById(caseId);
  if (!existing) throw notFound();

  const updated = await updateRiskCaseStatus(caseId, status);
  if (!updated) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  const event = await insertRiskCaseEvent({
    riskCaseId: caseId,
    actorAdminId,
    eventType: "STATUS_CHANGED",
    metadata: { previousStatus: existing.status, newStatus: status, reason },
  });
  await recordAudit(req, AUDIT_ACTIONS.RISK_CASE_STATUS_CHANGED, {
    actorAdminId,
    targetType: "risk_case",
    targetId: caseId,
    metadata: { previousStatus: existing.status, newStatus: status, reason },
  });

  if (updated.assigned_admin_id && updated.assigned_admin_id !== actorAdminId) {
    await notifyAdmin(updated.assigned_admin_id, {
      type: NOTIFICATION_TYPES.RISK_CASE_STATUS_CHANGED,
      title: "Risk case status changed",
      message: `${updated.case_number} is now '${status}'`,
      severity: "info",
      resourceType: "risk_case",
      resourceId: caseId,
      metadata: { caseNumber: updated.case_number, previousStatus: existing.status, newStatus: status },
      dedupKey: `risk_case_status_changed:${event.id}`,
    });
  }

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const updateRiskCaseSeverityHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { severity, reason } = req.body as { severity: string; reason?: string };

  const existing = await findRiskCaseById(caseId);
  if (!existing) throw notFound();

  const updated = await updateRiskCaseSeverity(caseId, severity);
  if (!updated) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  await insertRiskCaseEvent({
    riskCaseId: caseId,
    actorAdminId,
    eventType: "SEVERITY_CHANGED",
    metadata: { previousSeverity: existing.severity, newSeverity: severity, reason },
  });
  await recordAudit(req, AUDIT_ACTIONS.RISK_CASE_SEVERITY_CHANGED, {
    actorAdminId,
    targetType: "risk_case",
    targetId: caseId,
    metadata: { previousSeverity: existing.severity, newSeverity: severity, reason },
  });

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const resolveRiskCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { note } = req.body as { note?: string };

  const existing = await findRiskCaseById(caseId);
  if (!existing) throw notFound();

  const updated = await resolveRiskCase(caseId);
  if (!updated) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  await insertRiskCaseEvent({ riskCaseId: caseId, actorAdminId, eventType: "CASE_RESOLVED", note });
  await recordAudit(req, AUDIT_ACTIONS.RISK_CASE_RESOLVED, {
    actorAdminId,
    targetType: "risk_case",
    targetId: caseId,
    metadata: { note },
  });

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const closeRiskCaseHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { note } = req.body as { note?: string };

  const existing = await findRiskCaseById(caseId);
  if (!existing) throw notFound();

  const updated = await closeRiskCase(caseId);
  if (!updated) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  await insertRiskCaseEvent({ riskCaseId: caseId, actorAdminId, eventType: "CASE_CLOSED", note });
  await recordAudit(req, AUDIT_ACTIONS.RISK_CASE_CLOSED, {
    actorAdminId,
    targetType: "risk_case",
    targetId: caseId,
    metadata: { note },
  });

  sendSuccess(res, 200, { case: serializeCase(updated) });
};

export const addRiskCaseNoteHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { note } = req.body as { note: string };

  const existing = await findRiskCaseById(caseId);
  if (!existing) throw notFound();

  const actorAdminId = req.admin?.id ?? null;
  const event = await insertRiskCaseEvent({ riskCaseId: caseId, actorAdminId, eventType: "NOTE_ADDED", note });
  await recordAudit(req, AUDIT_ACTIONS.RISK_CASE_NOTE_ADDED, {
    actorAdminId,
    targetType: "risk_case",
    targetId: caseId,
    metadata: { note },
  });

  sendSuccess(res, 201, { event: serializeEvent(event) });
};

export const addRiskCaseEvidenceHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { evidenceType, source, externalReference, description, metadata } = req.body as {
    evidenceType: string;
    source: string;
    externalReference?: string;
    description: string;
    metadata: Record<string, unknown>;
  };

  const existing = await findRiskCaseById(caseId);
  if (!existing) throw notFound();

  const actorAdminId = req.admin?.id as string;
  const evidence = await insertRiskCaseEvidence({
    caseId,
    evidenceType,
    source,
    externalReference,
    description,
    metadata,
    createdBy: actorAdminId,
  });

  await insertRiskCaseEvent({
    riskCaseId: caseId,
    actorAdminId,
    eventType: "EVIDENCE_ADDED",
    metadata: { evidenceType, source },
  });
  await recordAudit(req, AUDIT_ACTIONS.RISK_CASE_EVIDENCE_ADDED, {
    actorAdminId,
    targetType: "risk_case",
    targetId: caseId,
    metadata: { evidenceType, source, externalReference },
  });

  sendSuccess(res, 201, { evidence: serializeEvidence(evidence) });
};

export const addRiskCaseDecisionHandler = async (req: Request, res: Response): Promise<void> => {
  const caseId = req.params.id as string;
  const { decision, reason } = req.body as { decision: string; reason: string };

  const existing = await findRiskCaseById(caseId);
  if (!existing) throw notFound();

  const actorAdminId = req.admin?.id as string;
  const decisionRow = await insertRiskCaseDecision({ caseId, decision, reason, createdBy: actorAdminId });

  await insertRiskCaseEvent({
    riskCaseId: caseId,
    actorAdminId,
    eventType: "DECISION_RECORDED",
    metadata: { decision, reason },
  });
  await recordAudit(req, AUDIT_ACTIONS.RISK_CASE_DECISION_RECORDED, {
    actorAdminId,
    targetType: "risk_case",
    targetId: caseId,
    metadata: { decision, reason },
  });

  sendSuccess(res, 201, { decision: serializeDecision(decisionRow) });
};
