import { Router } from "express";
import {
  getFeaturesHandler,
  getFinancialHandler,
  getOnboardingHandler,
  getOverviewHandler,
  getRetentionHandler,
  getRewardsHandler,
  getUsageHandler,
} from "../controllers/analytics.controller.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

// One permission per section. Read-only: no write verbs, no export, no user-level drill-down.
analyticsRouter.get("/overview", requirePermission(PERMISSIONS.ANALYTICS_OVERVIEW_READ), getOverviewHandler);
analyticsRouter.get("/onboarding", requirePermission(PERMISSIONS.ANALYTICS_ONBOARDING_READ), getOnboardingHandler);
analyticsRouter.get("/features", requirePermission(PERMISSIONS.ANALYTICS_FEATURES_READ), getFeaturesHandler);
analyticsRouter.get("/retention", requirePermission(PERMISSIONS.ANALYTICS_RETENTION_READ), getRetentionHandler);
analyticsRouter.get("/usage", requirePermission(PERMISSIONS.ANALYTICS_USAGE_READ), getUsageHandler);
analyticsRouter.get("/rewards", requirePermission(PERMISSIONS.ANALYTICS_REWARDS_READ), getRewardsHandler);
analyticsRouter.get("/financial", requirePermission(PERMISSIONS.ANALYTICS_FINANCIAL_READ), getFinancialHandler);
