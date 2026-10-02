import { Router } from "express";
import { getKycHandler } from "../controllers/kyc.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateParams } from "../middleware/validate.js";
import { userIdParamSchema } from "../validation/common.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const kycRouter = Router();

kycRouter.use(authenticate);

// Lookup boundary is the BAFT user id. No endpoint accepts a provider id.
kycRouter.get("/:userId", validateParams(userIdParamSchema), requirePermission(PERMISSIONS.KYC_READ), getKycHandler);
