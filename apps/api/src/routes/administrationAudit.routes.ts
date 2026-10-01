import { Router } from "express";
import { getAdministrationAuditDetailHandler, listAdministrationAuditHandler } from "../controllers/administrationAudit.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const administrationAuditRouter = Router();

administrationAuditRouter.use(authenticate);

administrationAuditRouter.get(
  "/",
  requirePermission(PERMISSIONS.ADMINISTRATION_AUDIT_READ),
  listAdministrationAuditHandler,
);
administrationAuditRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_AUDIT_READ),
  getAdministrationAuditDetailHandler,
);
