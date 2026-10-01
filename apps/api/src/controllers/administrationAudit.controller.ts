import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { findAuditLogById, listAuditLogsFiltered, type AuditLogWithActorRow } from "../repositories/auditLog.repository.js";
import { listAdministrationAuditQuerySchema } from "../validation/administration.schema.js";

// Defense-in-depth only: every recordAudit() call site in this codebase is
// already disciplined never to pass secret-shaped values into metadata (see
// audit.service.ts's own comment), and an audit of every call site as of
// this slice confirms that holds. This redacts by KEY NAME regardless, so a
// future producer's mistake is still caught at read time rather than shown
// verbatim in the Audit UI forever. It never rewrites the stored row.
const SENSITIVE_KEY_PATTERN = /password|token|secret|credential|authorization|api[-_]?key|hash/i;

const redactMetadata = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactMetadata);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactMetadata(val),
      ]),
    );
  }
  return value;
};

const serializeAuditLog = (log: AuditLogWithActorRow) => ({
  id: log.id,
  actorAdminId: log.actor_admin_id,
  actorEmail: log.actor_email,
  actorFullName: log.actor_full_name,
  action: log.action,
  targetType: log.target_type,
  targetId: log.target_id,
  requestId: log.request_id,
  correlationId: log.correlation_id,
  metadata: redactMetadata(log.metadata),
  createdAt: log.created_at,
});

// A permission-controlled read view over the existing audit_logs table —
// not a second audit system. Never exposes anything beyond what
// audit.service.ts already wrote (which itself never stores secrets).
export const listAdministrationAuditHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listAdministrationAuditQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, actorAdminId, action, targetType, targetId, dateFrom, dateTo, search } = parsed.data;
  const { rows, total } = await listAuditLogsFiltered({
    limit,
    offset,
    actorAdminId,
    action,
    targetType,
    targetId,
    dateFrom,
    dateTo,
    search,
  });

  sendSuccess(
    res,
    200,
    { auditLogs: rows.map(serializeAuditLog) },
    { limit, offset, total, hasNext: offset + rows.length < total },
  );
};

export const getAdministrationAuditDetailHandler = async (req: Request, res: Response): Promise<void> => {
  const log = await findAuditLogById(req.params.id as string);
  if (!log) {
    throw new AppError("AUDIT_LOG_NOT_FOUND", "Audit event not found.", 404);
  }

  sendSuccess(res, 200, { auditLog: serializeAuditLog(log) });
};
