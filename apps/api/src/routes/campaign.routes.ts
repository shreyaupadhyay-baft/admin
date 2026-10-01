import { Router } from "express";
import {
  activateCampaignHandler,
  cancelCampaignHandler,
  completeCampaignHandler,
  createCampaignHandler,
  getCampaignHandler,
  listCampaignsHandler,
  scheduleCampaignHandler,
  updateCampaignHandler,
} from "../controllers/campaign.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import { createCampaignSchema, scheduleCampaignSchema, updateCampaignSchema } from "../validation/campaign.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const campaignRouter = Router();

campaignRouter.use(authenticate);

campaignRouter.get("/", requirePermission(PERMISSIONS.CAMPAIGNS_READ), listCampaignsHandler);
campaignRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.CAMPAIGNS_READ),
  getCampaignHandler,
);
campaignRouter.post(
  "/",
  requirePermission(PERMISSIONS.CAMPAIGNS_CREATE),
  validateBody(createCampaignSchema),
  createCampaignHandler,
);
campaignRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.CAMPAIGNS_UPDATE),
  validateBody(updateCampaignSchema),
  updateCampaignHandler,
);
campaignRouter.post(
  "/:id/schedule",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.CAMPAIGNS_SCHEDULE),
  validateBody(scheduleCampaignSchema),
  scheduleCampaignHandler,
);
campaignRouter.post(
  "/:id/activate",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.CAMPAIGNS_ACTIVATE),
  activateCampaignHandler,
);
campaignRouter.post(
  "/:id/complete",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.CAMPAIGNS_COMPLETE),
  completeCampaignHandler,
);
campaignRouter.post(
  "/:id/cancel",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.CAMPAIGNS_CANCEL),
  cancelCampaignHandler,
);
