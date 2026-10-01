import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import { assertPermission } from "../middleware/requirePermission.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { getApprovalActionHandler } from "../services/approvalAction.registry.js";
import "../services/approvalActions/index.js";
import {
  createApproval,
  findApprovalByIdempotencyKey,
  findApprovalById,
  listApprovals,
  recordApprovalExecutionResult,
  transitionApprovalToApproved,
  transitionApprovalToCancelled,
  transitionApprovalToRejected,
  type ApprovalRow,
} from "../repositories/approval.repository.js";
import {
  insertApprovalEvent,
  listApprovalEvents,
  type ApprovalEventRow,
} from "../repositories/approvalEvent.repository.js";
import { listApprovalsQuerySchema } from "../validation/approval.schema.js";
import type { AuthenticatedAdmin } from "../types/rbac.js";
import { notifyAdmin, notifyAdminsWithPermission } from "../services/notification.service.js";
import { NOTIFICATION_TYPES } from "../constants/notificationTypes.js";

const serializeApproval = (a: ApprovalRow) => ({
  id: a.id,
  approvalNumber: a.approval_number,
  actionType: a.action_type,
  resourceType: a.resource_type,
  resourceId: a.resource_id,
  requestedBy: a.requested_by,
  approverAdminId: a.approver_admin_id,
  status: a.status,
  reason: a.reason,
  rejectionReason: a.rejection_reason,
  requestMetadata: a.request_metadata,
  executionStatus: a.execution_status,
  executionResult: a.execution_result,
  requestedAt: a.requested_at,
  updatedAt: a.updated_at,
  approvedAt: a.approved_at,
  rejectedAt: a.rejected_at,
  cancelledAt: a.cancelled_at,
  expiredAt: a.expired_at,
  executedAt: a.executed_at,
});

const serializeEvent = (e: ApprovalEventRow) => ({
  id: e.id,
  actorAdminId: e.actor_admin_id,
  eventType: e.event_type,
  note: e.note,
  metadata: e.metadata,
  createdAt: e.created_at,
});

const notFound = () => new AppError("APPROVAL_NOT_FOUND", "Approval not found.", 404);
const invalidTransition = (message: string) => new AppError("INVALID_TRANSITION", message, 409);

export const listApprovalsHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listApprovalsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, search, status, actionType, resourceType, requestedBy, approverAdminId, dateFrom, dateTo, sort } =
    parsed.data;
  const approvals = await listApprovals({
    limit,
    offset,
    search,
    status,
    actionType,
    resourceType,
    requestedBy,
    approverAdminId,
    dateFrom,
    dateTo,
    sort,
  });

  sendSuccess(res, 200, { approvals: approvals.map(serializeApproval) }, { limit, offset });
};

export const getApprovalHandler = async (req: Request, res: Response): Promise<void> => {
  const approval = await findApprovalById(req.params.id as string);
  if (!approval) throw notFound();
  sendSuccess(res, 200, { approval: serializeApproval(approval) });
};

export const listApprovalEventsHandler = async (req: Request, res: Response): Promise<void> => {
  const approval = await findApprovalById(req.params.id as string);
  if (!approval) throw notFound();
  const events = await listApprovalEvents(approval.id);
  sendSuccess(res, 200, { events: events.map(serializeEvent) });
};

