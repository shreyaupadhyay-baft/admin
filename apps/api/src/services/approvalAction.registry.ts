import type { Permission } from "../constants/permissions.js";
import type { AuthenticatedAdmin } from "../types/rbac.js";
import type { ApprovalRow } from "../repositories/approval.repository.js";

/**
 * The server chooses the handler by looking up a controlled actionType
 * string in this registry — a client can never supply a handler, function,
 * or URL. An unregistered actionType is rejected at request-creation time
 * (see approval.controller.ts), so an approval can only ever reference a
 * handler that existed and was deliberately registered by server code.
 */
export type ApprovalActionHandler = {
  actionType: string;
  /** Checked by the route middleware as the blanket "can approve/reject anything" gate. */
  requiredApprovalPermission: Permission;
  /** Throws an AppError (400) if metadata is invalid for this action; returns the sanitized metadata to persist. */
  validateMetadata: (metadata: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /**
   * Throws an AppError if resourceId doesn't refer to a real, eligible
   * resource for this action (e.g. a nonexistent user, or a role this action
   * type must never be allowed to target). Runs at request-creation time, so
   * an invalid or forbidden target is rejected before an approval ever exists.
   */
  validateResource?: (resourceId: string) => Promise<void>;
  /**
   * Action-specific authorization beyond the blanket permission (rule from
   * section 8: holding approvals.approve does not by itself make every
   * approval approvable). Defaults to true (no extra restriction) when omitted.
   */
  isApproverEligible?: (approver: AuthenticatedAdmin, approval: ApprovalRow) => boolean | Promise<boolean>;
  /**
   * Runs once, only after the approval's status has already been atomically
   * transitioned to 'approved' (see transitionApprovalToApproved). Returns a
   * safe result payload to store in execution_result — never raw secrets.
   * Throwing marks the approval's execution as 'failed' without undoing the
   * approval decision itself.
   */
  execute: (approval: ApprovalRow, approver: AuthenticatedAdmin) => Promise<Record<string, unknown>>;
};

const registry = new Map<string, ApprovalActionHandler>();

export const registerApprovalAction = (handler: ApprovalActionHandler): void => {
  registry.set(handler.actionType, handler);
};

export const getApprovalActionHandler = (actionType: string): ApprovalActionHandler | undefined =>
  registry.get(actionType);

export const listRegisteredActionTypes = (): string[] => [...registry.keys()];
