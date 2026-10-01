import { Router } from "express";
import {
  activateRewardHandler,
  cancelRewardHandler,
  createRewardHandler,
  expireRewardHandler,
  getRewardEntitlementHandler,
  getRewardHandler,
  listRewardsHandler,
  pauseRewardHandler,
  resumeRewardHandler,
  updateRewardHandler,
} from "../controllers/reward.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import { createRewardSchema, updateRewardSchema } from "../validation/reward.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const rewardRouter = Router();

rewardRouter.use(authenticate);

rewardRouter.get("/", requirePermission(PERMISSIONS.REWARDS_READ), listRewardsHandler);
rewardRouter.get("/:id", validateParams(idParamSchema), requirePermission(PERMISSIONS.REWARDS_READ), getRewardHandler);
rewardRouter.get(
  "/:id/entitlement",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.REWARDS_READ),
  getRewardEntitlementHandler,
);
rewardRouter.post("/", requirePermission(PERMISSIONS.REWARDS_CREATE), validateBody(createRewardSchema), createRewardHandler);
rewardRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.REWARDS_UPDATE),
  validateBody(updateRewardSchema),
  updateRewardHandler,
);
rewardRouter.post(
  "/:id/activate",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.REWARDS_ACTIVATE),
  activateRewardHandler,
);
rewardRouter.post("/:id/pause", validateParams(idParamSchema), requirePermission(PERMISSIONS.REWARDS_PAUSE), pauseRewardHandler);
rewardRouter.post(
  "/:id/resume",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.REWARDS_RESUME),
  resumeRewardHandler,
);
rewardRouter.post(
  "/:id/expire",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.REWARDS_EXPIRE),
  expireRewardHandler,
);
rewardRouter.post(
  "/:id/cancel",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.REWARDS_CANCEL),
  cancelRewardHandler,
);