export const createApprovalHandler = async (req: Request, res: Response): Promise<void> => {
  const { actionType, resourceType, resourceId, reason, metadata, idempotencyKey } = req.body as {
    actionType: string;
    resourceType: string;
    resourceId: string;
    reason: string;
    metadata: Record<string, unknown>;
    idempotencyKey?: string;
  };

  // Duplicate submission with the same idempotency key returns the original
  // result instead of creating a second approval request.
  if (idempotencyKey) {
    const existing = await findApprovalByIdempotencyKey(idempotencyKey);
    if (existing) {
      sendSuccess(res, 200, { approval: serializeApproval(existing), idempotentReplay: true });
      return;
    }
  }

  const handler = getApprovalActionHandler(actionType);
  if (!handler) {
    throw new AppError("UNKNOWN_ACTION_TYPE", `'${actionType}' is not a registered approval action type.`, 400);
  }

  // resourceType is declared by the caller but the handler is the sole
  // authority on whether resourceId is valid/eligible for its actionType.
  if (handler.validateResource) {
    await handler.validateResource(resourceId);
  }
  const sanitizedMetadata = await handler.validateMetadata(metadata);

  const requestedBy = req.admin?.id as string;
  const created = await createApproval({
    actionType,
    resourceType,
    resourceId,
    requestedBy,
    reason,
    metadata: sanitizedMetadata,
    idempotencyKey,
    requestId: req.requestId,
    correlationId: req.correlationId,
  });

  await insertApprovalEvent({
    approvalId: created.id,
    actorAdminId: requestedBy,
    eventType: "CREATED",
    metadata: { actionType, resourceType, resourceId },
  });
  await recordAudit(req, AUDIT_ACTIONS.APPROVAL_CREATED, {
    actorAdminId: requestedBy,
    targetType: "approval",
    targetId: created.id,
    metadata: { actionType, resourceType, resourceId },
  });

  // Recipients are whoever can act as approver for THIS action type
  // (handler.requiredApprovalPermission), not a fixed role — matching the
  // action registry's own authorization model rather than a separate,
  // possibly-inconsistent notion of "who gets notified."
  await notifyAdminsWithPermission(
    handler.requiredApprovalPermission,
    {
      type: NOTIFICATION_TYPES.APPROVAL_REQUESTED,
      title: "Approval requested",
      message: `${created.approval_number}: ${actionType} — ${reason}`,
      severity: "warning",
      resourceType: "approval",
      resourceId: created.id,
      metadata: { actionType, approvalNumber: created.approval_number },
      dedupKey: `approval_requested:${created.id}`,
    },
    { excludeAdminId: requestedBy },
  );

  sendSuccess(res, 201, { approval: serializeApproval(created) });
};

export const approveApprovalHandler = async (req: Request, res: Response): Promise<void> => {
  const approvalId = req.params.id as string;
  const approver = req.admin as AuthenticatedAdmin;

  const approval = await findApprovalById(approvalId);
  if (!approval) throw notFound();

  if (approval.status !== "requested") {
    throw invalidTransition(`Cannot approve an approval with status '${approval.status}'; it must be 'requested'.`);
  }

  // Enforced independently of any frontend control — a direct API call by
  // the requester is rejected the same way.
  if (approval.requested_by === approver.id) {
    throw new AppError("SELF_APPROVAL_DENIED", "You cannot approve your own approval request.", 403);
  }

  const handler = getApprovalActionHandler(approval.action_type);
  if (!handler) {
    throw invalidTransition(`Action type '${approval.action_type}' is no longer registered.`);
  }

  // Holding the blanket approvals.approve permission (route middleware) does
  // not by itself authorize approving every action — the specific action's
  // own required permission and eligibility rule must also pass.
  await assertPermission(req, handler.requiredApprovalPermission);
  if (handler.isApproverEligible) {
    const eligible = await handler.isApproverEligible(approver, approval);
    if (!eligible) {
      throw new AppError("NOT_ELIGIBLE_APPROVER", "You are not eligible to approve this specific approval.", 403);
    }
  }

  const updated = await transitionApprovalToApproved(approvalId, approver.id);
  if (!updated) {
    // Lost a race to a concurrent approve/reject/cancel call.
    throw invalidTransition("This approval was already transitioned by another request.");
  }

  await insertApprovalEvent({ approvalId, actorAdminId: approver.id, eventType: "APPROVED" });
  await recordAudit(req, AUDIT_ACTIONS.APPROVAL_APPROVED, {
    actorAdminId: approver.id,
    targetType: "approval",
    targetId: approvalId,
    metadata: { actionType: approval.action_type, resourceType: approval.resource_type, resourceId: approval.resource_id },
  });

  let final = updated;
  try {
    const result = await handler.execute(updated, approver);
    final = (await recordApprovalExecutionResult(approvalId, { status: "executed", result })) ?? updated;
    await insertApprovalEvent({ approvalId, actorAdminId: approver.id, eventType: "EXECUTED", metadata: result });
    await recordAudit(req, AUDIT_ACTIONS.APPROVAL_EXECUTED, {
      actorAdminId: approver.id,
      targetType: "approval",
      targetId: approvalId,
      metadata: result,
    });
  } catch (err) {
    // Execution failing does not undo the approval decision — the decision
    // was valid; the system action failed and is represented as such.
    const message = err instanceof Error ? err.message : "Unknown execution error";
    final = (await recordApprovalExecutionResult(approvalId, { status: "failed", result: { error: message } })) ?? updated;
    await insertApprovalEvent({ approvalId, actorAdminId: approver.id, eventType: "EXECUTION_FAILED", note: message });
    await recordAudit(req, AUDIT_ACTIONS.APPROVAL_EXECUTION_FAILED, {
      actorAdminId: approver.id,
      targetType: "approval",
      targetId: approvalId,
      metadata: { error: message },
    });
  }

  await notifyAdmin(approval.requested_by, {
    type: NOTIFICATION_TYPES.APPROVAL_APPROVED,
    title: "Your approval request was approved",
    message: `${approval.approval_number}: ${approval.action_type}`,
    severity: "success",
    resourceType: "approval",
    resourceId: approvalId,
    metadata: { actionType: approval.action_type, approvalNumber: approval.approval_number },
    dedupKey: `approval_approved:${approvalId}`,
  });

  sendSuccess(res, 200, { approval: serializeApproval(final) });
};

