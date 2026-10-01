import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  createRiskSignal,
  findRiskSignalById,
  listRiskSignals,
  updateRiskSignalStatus,
  type RiskSignalRow,
} from "../repositories/riskSignal.repository.js";
import { findUserById } from "../repositories/user.repository.js";
import { listRiskSignalsQuerySchema } from "../validation/riskSignal.schema.js";

const serializeSignal = (s: RiskSignalRow) => ({
  id: s.id,
  signalType: s.signal_type,
  category: s.category,
  severity: s.severity,
  source: s.source,
  status: s.status,
  userId: s.user_id,
  externalReference: s.external_reference,
  description: s.description,
  metadata: s.metadata,
  detectedAt: s.detected_at,
  createdAt: s.created_at,
});

export const listRiskSignalsHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listRiskSignalsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, category, severity, status, source, userId, detectedFrom, detectedTo, sort } = parsed.data;
  const signals = await listRiskSignals({
    limit,
    offset,
    category,
    severity,
    status,
    source,
    userId,
    detectedFrom,
    detectedTo,
    sort,
  });

  sendSuccess(res, 200, { signals: signals.map(serializeSignal) }, { limit, offset });
};

export const getRiskSignalHandler = async (req: Request, res: Response): Promise<void> => {
  const signal = await findRiskSignalById(req.params.id as string);
  if (!signal) throw new AppError("RISK_SIGNAL_NOT_FOUND", "Risk signal not found.", 404);
  sendSuccess(res, 200, { signal: serializeSignal(signal) });
};

export const createRiskSignalHandler = async (req: Request, res: Response): Promise<void> => {
  const { signalType, category, severity, source, userId, externalReference, description, metadata, detectedAt } =
    req.body as {
      signalType: string;
      category: string;
      severity: string;
      source: string;
      userId?: string;
      externalReference?: string;
      description: string;
      metadata: Record<string, unknown>;
      detectedAt?: Date;
    };

  if (userId !== undefined) {
    const user = await findUserById(userId);
    if (!user) {
      throw new AppError("USER_NOT_FOUND", "The referenced user does not exist.", 400);
    }
  }

  const created = await createRiskSignal({
    signalType,
    category,
    severity,
    source,
    userId,
    externalReference,
    description,
    metadata,
    detectedAt,
  });

  await recordAudit(req, AUDIT_ACTIONS.RISK_SIGNAL_CREATED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "risk_signal",
    targetId: created.id,
    metadata: { signalType, category, severity, source },
  });

  sendSuccess(res, 201, { signal: serializeSignal(created) });
};

export const updateRiskSignalStatusHandler = async (req: Request, res: Response): Promise<void> => {
  const signalId = req.params.id as string;
  const { status, reason } = req.body as { status: string; reason?: string };

  const existing = await findRiskSignalById(signalId);
  if (!existing) throw new AppError("RISK_SIGNAL_NOT_FOUND", "Risk signal not found.", 404);

  const updated = await updateRiskSignalStatus(signalId, status);
  if (!updated) throw new AppError("RISK_SIGNAL_NOT_FOUND", "Risk signal not found.", 404);

  await recordAudit(req, AUDIT_ACTIONS.RISK_SIGNAL_STATUS_CHANGED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "risk_signal",
    targetId: signalId,
    metadata: { previousStatus: existing.status, newStatus: status, reason },
  });

  sendSuccess(res, 200, { signal: serializeSignal(updated) });
};
