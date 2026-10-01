import { Router } from "express";
import {
  addSupportCaseNoteHandler,
  assignSupportCaseHandler,
  closeSupportCaseHandler,
  createSupportCaseHandler,
  getSupportCaseHandler,
  listSupportCasesHandler,
  resolveSupportCaseHandler,
  updateSupportCaseHandler,
} from "../controllers/supportCase.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import {
  addSupportCaseNoteSchema,
  assignSupportCaseSchema,
  closeSupportCaseSchema,
  createSupportCaseSchema,
  resolveSupportCaseSchema,
  updateSupportCaseSchema,
} from "../validation/supportCase.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const supportCaseRouter = Router();

supportCaseRouter.use(authenticate);

supportCaseRouter.get("/", requirePermission(PERMISSIONS.SUPPORT_CASES_READ), listSupportCasesHandler);
supportCaseRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SUPPORT_CASES_READ),
  getSupportCaseHandler,
);
supportCaseRouter.post(
  "/",
  requirePermission(PERMISSIONS.SUPPORT_CASES_CREATE),
  validateBody(createSupportCaseSchema),
  createSupportCaseHandler,
);
supportCaseRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SUPPORT_CASES_UPDATE),
  validateBody(updateSupportCaseSchema),
  updateSupportCaseHandler,
);
supportCaseRouter.post(
  "/:id/assign",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SUPPORT_CASES_ASSIGN),
  validateBody(assignSupportCaseSchema),
  assignSupportCaseHandler,
);
supportCaseRouter.post(
  "/:id/resolve",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SUPPORT_CASES_RESOLVE),
  validateBody(resolveSupportCaseSchema),
  resolveSupportCaseHandler,
);
supportCaseRouter.post(
  "/:id/close",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SUPPORT_CASES_CLOSE),
  validateBody(closeSupportCaseSchema),
  closeSupportCaseHandler,
);
supportCaseRouter.post(
  "/:id/notes",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.SUPPORT_CASES_ADD_NOTE),
  validateBody(addSupportCaseNoteSchema),
  addSupportCaseNoteHandler,
);
