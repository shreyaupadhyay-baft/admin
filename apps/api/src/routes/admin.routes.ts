import { Router } from "express";
import {
  assignRoleHandler,
  createAdminHandler,
  disableAdminHandler,
  enableAdminHandler,
  getAdminHandler,
  listAdminsHandler,
  removeRoleHandler,
  updateAdminHandler,
} from "../controllers/admin.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { assignRoleSchema, createAdminSchema, updateAdminSchema } from "../validation/admin.schema.js";
import { adminRoleParamSchema, idParamSchema } from "../validation/common.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const adminRouter = Router();

adminRouter.use(authenticate);

adminRouter.get("/", requirePermission(PERMISSIONS.ADMINS_READ), listAdminsHandler);
adminRouter.get("/:id", validateParams(idParamSchema), requirePermission(PERMISSIONS.ADMINS_READ), getAdminHandler);
adminRouter.post("/", requirePermission(PERMISSIONS.ADMINS_CREATE), validateBody(createAdminSchema), createAdminHandler);
adminRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINS_UPDATE),
  validateBody(updateAdminSchema),
  updateAdminHandler,
);
adminRouter.post(
  "/:id/disable",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINS_DISABLE),
  disableAdminHandler,
);
adminRouter.post(
  "/:id/enable",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINS_ENABLE),
  enableAdminHandler,
);
adminRouter.post(
  "/:id/roles",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ADMINS_ASSIGN_ROLE),
  validateBody(assignRoleSchema),
  assignRoleHandler,
);
adminRouter.delete(
  "/:id/roles/:roleId",
  validateParams(adminRoleParamSchema),
  requirePermission(PERMISSIONS.ADMINS_REMOVE_ROLE),
  removeRoleHandler,
);
