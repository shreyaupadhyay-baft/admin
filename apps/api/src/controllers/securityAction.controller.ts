import type { Request, Response } from "express";
import { AppError, sendSuccess } from "../utils/response.js";
import { recordAudit } from "../services/audit.service.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import {
  approveAndExecuteSecurityAction,
  createExecutedSecurityAction,
  createRequestedSecurityAction,
  findSecurityActionById,
  listSecurityActions,
  rejectSecurityAction,
  type SecurityActionRow,
} from "../repositories/securityAction.repository.js";
import { findUserById, updateUserSecurityStatus } from "../repositories/user.repository.js";
import { revokeAllActiveUserSessions } from "../repositories/userSession.repository.js";
import { listSecurityActionsQuerySchema } from "../validation/securityAction.schema.js";
import { notifyAdmin, notifyRole } from "../services/notification.service.js";
import { NOTIFICATION_TYPES } from "../constants/notificationTypes.js";

const serializeAction = (a: SecurityActionRow) => ({
  id: a.id,
  userId: a.user_id,
  actionType: a.action_type,
  status: a.status,
  reason: a.reason,
  requestedBy: a.requested_by,
  approvedBy: a.approved_by,
  requestedAt: a.requested_at,
  approvedAt: a.approved_at,
  executedAt: a.executed_at,
  rejectedAt: a.rejected_at,
});

const notFound = () => new AppError("SECURITY_ACTION_NOT_FOUND", "Security action not found.", 404);

export const listSecurityActionsHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = listSecurityActionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  }

  const { limit = 50, offset = 0, status, actionType, userId } = parsed.data;
  const actions = await listSecurityActions({ limit, offset, status, actionType, userId });

  sendSuccess(res, 200, { actions: actions.map(serializeAction) }, { limit, offset });
};

export const getSecurityActionHandler = async (req: Request, res: Response): Promise<void> => {
  const action = await findSecurityActionById(req.params.id as string);
  if (!action) throw notFound();
  sendSuccess(res, 200, { action: serializeAction(action) });
};

export const requestBlockHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = req.params.userId as string;
  const { reason } = req.body as { reason: string };

  const user = await findUserById(userId);
  if (!user) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  if (user.security_status === "blocked") {
    throw new AppError("ALREADY_BLOCKED", "This user is already blocked.", 409);
  }

  const requestedBy = req.admin?.id as string;
  const action = await createRequestedSecurityAction({ userId, actionType: "block_user", reason, requestedBy });

  await recordAudit(req, AUDIT_ACTIONS.SECURITY_ACTION_REQUESTED, {
    actorAdminId: requestedBy,
    targetType: "security_action",
    targetId: action.id,
    metadata: { userId, actionType: "block_user", reason },
  });

  await notifyRole(
    "Security Admin",
    {
      type: NOTIFICATION_TYPES.SECURITY_ACTION_REQUESTED,
      title: "Security action requires approval",
      message: `Block user requested: ${reason}`,
      severity: "warning",
      resourceType: "security_action",
      resourceId: action.id,
      metadata: { actionType: "block_user" },
      dedupKey: `security_action_requested:${action.id}`,
    },
    { excludeAdminId: requestedBy },
  );

  sendSuccess(res, 201, { action: serializeAction(action) });
};

export const requestUnblockHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = req.params.userId as string;
  const { reason } = req.body as { reason: string };

  const user = await findUserById(userId);
  if (!user) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  if (user.security_status === "normal") {
    throw new AppError("NOT_BLOCKED", "This user is not currently blocked.", 409);
  }

  const requestedBy = req.admin?.id as string;
  const action = await createRequestedSecurityAction({ userId, actionType: "unblock_user", reason, requestedBy });

  await recordAudit(req, AUDIT_ACTIONS.SECURITY_ACTION_REQUESTED, {
    actorAdminId: requestedBy,
    targetType: "security_action",
    targetId: action.id,
    metadata: { userId, actionType: "unblock_user", reason },
  });

  await notifyRole(
    "Security Admin",
    {
      type: NOTIFICATION_TYPES.SECURITY_ACTION_REQUESTED,
      title: "Security action requires approval",
      message: `Unblock user requested: ${reason}`,
      severity: "warning",
      resourceType: "security_action",
      resourceId: action.id,
      metadata: { actionType: "unblock_user" },
      dedupKey: `security_action_requested:${action.id}`,
    },
    { excludeAdminId: requestedBy },
  );

  sendSuccess(res, 201, { action: serializeAction(action) });
};

