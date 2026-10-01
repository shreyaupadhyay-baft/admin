import { Router } from "express";
import {
  createSecurityEventHandler,
  getSecurityEventHandler,
  listSecurityEventsHandler,
  updateSecurityEventStatusHandler,
} from "../controllers/securityEvent.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import { createSecurityEventSchema, updateSecurityEventStatusSchema } from "../validation/securityEvent.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const securityEventRouter = Router();

securityEventRouter.use(authenticate);

securityEventRouter.get("/", requirePermission(PERMISSIONS.SECURITY_EVENTS_READ), listSecurityEventsHandler);
securityEventRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_EVENTS_READ),
  getSecurityEventHandler,
);
securityEventRouter.post(
  "/",
  requirePermission(PERMISSIONS.SECURITY_EVENTS_CREATE),
  validateBody(createSecurityEventSchema),
  createSecurityEventHandler,
);
securityEventRouter.patch(
  "/:id/status",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_EVENTS_STATUS_UPDATE),
  validateBody(updateSecurityEventStatusSchema),
  updateSecurityEventStatusHandler,
);
