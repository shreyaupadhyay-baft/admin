import { Router } from "express";
import {
  createUserHandler,
  getUserHandler,
  getUserOverviewHandler,
  listUsersHandler,
  updateUserHandler,
  updateUserStatusHandler,
} from "../controllers/user.controller.js";
import { listBeneficiariesForUserHandler } from "../controllers/beneficiary.controller.js";
import { listDevicesForUserHandler } from "../controllers/device.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { createUserSchema, updateUserSchema, updateUserStatusSchema } from "../validation/user.schema.js";
import { idParamSchema } from "../validation/common.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get("/", requirePermission(PERMISSIONS.USERS_READ), listUsersHandler);
userRouter.get("/:id", validateParams(idParamSchema), requirePermission(PERMISSIONS.USERS_READ), getUserHandler);
userRouter.get(
  "/:id/overview",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.USERS_READ),
  getUserOverviewHandler,
);
userRouter.get(
  "/:id/devices",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.DEVICES_READ),
  listDevicesForUserHandler,
);
// Provider-sourced; keyed by the BAFT user id only. No provider id is accepted anywhere.
userRouter.get(
  "/:id/beneficiaries",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.BENEFICIARIES_READ),
  listBeneficiariesForUserHandler,
);
userRouter.post("/", requirePermission(PERMISSIONS.USERS_CREATE), validateBody(createUserSchema), createUserHandler);
userRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.USERS_UPDATE),
  validateBody(updateUserSchema),
  updateUserHandler,
);
userRouter.patch(
  "/:id/status",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.USERS_STATUS_UPDATE),
  validateBody(updateUserStatusSchema),
  updateUserStatusHandler,
);