export const approveSecurityActionHandler = async (req: Request, res: Response): Promise<void> => {
  const actionId = req.params.id as string;
  const approverId = req.admin?.id as string;

  const action = await findSecurityActionById(actionId);
  if (!action) throw notFound();

  if (action.status !== "requested") {
    throw new AppError(
      "INVALID_TRANSITION",
      `Cannot approve an action with status '${action.status}'; it must be 'requested'.`,
      409,
    );
  }

  // The backend enforces this independently of any frontend control.
  if (action.requested_by === approverId) {
    throw new AppError("FORBIDDEN", "You cannot approve your own security action request.", 403);
  }

  const targetUser = await findUserById(action.user_id);
  if (!targetUser) throw new AppError("USER_NOT_FOUND", "The target user no longer exists.", 400);

  if (action.action_type === "block_user") {
    await updateUserSecurityStatus(action.user_id, "blocked");
  } else if (action.action_type === "unblock_user") {
    await updateUserSecurityStatus(action.user_id, "normal");
  }

  const updated = await approveAndExecuteSecurityAction(actionId, approverId);
  if (!updated) {
    throw new AppError("INVALID_TRANSITION", "This action was already transitioned by another request.", 409);
  }

  await recordAudit(req, AUDIT_ACTIONS.SECURITY_ACTION_APPROVED, {
    actorAdminId: approverId,
    targetType: "security_action",
    targetId: actionId,
    metadata: { userId: action.user_id, actionType: action.action_type },
  });

  await notifyAdmin(action.requested_by, {
    type: NOTIFICATION_TYPES.SECURITY_ACTION_APPROVED,
    title: "Your security action was approved",
    message: `${action.action_type.replace("_", " ")} was approved and executed`,
    severity: "success",
    resourceType: "security_action",
    resourceId: actionId,
    metadata: { actionType: action.action_type },
    dedupKey: `security_action_approved:${actionId}`,
  });

  sendSuccess(res, 200, { action: serializeAction(updated) });
};

export const rejectSecurityActionHandler = async (req: Request, res: Response): Promise<void> => {
  const actionId = req.params.id as string;
  const { reason } = req.body as { reason?: string };

  const action = await findSecurityActionById(actionId);
  if (!action) throw notFound();

  if (action.status !== "requested") {
    throw new AppError(
      "INVALID_TRANSITION",
      `Cannot reject an action with status '${action.status}'; it must be 'requested'.`,
      409,
    );
  }

  const updated = await rejectSecurityAction(actionId);
  if (!updated) {
    throw new AppError("INVALID_TRANSITION", "This action was already transitioned by another request.", 409);
  }

  await recordAudit(req, AUDIT_ACTIONS.SECURITY_ACTION_REJECTED, {
    actorAdminId: req.admin?.id ?? null,
    targetType: "security_action",
    targetId: actionId,
    metadata: { userId: action.user_id, actionType: action.action_type, reason },
  });

  await notifyAdmin(action.requested_by, {
    type: NOTIFICATION_TYPES.SECURITY_ACTION_REJECTED,
    title: "Your security action was rejected",
    message: reason ? `${action.action_type.replace("_", " ")} was rejected: ${reason}` : `${action.action_type.replace("_", " ")} was rejected`,
    severity: "warning",
    resourceType: "security_action",
    resourceId: actionId,
    metadata: { actionType: action.action_type, reason },
    dedupKey: `security_action_rejected:${actionId}`,
  });

  sendSuccess(res, 200, { action: serializeAction(updated) });
};

export const forceLogoutHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = req.params.userId as string;
  const { reason } = req.body as { reason: string };

  const user = await findUserById(userId);
  if (!user) throw new AppError("USER_NOT_FOUND", "User not found.", 404);

  await revokeAllActiveUserSessions(userId);

  const requestedBy = req.admin?.id as string;
  const action = await createExecutedSecurityAction({ userId, actionType: "force_logout", reason, requestedBy });

  await recordAudit(req, AUDIT_ACTIONS.SECURITY_FORCE_LOGOUT, {
    actorAdminId: requestedBy,
    targetType: "user",
    targetId: userId,
    metadata: { reason },
  });

  sendSuccess(res, 201, { action: serializeAction(action) });
};

export const revokeSessionsHandler = async (req: Request, res: Response): Promise<void> => {
  const userId = req.params.userId as string;
  const { reason } = req.body as { reason: string };

  const user = await findUserById(userId);
  if (!user) throw new AppError("USER_NOT_FOUND", "User not found.", 404);

  await revokeAllActiveUserSessions(userId);

  const requestedBy = req.admin?.id as string;
  const action = await createExecutedSecurityAction({ userId, actionType: "revoke_sessions", reason, requestedBy });

  await recordAudit(req, AUDIT_ACTIONS.SECURITY_SESSIONS_REVOKED, {
    actorAdminId: requestedBy,
    targetType: "user",
    targetId: userId,
    metadata: { reason },
  });

  sendSuccess(res, 201, { action: serializeAction(action) });
};
