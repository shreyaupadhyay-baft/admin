import { Router } from "express";
import { listAuditLogsHandler } from "../controllers/auditLog.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const auditLogRouter = Router();

auditLogRouter.use(authenticate);
auditLogRouter.get("/", requirePermission(PERMISSIONS.AUDIT_LOGS_READ), listAuditLogsHandler);
