import { Router } from "express";
import {
  addSecurityCaseEvidenceHandler,
  addSecurityCaseNoteHandler,
  assignSecurityCaseHandler,
  closeSecurityCaseHandler,
  createSecurityCaseHandler,
  getSecurityCaseHandler,
  listSecurityCasesHandler,
  resolveSecurityCaseHandler,
  updateSecurityCaseHandler,
  updateSecurityCaseSeverityHandler,
  updateSecurityCaseStatusHandler,
} from "../controllers/securityCase.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import {
  addSecurityCaseEvidenceSchema,
  addSecurityCaseNoteSchema,
  assignSecurityCaseSchema,
  closeSecurityCaseSchema,
  createSecurityCaseSchema,
  resolveSecurityCaseSchema,
  updateSecurityCaseSchema,
  updateSecurityCaseSeveritySchema,
  updateSecurityCaseStatusSchema,
} from "../validation/securityCase.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const securityCaseRouter = Router();

securityCaseRouter.use(authenticate);

securityCaseRouter.get("/", requirePermission(PERMISSIONS.SECURITY_CASES_READ), listSecurityCasesHandler);
securityCaseRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_CASES_READ),
  getSecurityCaseHandler,
);
securityCaseRouter.post(
  "/",
  requirePermission(PERMISSIONS.SECURITY_CASES_CREATE),
  validateBody(createSecurityCaseSchema),
  createSecurityCaseHandler,
);
securityCaseRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_CASES_UPDATE),
  validateBody(updateSecurityCaseSchema),
  updateSecurityCaseHandler,
);
securityCaseRouter.post(
  "/:id/assign",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_CASES_ASSIGN),
  validateBody(assignSecurityCaseSchema),
  assignSecurityCaseHandler,
);
securityCaseRouter.post(
  "/:id/status",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_CASES_STATUS_UPDATE),
  validateBody(updateSecurityCaseStatusSchema),
  updateSecurityCaseStatusHandler,
);
securityCaseRouter.post(
  "/:id/severity",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_CASES_SEVERITY_UPDATE),
  validateBody(updateSecurityCaseSeveritySchema),
  updateSecurityCaseSeverityHandler,
);
securityCaseRouter.post(
  "/:id/notes",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_CASES_ADD_NOTE),
  validateBody(addSecurityCaseNoteSchema),
  addSecurityCaseNoteHandler,
);
securityCaseRouter.post(
  "/:id/evidence",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_CASES_ADD_EVIDENCE),
  validateBody(addSecurityCaseEvidenceSchema),
  addSecurityCaseEvidenceHandler,
);
securityCaseRouter.post(
  "/:id/resolve",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_CASES_RESOLVE),
  validateBody(resolveSecurityCaseSchema),
  resolveSecurityCaseHandler,
);
securityCaseRouter.post(
  "/:id/close",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SECURITY_CASES_CLOSE),
  validateBody(closeSecurityCaseSchema),
  closeSecurityCaseHandler,
);
