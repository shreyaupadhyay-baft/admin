import { Router } from "express";
import {
  createAdministrationRoleHandler,
  disableRoleHandler,
  enableRoleHandler,
  getAdministrationRoleHandler,
  listAdministrationRolesHandler,
  updateAdministrationRoleHandler,
  updateRolePermissionsHandler,
} from "../controllers/administrationRole.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { createRoleSchema } from "../validation/role.schema.js";
import { updateAdministrationRoleSchema, updateRolePermissionsSchema } from "../validation/administration.schema.js";
import { idParamSchema } from "../validation/common.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const administrationRoleRouter = Router();

administrationRoleRouter.use(authenticate);

administrationRoleRouter.get(
  "/",
  requirePermission(PERMISSIONS.ADMINISTRATION_ROLES_READ),
  listAdministrationRolesHandler,
);
administrationRoleRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ROLES_READ),
  getAdministrationRoleHandler,
);
administrationRoleRouter.post(
  "/",
  requirePermission(PERMISSIONS.ADMINISTRATION_ROLES_CREATE),
  validateBody(createRoleSchema),
  createAdministrationRoleHandler,
);
administrationRoleRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ROLES_UPDATE),
  validateBody(updateAdministrationRoleSchema),
  updateAdministrationRoleHandler,
);
administrationRoleRouter.post(
  "/:id/enable",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ROLES_STATUS_UPDATE),
  enableRoleHandler,
);
administrationRoleRouter.post(
  "/:id/disable",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ROLES_STATUS_UPDATE),
  disableRoleHandler,
);
administrationRoleRouter.put(
  "/:id/permissions",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_ROLES_PERMISSIONS_UPDATE),
  validateBody(updateRolePermissionsSchema),
  updateRolePermissionsHandler,
);
