import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getTranscorpHealthHandler,
  receiveTranscorpWebhookHandler,
} from "../controllers/transcorpIntegration.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { PERMISSIONS } from "../constants/permissions.js";

/** Mounted at /system/integrations/transcorp — internal, admin-authenticated. */
export const transcorpSystemRouter = Router();
transcorpSystemRouter.use(authenticate);
// Infrastructure visibility only. Provider *data* modules use their own permissions (kyc.read, transactions.read, ...).
transcorpSystemRouter.get(
  "/health",
  requirePermission(PERMISSIONS.SYSTEM_INTEGRATIONS_READ),
  getTranscorpHealthHandler,
);

/** Mounted at /integrations/transcorp — called by Transcorp, authenticated by webhook token, not by admin session. */
export const transcorpWebhookRouter = Router();
transcorpWebhookRouter.post(
  "/webhooks",
  rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }),
  receiveTranscorpWebhookHandler,
);