export const rejectApprovalHandler = async (req: Request, res: Response): Promise<void> => {
  const approvalId = req.params.id as string;
  const approver = req.admin as AuthenticatedAdmin;
  const { reason } = req.body as { reason: string };

  const approval = await findApprovalById(approvalId);
  if (!approval) throw notFound();

  if (approval.status !== "requested") {
    throw invalidTransition(`Cannot reject an approval with status '${approval.status}'; it must be 'requested'.`);
  }
  if (approval.requested_by === approver.id) {
    throw new AppError("SELF_APPROVAL_DENIED", "You cannot reject your own approval request.", 403);
  }

  const handler = getApprovalActionHandler(approval.action_type);
  if (!handler) {
    throw invalidTransition(`Action type '${approval.action_type}' is no longer registered.`);
  }
  await assertPermission(req, handler.requiredApprovalPermission);
  if (handler.isApproverEligible) {
    const eligible = await handler.isApproverEligible(approver, approval);
    if (!eligible) {
      throw new AppError("NOT_ELIGIBLE_APPROVER", "You are not eligible to decide this specific approval.", 403);
    }
  }

  const updated = await transitionApprovalToRejected(approvalId, approver.id, reason);
  if (!updated) {
    throw invalidTransition("This approval was already transitioned by another request.");
  }

  await insertApprovalEvent({ approvalId, actorAdminId: approver.id, eventType: "REJECTED", note: reason });
  await recordAudit(req, AUDIT_ACTIONS.APPROVAL_REJECTED, {
    actorAdminId: approver.id,
    targetType: "approval",
    targetId: approvalId,
    metadata: { reason },
  });

  await notifyAdmin(approval.requested_by, {
    type: NOTIFICATION_TYPES.APPROVAL_REJECTED,
    title: "Your approval request was rejected",
    message: `${approval.approval_number}: ${approval.action_type} — ${reason}`,
    severity: "warning",
    resourceType: "approval",
    resourceId: approvalId,
    metadata: { actionType: approval.action_type, approvalNumber: approval.approval_number, reason },
    dedupKey: `approval_rejected:${approvalId}`,
  });

  sendSuccess(res, 200, { approval: serializeApproval(updated) });
};

export const cancelApprovalHandler = async (req: Request, res: Response): Promise<void> => {
  const approvalId = req.params.id as string;
  const actor = req.admin as AuthenticatedAdmin;

  const approval = await findApprovalById(approvalId);
  if (!approval) throw notFound();

  // The requester may always withdraw their own pending request; anyone else
  // needs the general approvals.cancel permission.
  if (approval.requested_by !== actor.id) {
    await assertPermission(req, PERMISSIONS.APPROVALS_CANCEL);
  }

  if (approval.status !== "requested") {
    throw invalidTransition(`Cannot cancel an approval with status '${approval.status}'; it must be 'requested'.`);
  }

  const updated = await transitionApprovalToCancelled(approvalId);
  if (!updated) {
    throw invalidTransition("This approval was already transitioned by another request.");
  }

  await insertApprovalEvent({ approvalId, actorAdminId: actor.id, eventType: "CANCELLED" });
  await recordAudit(req, AUDIT_ACTIONS.APPROVAL_CANCELLED, {
    actorAdminId: actor.id,
    targetType: "approval",
    targetId: approvalId,
  });

  sendSuccess(res, 200, { approval: serializeApproval(updated) });
};
