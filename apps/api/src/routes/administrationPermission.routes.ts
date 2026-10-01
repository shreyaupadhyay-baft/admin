import { Router } from "express";
import {
  getAdministrationPermissionHandler,
  listAdministrationPermissionsHandler,
} from "../controllers/administrationPermission.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const administrationPermissionRouter = Router();

administrationPermissionRouter.use(authenticate);

administrationPermissionRouter.get(
  "/",
  requirePermission(PERMISSIONS.ADMINISTRATION_PERMISSIONS_READ),
  listAdministrationPermissionsHandler,
);
administrationPermissionRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINISTRATION_PERMISSIONS_READ),
  getAdministrationPermissionHandler,
);
