import { Router } from "express";
import {
  forceLogoutHandler,
  requestBlockHandler,
  requestUnblockHandler,
  revokeSessionsHandler,
} from "../controllers/securityAction.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { userIdParamSchema } from "../validation/common.schema.js";
import { forceLogoutSchema, requestBlockSchema, requestUnblockSchema, revokeSessionsSchema } from "../validation/securityAction.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const securityUserRouter = Router();

securityUserRouter.use(authenticate);

securityUserRouter.post(
  "/:userId/block/request",
  validateParams(userIdParamSchema),
  requirePermission(PERMISSIONS.SECURITY_ACTIONS_REQUEST),
  validateBody(requestBlockSchema),
  requestBlockHandler,
);
securityUserRouter.post(
  "/:userId/unblock/request",
  validateParams(userIdParamSchema),
  requirePermission(PERMISSIONS.SECURITY_ACTIONS_REQUEST),
  validateBody(requestUnblockSchema),
  requestUnblockHandler,
);
securityUserRouter.post(
  "/:userId/force-logout",
  validateParams(userIdParamSchema),
  requirePermission(PERMISSIONS.SECURITY_ACTIONS_FORCE_LOGOUT),
  validateBody(forceLogoutSchema),
  forceLogoutHandler,
);
securityUserRouter.post(
  "/:userId/revoke-sessions",
  validateParams(userIdParamSchema),
  requirePermission(PERMISSIONS.SECURITY_ACTIONS_REVOKE_SESSIONS),
  validateBody(revokeSessionsSchema),
  revokeSessionsHandler,
);
