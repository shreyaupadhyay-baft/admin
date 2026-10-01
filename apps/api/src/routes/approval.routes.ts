import { Router } from "express";
import {
  approveApprovalHandler,
  cancelApprovalHandler,
  createApprovalHandler,
  getApprovalHandler,
  listApprovalEventsHandler,
  listApprovalsHandler,
  rejectApprovalHandler,
} from "../controllers/approval.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.schema.js";
import { createApprovalSchema, rejectApprovalSchema } from "../validation/approval.schema.js";
import { PERMISSIONS } from "../constants/permissions.js";

export const approvalRouter = Router();

approvalRouter.use(authenticate);

approvalRouter.get("/", requirePermission(PERMISSIONS.APPROVALS_READ), listApprovalsHandler);
approvalRouter.get(
  "/:id",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.APPROVALS_READ),
  getApprovalHandler,
);
approvalRouter.get(
  "/:id/events",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.APPROVALS_EVENTS_READ),
  listApprovalEventsHandler,
);
approvalRouter.post(
  "/",
  requirePermission(PERMISSIONS.APPROVALS_CREATE),
  validateBody(createApprovalSchema),
  createApprovalHandler,
);
// The blanket approvals.approve/reject permission is checked here; the
// action-specific requiredApprovalPermission and isApproverEligible checks
// run inside the handler, and self-approval is rejected there regardless of
// permission.
approvalRouter.post(
  "/:id/approve",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.APPROVALS_APPROVE),
  approveApprovalHandler,
);
approvalRouter.post(
  "/:id/reject",
  validateParams(idParamSchema),
  requirePermission(PERMISSIONS.APPROVALS_REJECT),
  validateBody(rejectApprovalSchema),
  rejectApprovalHandler,
);
// No blanket requirePermission here — the handler itself allows the
// requester to cancel their own pending request, or otherwise requires
// approvals.cancel.
approvalRouter.post("/:id/cancel", validateParams(idParamSchema), cancelApprovalHandler);
