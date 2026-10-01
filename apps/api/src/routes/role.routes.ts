import { Router } from "express";
import { createRoleHandler, getRoleHandler, listRolesHandler, updateRoleHandler } from "../controllers/role.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { createRoleSchema, updateRoleSchema } from "../validation/role.schema.js";
import { idParamSchema } from "../validation/common.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const roleRouter = Router();

roleRouter.use(authenticate);

roleRouter.get("/", requirePermission(PERMISSIONS.ROLES_READ), listRolesHandler);
roleRouter.get("/:id", validateParams(idParamSchema), requirePermission(PERMISSIONS.ROLES_READ), getRoleHandler);
roleRouter.post("/", requirePermission(PERMISSIONS.ROLES_CREATE), validateBody(createRoleSchema), createRoleHandler);
roleRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.ROLES_UPDATE),
  validateBody(updateRoleSchema),
  updateRoleHandler,
);
