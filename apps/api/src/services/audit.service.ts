import type { Request } from "express";
import { insertAuditLog } from "../repositories/auditLog.repository.js";
import { logWithContext } from "../utils/logger.js";
import type { AuditAction } from "../constants/auditActions.js";

// Never pass password/token/session-secret values in `metadata` — audit rows
// are read by humans (compliance/security review) and must stay safe to show.
export const recordAudit = async (
  req: Request,
  action: AuditAction,
  params: {
    actorAdminId: string | null;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> => {
  try {
    await insertAuditLog({
      actorAdminId: params.actorAdminId,
      action,
      targetType: params.targetType,
      targetId: params.targetId,
      requestId: req.requestId,
      correlationId: req.correlationId,
      metadata: params.metadata,
    });
  } catch (err) {
    // Audit logging must never break the request it's describing.
    logWithContext("error", "audit_log_write_failed", {
      requestId: req.requestId,
      correlationId: req.correlationId,
      action,
      error: err instanceof Error ? { message: err.message } : err,
    });
  }
};
