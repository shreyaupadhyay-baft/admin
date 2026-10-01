import { Router } from "express";
import { getSecurityPostureHandler } from "../controllers/securityPosture.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const securityPostureRouter = Router();

securityPostureRouter.use(authenticate);

// Gated on security_cases.read: posture is a summary rollup of the same
// cases/events/actions data, not a new permission for one endpoint.
securityPostureRouter.get("/", requirePermission(PERMISSIONS.SECURITY_CASES_READ), getSecurityPostureHandler);
