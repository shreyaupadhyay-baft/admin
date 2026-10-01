import { Router } from "express";
import { getPermissionHandler, listPermissionsHandler } from "../controllers/permission.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const permissionRouter = Router();

permissionRouter.use(authenticate);

permissionRouter.get("/", requirePermission(PERMISSIONS.PERMISSIONS_READ), listPermissionsHandler);
permissionRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.PERMISSIONS_READ),
  getPermissionHandler,
);
