import { Router } from "express";
import {
  addRiskCaseDecisionHandler,
  addRiskCaseEvidenceHandler,
  addRiskCaseNoteHandler,
  assignRiskCaseHandler,
  closeRiskCaseHandler,
  createRiskCaseHandler,
  getRiskCaseHandler,
  listRiskCasesHandler,
  resolveRiskCaseHandler,
  updateRiskCaseHandler,
  updateRiskCaseSeverityHandler,
  updateRiskCaseStatusHandler,
} from "../controllers/riskCase.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import {
  addRiskCaseDecisionSchema,
  addRiskCaseEvidenceSchema,
  addRiskCaseNoteSchema,
  assignRiskCaseSchema,
  closeRiskCaseSchema,
  createRiskCaseSchema,
  resolveRiskCaseSchema,
  updateRiskCaseSchema,
  updateRiskCaseSeveritySchema,
  updateRiskCaseStatusSchema,
} from "../validation/riskCase.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const riskCaseRouter = Router();

riskCaseRouter.use(authenticate);

riskCaseRouter.get("/", requirePermission(PERMISSIONS.RISK_CASES_READ), listRiskCasesHandler);
riskCaseRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_CASES_READ),
  getRiskCaseHandler,
);
riskCaseRouter.post(
  "/",
  requirePermission(PERMISSIONS.RISK_CASES_CREATE),
  validateBody(createRiskCaseSchema),
  createRiskCaseHandler,
);
riskCaseRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_CASES_UPDATE),
  validateBody(updateRiskCaseSchema),
  updateRiskCaseHandler,
);
riskCaseRouter.post(
  "/:id/assign",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_CASES_ASSIGN),
  validateBody(assignRiskCaseSchema),
  assignRiskCaseHandler,
);
riskCaseRouter.post(
  "/:id/status",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_CASES_STATUS_UPDATE),
  validateBody(updateRiskCaseStatusSchema),
  updateRiskCaseStatusHandler,
);
riskCaseRouter.post(
  "/:id/severity",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_CASES_SEVERITY_UPDATE),
  validateBody(updateRiskCaseSeveritySchema),
  updateRiskCaseSeverityHandler,
);
riskCaseRouter.post(
  "/:id/resolve",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_CASES_RESOLVE),
  validateBody(resolveRiskCaseSchema),
  resolveRiskCaseHandler,
);
riskCaseRouter.post(
  "/:id/close",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_CASES_CLOSE),
  validateBody(closeRiskCaseSchema),
  closeRiskCaseHandler,
);
riskCaseRouter.post(
  "/:id/notes",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_CASES_ADD_NOTE),
  validateBody(addRiskCaseNoteSchema),
  addRiskCaseNoteHandler,
);
riskCaseRouter.post(
  "/:id/evidence",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_CASES_ADD_EVIDENCE),
  validateBody(addRiskCaseEvidenceSchema),
  addRiskCaseEvidenceHandler,
);
riskCaseRouter.post(
  "/:id/decisions",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.RISK_CASES_DECIDE),
  validateBody(addRiskCaseDecisionSchema),
  addRiskCaseDecisionHandler,
);
