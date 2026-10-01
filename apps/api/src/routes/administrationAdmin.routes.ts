import { Router } from "express";
import {
  assignRoleAdministrationHandler,
  createAdministrationAdminHandler,
  disableAdministrationAdminHandler,
  enableAdministrationAdminHandler,
  getAdministrationAdminHandler,
  listAdministrationAdminsHandler,
  listAdminSessionsHandler,
  removeRoleAdministrationHandler,
  revokeAdminSessionsHandler,
  updateAdministrationAdminHandler,
} from "../controllers/administrationAdmin.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { assignRoleSchema, createAdminSchema, updateAdminSchema } from "../validation/admin.schema.js";
import { adminRoleParamSchema, idParamSchema } from "../validation/common.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const administrationAdminRouter = Router();

administrationAdminRouter.use(authenticate);

administrationAdminRouter.get(
  "/",
  requirePermission(PERMISSIONS.ADMINISTRATION_ADMINS_READ),
  listAdministrationAdminsHandler,
);
administrationAdminRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ADMINS_READ),
  getAdministrationAdminHandler,
);
administrationAdminRouter.post(
  "/",
  requirePermission(PERMISSIONS.ADMINISTRATION_ADMINS_CREATE),
  validateBody(createAdminSchema),
  createAdministrationAdminHandler,
);
administrationAdminRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ADMINS_UPDATE),
  validateBody(updateAdminSchema),
  updateAdministrationAdminHandler,
);
administrationAdminRouter.post(
  "/:id/disable",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ADMINS_STATUS_UPDATE),
  disableAdministrationAdminHandler,
);
administrationAdminRouter.post(
  "/:id/enable",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ADMINS_STATUS_UPDATE),
  enableAdministrationAdminHandler,
);
administrationAdminRouter.post(
  "/:id/roles",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ADMINS_ROLES_UPDATE),
  validateBody(assignRoleSchema),
  assignRoleAdministrationHandler,
);
administrationAdminRouter.delete(
  "/:id/roles/:roleId",
  validateParams(adminRoleParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ADMINS_ROLES_UPDATE),
  removeRoleAdministrationHandler,
);
administrationAdminRouter.post(
  "/:id/revoke-sessions",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ADMINS_SESSIONS_REVOKE),
  revokeAdminSessionsHandler,
);
administrationAdminRouter.get(
  "/:id/sessions",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ADMINS_SESSIONS_READ),
  listAdminSessionsHandler,
);
