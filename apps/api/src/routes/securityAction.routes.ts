import { Router } from "express";
import {
  approveSecurityActionHandler,
  getSecurityActionHandler,
  listSecurityActionsHandler,
  rejectSecurityActionHandler,
} from "../controllers/securityAction.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import { rejectSecurityActionSchema } from "../validation/securityAction.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const securityActionRouter = Router();

securityActionRouter.use(authenticate);

securityActionRouter.get("/", requirePermission(PERMISSIONS.SECURITY_ACTIONS_READ), listSecurityActionsHandler);
securityActionRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_ACTIONS_READ),
  getSecurityActionHandler,
);
// Self-approval is rejected inside the handler regardless of permission —
// holding security_actions.approve is necessary but not sufficient.
securityActionRouter.post(
  "/:id/approve",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_ACTIONS_APPROVE),
  approveSecurityActionHandler,
);
securityActionRouter.post(
  "/:id/reject",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_ACTIONS_REJECT),
  validateBody(rejectSecurityActionSchema),
  rejectSecurityActionHandler,
);
