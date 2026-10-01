import type { Request, Response } from "express";
import { sendSuccess } from "../utils/response.js";
import { listAuditLogs } from "../repositories/auditLog.repository.js";

export const listAuditLogsHandler = async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const logs = await listAuditLogs(limit, offset);

  sendSuccess(
    res,
    200,
    {
      auditLogs: logs.map((log) => ({
        id: log.id,
        actorAdminId: log.actor_admin_id,
        action: log.action,
        targetType: log.target_type,
        targetId: log.target_id,
        requestId: log.request_id,
        correlationId: log.correlation_id,
        metadata: log.metadata,
        createdAt: log.created_at,
      })),
    },
    { limit, offset },
  );
};
