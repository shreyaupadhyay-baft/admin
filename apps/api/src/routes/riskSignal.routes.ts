import { Router } from "express";
import {
  createRiskSignalHandler,
  getRiskSignalHandler,
  listRiskSignalsHandler,
  updateRiskSignalStatusHandler,
} from "../controllers/riskSignal.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import { createRiskSignalSchema, updateRiskSignalStatusSchema } from "../validation/riskSignal.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const riskSignalRouter = Router();

riskSignalRouter.use(authenticate);

riskSignalRouter.get("/", requirePermission(PERMISSIONS.RISK_SIGNALS_READ), listRiskSignalsHandler);
riskSignalRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_SIGNALS_READ),
  getRiskSignalHandler,
);
riskSignalRouter.post(
  "/",
  requirePermission(PERMISSIONS.RISK_SIGNALS_CREATE),
  validateBody(createRiskSignalSchema),
  createRiskSignalHandler,
);
riskSignalRouter.patch(
  "/:id/status",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_SIGNALS_STATUS_UPDATE),
  validateBody(updateRiskSignalStatusSchema),
  updateRiskSignalStatusHandler,
);
