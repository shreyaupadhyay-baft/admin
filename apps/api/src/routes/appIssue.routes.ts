import { Router } from "express";
import {
  assignAppIssueHandler,
  createAppIssueHandler,
  getAppIssueHandler,
  listAppIssuesHandler,
  resolveAppIssueHandler,
  updateAppIssueHandler,
} from "../controllers/appIssue.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import {
  assignAppIssueSchema,
  createAppIssueSchema,
  updateAppIssueSchema,
} from "../validation/appIssue.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const appIssueRouter = Router();

appIssueRouter.use(authenticate);

appIssueRouter.get("/", requirePermission(PERMISSIONS.APP_ISSUES_READ), listAppIssuesHandler);
appIssueRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.APP_ISSUES_READ),
  getAppIssueHandler,
);
appIssueRouter.post(
  "/",
  requirePermission(PERMISSIONS.APP_ISSUES_CREATE),
  validateBody(createAppIssueSchema),
  createAppIssueHandler,
);
appIssueRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.APP_ISSUES_UPDATE),
  validateBody(updateAppIssueSchema),
  updateAppIssueHandler,
);
appIssueRouter.post(
  "/:id/assign",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.APP_ISSUES_ASSIGN),
  validateBody(assignAppIssueSchema),
  assignAppIssueHandler,
);
appIssueRouter.post(
  "/:id/resolve",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.APP_ISSUES_RESOLVE),
  resolveAppIssueHandler,
);
